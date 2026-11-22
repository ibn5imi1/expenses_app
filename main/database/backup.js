const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const { conn, open, close } = require("./connection");
const { createTables, seed, migrate } = require("./schema");
const { syncCash } = require("./cash-sync");
const { getSetting, setSetting, round2 } = require("./helpers");

const SQLITE_HEADER = "SQLite format 3\0";
const REQUIRED_TABLES = [
  "users",
  "expenses",
  "loans",
  "loan_types",
  "destinations",
  "settings",
];
const KEEP_SAFETY_COPIES = 10;

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const tempFile = () =>
  path.join(
    os.tmpdir(),
    `college-${process.pid}-${crypto.randomBytes(6).toString("hex")}.db`,
  );
const removeDbFiles = (file) =>
  [file, `${file}-wal`, `${file}-shm`, `${file}-journal`].forEach((f) =>
    fs.rmSync(f, { force: true }),
  );
const clean = (v) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v;

function fsMessage(err) {
  switch (err && err.code) {
    case "ENOSPC":
      return "لا توجد مساحة كافية في المكان المختار";
    case "EACCES":
    case "EPERM":
    case "EROFS":
      return "لا تملك صلاحية الكتابة في هذا المكان";
    case "ENOENT":
    case "ENODEV":
    case "EIO":
      return "تعذر الوصول إلى المكان المختار، تأكد أن الفلاشة متصلة";
    case "EBUSY":
      return "الملف مستخدم من برنامج آخر";
    default:
      return "تعذر حفظ الملف في المكان المختار";
  }
}

/* ---------- لقطة كاملة من قاعدة البيانات الحالية (ملف واحد متسق) ---------- */
async function snapshotBuffer() {
  const tmp = tempFile();
  try {
    await conn.db.backup(tmp);
    const copy = new Database(tmp);
    copy.pragma("journal_mode = DELETE"); // ملف واحد بدون ملفات جانبية
    copy.close();
    return fs.readFileSync(tmp);
  } finally {
    removeDbFiles(tmp);
  }
}

/* ---------- حفظ نسخة احتياطية في مجلد ---------- */
async function createBackupFile(folder) {
  const fileName = `college-backup-${stamp()}.bak`;
  const target = path.join(folder, fileName);
  const part = `${target}.part`;
  const buffer = await snapshotBuffer();

  try {
    await fs.promises.writeFile(part, buffer);
    await fs.promises.rename(part, target);
    if (fs.statSync(target).size !== buffer.length) {
      fs.rmSync(target, { force: true });
      throw Object.assign(new Error("size"), { code: "EIO" });
    }
  } catch (err) {
    fs.rmSync(part, { force: true });
    throw new Error(fsMessage(err));
  }

  setSetting("last_backup_at", new Date().toISOString());
  return { fileName, size: buffer.length };
}

function getBackupInfo() {
  return {
    lastBackup: getSetting("last_backup_at"),
    lastImport: getSetting("last_import_at"),
  };
}

/* ---------- فحص ملف نسخة قبل استخدامه ---------- */
function copyToTemp(file) {
  const tmp = tempFile();
  try {
    fs.copyFileSync(file, tmp); // لا نفتح ملف المستخدم مباشرة حتى لا نعدّل عليه
  } catch (err) {
    throw new Error("تعذر قراءة الملف المختار");
  }
  return tmp;
}

function inspectTemp(tmp) {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(tmp, "r");
  try {
    fs.readSync(fd, head, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (head.toString("latin1") !== SQLITE_HEADER) {
    throw new Error("الملف ليس نسخة احتياطية صالحة لهذا البرنامج");
  }

  let probe;
  try {
    probe = new Database(tmp);
    const tables = new Set(
      probe
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .pluck()
        .all(),
    );
    if (REQUIRED_TABLES.some((t) => !tables.has(t)))
      throw new Error("الملف ليس نسخة من هذا البرنامج");
    if (probe.pragma("integrity_check", { simple: true }) !== "ok")
      throw new Error("ملف النسخة تالف");

    const row = probe
      .prepare("SELECT value FROM settings WHERE key = 'schema_version'")
      .get();
    const mine = Number(getSetting("schema_version") || 0);
    if (row && Number(row.value) > mine)
      throw new Error("هذه النسخة أحدث من البرنامج، حدّث البرنامج أولاً");
    if (
      !probe
        .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")
        .get().c
    ) {
      throw new Error("النسخة لا تحتوي حساب أدمن");
    }

    const count = (t) =>
      probe.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    return {
      expenses: count("expenses"),
      loans: count("loans"),
      users: count("users"),
      destinations: count("destinations"),
    };
  } catch (err) {
    if (err.constructor === Error) throw err; // رسائلنا
    throw new Error("تعذر قراءة الملف، قد يكون تالفاً");
  } finally {
    if (probe) probe.close();
  }
}

function inspectBackupFile(file) {
  const tmp = copyToTemp(file);
  try {
    return inspectTemp(tmp);
  } finally {
    removeDbFiles(tmp);
  }
}

/* ---------- نسخة أمان قبل أي استيراد ---------- */
async function makeSafetyCopy() {
  const dir = path.join(path.dirname(conn.file), "backups");
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `before-import-${stamp()}.bak`);
  fs.writeFileSync(file, await snapshotBuffer());

  const old = fs
    .readdirSync(dir)
    .filter((f) => /^before-import-.*\.bak$/.test(f))
    .sort();
  old
    .slice(0, Math.max(0, old.length - KEEP_SAFETY_COPIES))
    .forEach((f) => fs.rmSync(path.join(dir, f), { force: true }));
  return file;
}

/* ---------- الاستيراد: إضافة فوق البيانات الحالية ---------- */
const expenseKey = (r) =>
  [r.created_at, r.created_by, Number(r.amount), r.date, clean(r.details)].join(
    "|",
  );
const loanKey = (r) =>
  [r.created_at, r.created_by, Number(r.amount), r.date, r.sourceName].join(
    "|",
  );

function mergeTables(src) {
  const db = conn.db;
  const has = (t) =>
    !!src
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(t);
  const byId = (t) =>
    has(t)
      ? new Map(
          src
            .prepare(`SELECT * FROM ${t}`)
            .all()
            .map((r) => [r.id, r]),
        )
      : new Map();

    const stats = {
        destinations: 0, spenders: 0, sources: 0,
        users: { added: 0, skipped: 0 },
        expenses: { added: 0, skipped: 0, invalid: 0 },
        loans: { added: 0, skipped: 0, invalid: 0 },
    };

  const srcDest = byId("destinations");
  const srcSpn = byId("spenders");
  const srcSrc = byId("loan_types");

  // الأسماء تُطابَق بالاسم لا بالرقم (الأرقام تختلف بين الأجهزة)
  const find = {
    destinations: db.prepare("SELECT id FROM destinations WHERE name = ?"),
    spenders: db.prepare("SELECT id FROM spenders WHERE name = ?"),
    loan_types: db.prepare("SELECT id FROM loan_types WHERE name = ?"),
  };
  const add = {
    destinations: db.prepare("INSERT INTO destinations (name) VALUES (?)"),
    spenders: db.prepare(
      "INSERT INTO spenders (name, is_active) VALUES (?, ?)",
    ),
    loan_types: db.prepare(
      "INSERT INTO loan_types (name, is_active) VALUES (?, ?)",
    ),
  };

  function ensure(table, counter, name, active = 1) {
    const n = clean(name);
    if (!n) return null;
    const found = find[table].get(n);
    if (found) return found.id;
    stats[counter]++;
    const run =
      table === "destinations" ? add[table].run(n) : add[table].run(n, active);
    return Number(run.lastInsertRowid);
  }

  const flag = (r) => (r.is_active === 0 ? 0 : 1);
  const destId = (r) =>
    r ? ensure("destinations", "destinations", r.name) : null;
  const spnId = (r) =>
    r ? ensure("spenders", "spenders", r.name, flag(r)) : null;
  const srcId = (r) =>
    r ? ensure("loan_types", "sources", r.name, flag(r)) : null;

  // القوائم الفعّالة في الملف تُضاف كلها، حتى التي لا سجلات لها بعد
  srcDest.forEach((r) => destId(r));
  srcSpn.forEach((r) => {
    if (r.is_active !== 0) spnId(r);
  });
  srcSrc.forEach((r) => {
    if (r.is_active !== 0) srcId(r);
  });

      /* --- المستخدمون: يُضاف المحاسبون الجدد فقط (بحسب اسم المستخدم) --- */
    if (has('users')) {
        const usernames = new Set(db.prepare('SELECT username FROM users').pluck().all().map(u => u.toLowerCase()));
        const names = new Set(db.prepare('SELECT display_name FROM users').pluck().all().filter(Boolean));
        const insertUser = db.prepare(
            `INSERT INTO users (username, display_name, password_hash, role, created_at)
             VALUES (?, ?, ?, 'accountant', ?)`,
        );

        for (const u of src.prepare("SELECT * FROM users WHERE role = 'accountant' ORDER BY id").all()) {
            const username = clean(u.username);
            if (!username || !u.password_hash) continue;

            if (usernames.has(username.toLowerCase())) {
                stats.users.skipped++;
                continue;
            }

            let display = clean(u.display_name) || username;
            if (names.has(display)) display = `${display} (${username})`;

            insertUser.run(username, display, u.password_hash, u.created_at || new Date().toISOString());
            usernames.add(username.toLowerCase());
            names.add(display);
            stats.users.added++;
        }
    }

  /* --- المصروفات --- */
  if (has("expenses")) {
    const existing = new Map();
    db.prepare(
      "SELECT id, amount, details, date, created_at, created_by FROM expenses",
    )
      .all()
      .forEach((r) => existing.set(expenseKey(r), r.id));

    const insert = db.prepare(
      `INSERT INTO expenses
               (amount, details, date, note, destination_id, spender_id, loan_type_id,
                remaining, cash_out, settles_id, receipt_no, created_by, created_at, updated_by, updated_at)
             VALUES
               (@amount, @details, @date, @note, @destination_id, @spender_id, @loan_type_id,
                @remaining, @cash_out, @settles_id, @receipt_no, @created_by, @created_at, @updated_by, @updated_at)`,
    );

    const idMap = new Map(); // رقم القيد في الملف -> رقمه عندنا (لربط التسديدات بأصولها)

    for (const r of src.prepare("SELECT * FROM expenses ORDER BY id").all()) {
      if (
        !(Number(r.amount) > 0) ||
        !r.date ||
        !r.details ||
        !r.created_by ||
        !r.created_at
      ) {
        stats.expenses.invalid++;
        continue;
      }

      const key = expenseKey(r);
      if (existing.has(key)) {
        idMap.set(r.id, existing.get(key));
        stats.expenses.skipped++;
        continue;
      }

      const destination = destId(srcDest.get(r.destination_id));
      if (!destination) {
        stats.expenses.invalid++;
        continue;
      }

      let settles = null;
      if (r.settles_id) {
        settles = idMap.get(r.settles_id) ?? null;
        if (!settles) {
          stats.expenses.invalid++;
          continue;
        }
      }

      const amount = Number(r.amount);
      const remaining = Number(r.remaining || 0);
      const id = Number(
        insert.run({
          amount,
          details: r.details,
          date: r.date,
          note: r.note || "",
          destination_id: destination,
          spender_id:
            r.spender_id != null ? spnId(srcSpn.get(r.spender_id)) : null,
          loan_type_id:
            r.loan_type_id != null ? srcId(srcSrc.get(r.loan_type_id)) : null,
          remaining,
          cash_out:
            r.cash_out != null
              ? Number(r.cash_out)
              : round2(amount - remaining),
          settles_id: settles,
          receipt_no: r.receipt_no || "",
          created_by: r.created_by,
          created_at: r.created_at,
          updated_by: r.updated_by ?? null,
          updated_at: r.updated_at ?? null,
        }).lastInsertRowid,
      );

      idMap.set(r.id, id);
      existing.set(key, id);
      stats.expenses.added++;
    }
  }

  /* --- المقبوضات (الخصم يُعاد حسابه تلقائياً بعد الاستيراد) --- */
  if (has("loans")) {
    const existing = new Set();
    db.prepare(
      `SELECT l.amount, l.date, l.created_at, l.created_by, t.name AS sourceName
             FROM loans l JOIN loan_types t ON t.id = l.loan_type_id`,
    )
      .all()
      .forEach((r) => existing.add(loanKey(r)));

    const insert = db.prepare(
      `INSERT INTO loans (amount, date, source, loan_type_id, is_carry, carry_deduct, created_by, created_at, updated_by, updated_at)
             VALUES (@amount, @date, @source, @loan_type_id, 0, 0, @created_by, @created_at, @updated_by, @updated_at)`,
    );

    for (const r of src.prepare("SELECT * FROM loans ORDER BY id").all()) {
      if (r.is_carry) continue; // مقبوضات الترحيل القديمة يولّدها النظام

      const sourceRow = srcSrc.get(r.loan_type_id);
      if (
        !(Number(r.amount) > 0) ||
        !r.date ||
        !r.created_by ||
        !r.created_at ||
        !sourceRow
      ) {
        stats.loans.invalid++;
        continue;
      }

      const key = loanKey({ ...r, sourceName: clean(sourceRow.name) });
      if (existing.has(key)) {
        stats.loans.skipped++;
        continue;
      }

      insert.run({
        amount: Number(r.amount),
        date: r.date,
        source: r.source || "",
        loan_type_id: srcId(sourceRow),
        created_by: r.created_by,
        created_at: r.created_at,
        updated_by: r.updated_by ?? null,
        updated_at: r.updated_at ?? null,
      });
      existing.add(key);
      stats.loans.added++;
    }
  }

  return stats;
}

async function mergeBackup(file) {
  const tmp = copyToTemp(file);
  let src;
  try {
    inspectTemp(tmp);
    await makeSafetyCopy();

    src = new Database(tmp);
    const stats = conn.db.transaction(() => mergeTables(src))(); // كله أو لا شيء
    syncCash();
    setSetting("last_import_at", new Date().toISOString());
    return stats;
  } finally {
    if (src) src.close();
    removeDbFiles(tmp);
  }
}

/* ---------- الاستيراد: حذف القديم واستبداله بالملف ---------- */
async function replaceWithBackup(file) {
  const tmp = copyToTemp(file);
  try {
    const info = inspectTemp(tmp);
    const safety = await makeSafetyCopy();
    const dbFile = conn.file;

    close();
    try {
      removeDbFiles(dbFile);
      fs.copyFileSync(tmp, dbFile);
      open(dbFile);
      createTables();
      seed();
      migrate();
      syncCash();
    } catch (err) {
      // تراجع: نعيد البيانات السابقة كما كانت
      try {
        close();
      } catch (e) {
        /* مغلقة أصلاً */
      }
      removeDbFiles(dbFile);
      fs.copyFileSync(safety, dbFile);
      open(dbFile);
      createTables();
      seed();
      migrate();
      throw new Error("تعذر الاستيراد، وأُعيدت البيانات السابقة كما كانت");
    }

    setSetting("last_import_at", new Date().toISOString());
    return info;
  } finally {
    removeDbFiles(tmp);
  }
}

module.exports = {
  createBackupFile,
  getBackupInfo,
  inspectBackupFile,
  mergeBackup,
  replaceWithBackup,
};
