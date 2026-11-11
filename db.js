const bcrypt = require("bcryptjs");
const path = require("path");
const { app } = require("electron");
const Database = require("better-sqlite3");

let db;

/*
  ملاحظة: جدول loan_types وعمود loan_type_id يمثلان الآن "الجهات الممولة".
  أبقينا أسماءهما القديمة داخل قاعدة البيانات لحماية البيانات الموجودة،
  وكل ما يخرج من هذا الملف إلى الواجهة يستخدم الأسماء الجديدة (funding_party).
  وعمود loans.source يمثل الآن "البيان" (ملاحظة المقبوض).
*/

const SYSTEM_USER = "النظام";
const MIN_DATE = "0000-01-01";
const CARRY_LOCKED_MESSAGE =
  "هذا مقبوض مرحّل تلقائياً من القاصة ولا يمكن تعديله أو حذفه";

const MONTH_NAMES = [
  "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول",
];

function init() {
  const file = path.join(app.getPath("userData"), "college.db");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
        CREATE TABLE IF NOT EXISTS destinations (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT NOT NULL UNIQUE,
            is_fixed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS spenders (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT NOT NULL UNIQUE,
            is_fixed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS loan_types (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT NOT NULL UNIQUE,
            is_fixed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            amount         REAL NOT NULL,
            details        TEXT NOT NULL,
            date           TEXT NOT NULL,
            note           TEXT NOT NULL DEFAULT '',
            destination_id INTEGER NOT NULL REFERENCES destinations(id),
            spender_id     INTEGER REFERENCES spenders(id),
            loan_type_id   INTEGER REFERENCES loan_types(id),
            created_by     TEXT NOT NULL,
            created_at     TEXT NOT NULL,
            updated_by     TEXT,
            updated_at     TEXT
        );

        CREATE TABLE IF NOT EXISTS loans (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            amount       REAL NOT NULL,
            date         TEXT NOT NULL,
            source       TEXT NOT NULL DEFAULT '',
            loan_type_id INTEGER NOT NULL REFERENCES loan_types(id),
            is_carry     INTEGER NOT NULL DEFAULT 0,
            created_by   TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            updated_by   TEXT,
            updated_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
            display_name  TEXT,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL CHECK (role IN ('admin', 'accountant')),
            created_at    TEXT NOT NULL
        );
    `);

  seed();
  migrate();
  syncCarry();
  pruneFundingParties();
}

// البيانات الأساسية تُدخل مرة واحدة فقط عندما تكون الجداول فارغة
function seed() {
  db.transaction(() => {
    if (db.prepare("SELECT COUNT(*) AS c FROM destinations").get().c === 0) {
      const insert = db.prepare(
        "INSERT INTO destinations (name, is_fixed) VALUES (?, ?)",
      );
      insert.run("الكلية", 1); // ثابتة
      ["مصروفات شخصية", "كلية الذكاء", "المتعففين", "الخلاصة"].forEach((n) =>
        insert.run(n, 0),
      );
    }

    if (db.prepare("SELECT COUNT(*) AS c FROM users").get().c === 0) {
      db.prepare(
        `INSERT INTO users (username, display_name, password_hash, role, created_at)
         VALUES (?, ?, ?, 'admin', ?)`,
      ).run(
        "admin",
        "الأدمن",
        bcrypt.hashSync("admin", 10),
        new Date().toISOString(),
      );
    }

    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('schema_version', '7')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run();
  })();
}

// ترحيل القواعد القديمة
function migrate() {
  const hasColumn = (table, column) =>
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .some((c) => c.name === column);

  // عمود الجهة الممولة في المصروفات (قواعد قديمة جداً)
  if (!hasColumn("expenses", "loan_type_id")) {
    db.exec(
      "ALTER TABLE expenses ADD COLUMN loan_type_id INTEGER REFERENCES loan_types(id)",
    );
  }
  const firstParty = db
    .prepare("SELECT id FROM loan_types ORDER BY id LIMIT 1")
    .get();
  if (firstParty) {
    db.prepare(
      "UPDATE expenses SET loan_type_id = ? WHERE loan_type_id IS NULL",
    ).run(firstParty.id);
  }

  // عمود قديم من نسخة سابقة في جهات الصرف: لم نعد نستخدمه
  if (hasColumn("destinations", "loan_type_id")) {
    db.prepare("UPDATE destinations SET loan_type_id = NULL").run();
  }

  // اسم العرض للمستخدمين
  if (!hasColumn("users", "display_name")) {
    db.exec("ALTER TABLE users ADD COLUMN display_name TEXT");
  }
  db.prepare(
    `UPDATE users
     SET display_name = CASE WHEN role = 'admin' THEN 'الأدمن' ELSE username END
     WHERE display_name IS NULL OR display_name = ''`,
  ).run();

  // علامة المقبوضات المرحّلة تلقائياً من القاصة
  if (!hasColumn("loans", "is_carry")) {
    db.exec("ALTER TABLE loans ADD COLUMN is_carry INTEGER NOT NULL DEFAULT 0");
  }

  // الجهة القائمة بالصرف: المصروفات القديمة تُنسب إلى "غير محددة"
  if (!hasColumn("expenses", "spender_id")) {
    db.exec(
      "ALTER TABLE expenses ADD COLUMN spender_id INTEGER REFERENCES spenders(id)",
    );
  }
  const orphans = db
    .prepare("SELECT COUNT(*) AS c FROM expenses WHERE spender_id IS NULL")
    .get().c;
  if (orphans > 0) {
    db.prepare("INSERT OR IGNORE INTO spenders (name) VALUES ('غير محددة')").run();
    const unknown = db
      .prepare("SELECT id FROM spenders WHERE name = 'غير محددة'")
      .get();
    db.prepare("UPDATE expenses SET spender_id = ? WHERE spender_id IS NULL").run(
      unknown.id,
    );
  }

  // الجهات الممولة: لم تعد هناك جهة ثابتة
  db.prepare("UPDATE loan_types SET is_fixed = 0 WHERE is_fixed = 1").run();
}

function isConstraintError(err) {
  return String(err.code).startsWith("SQLITE_CONSTRAINT");
}

/* ---------- الإعدادات الداخلية ---------- */
function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

/* ---------- ترحيل متبقي القاصة تلقائياً ---------- */
const round2 = (n) => Math.round(n * 100) / 100;

// 'YYYY-MM' + عدد أشهر
function shiftMonthKey(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function sumLoans(partyId, from, to, includeCarry) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM loans
       WHERE loan_type_id = ? AND date >= ? AND date <= ?
       ${includeCarry ? "" : "AND is_carry = 0"}`,
    )
    .get(partyId, from, to).s;
}

function sumExpenses(partyId, from, to) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM expenses
       WHERE loan_type_id = ? AND date >= ? AND date <= ?`,
    )
    .get(partyId, from, to).s;
}

// ينشئ أو يحدّث أو يحذف مقبوض الترحيل بتاريخ 1 من الشهر التالي، بنفس الجهة الممولة
function upsertCarry(partyId, fromMonth, remaining) {
  const amount = round2(Math.max(remaining, 0));
  const date = `${shiftMonthKey(fromMonth, 1)}-01`;
  const note = `المتبقي في القاصة لشهر ${MONTH_NAMES[Number(fromMonth.slice(5, 7)) - 1]}`;
  const now = new Date().toISOString();

  const existing = db
    .prepare(
      "SELECT id, amount FROM loans WHERE is_carry = 1 AND date = ? AND loan_type_id = ?",
    )
    .get(date, partyId);

  if (amount > 0) {
    if (!existing) {
      db.prepare(
        `INSERT INTO loans (amount, date, source, loan_type_id, is_carry, created_by, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      ).run(amount, date, note, partyId, SYSTEM_USER, now);
    } else if (round2(existing.amount) !== amount) {
      db.prepare(
        "UPDATE loans SET amount = ?, source = ?, updated_by = ?, updated_at = ? WHERE id = ?",
      ).run(amount, note, SYSTEM_USER, now, existing.id);
    }
  } else if (existing) {
    db.prepare("DELETE FROM loans WHERE id = ?").run(existing.id);
  }
}

// يضمن أن مقبوضات الترحيل صحيحة لكل الأشهر المنتهية. آمنة للتكرار.
function syncCarry() {
  // إن رجع تاريخ الجهاز للوراء، نحذف مقبوضات الترحيل المؤرخة في المستقبل
  db.prepare("DELETE FROM loans WHERE is_carry = 1 AND date > ?").run(
    `${currentMonthKey()}-31`,
  );

  const target = shiftMonthKey(currentMonthKey(), -1); // آخر شهر منتهٍ

  let start = getSetting("carry_start_month");
  if (!start) {
    start = target; // أول تفعيل: نبدأ من آخر شهر منتهٍ
    setSetting("carry_start_month", start);
  }
  if (start > target) return;

  const parties = db.prepare("SELECT id FROM loan_types").all();

  db.transaction(() => {
    for (let m = start; m <= target; m = shiftMonthKey(m, 1)) {
      for (const p of parties) {
        // شهر البداية تراكمي (كل البيانات السابقة)، وما بعده شهري
        const remaining =
          m === start
            ? sumLoans(p.id, MIN_DATE, `${m}-31`, false) -
              sumExpenses(p.id, MIN_DATE, `${m}-31`)
            : sumLoans(p.id, `${m}-01`, `${m}-31`, true) -
              sumExpenses(p.id, `${m}-01`, `${m}-31`);
        upsertCarry(p.id, m, remaining);
      }
    }
  })();
}

// يتحقق من السنة والشهر ويرجع حدود الشهر
function parsePeriod(f) {
  const year = Number(f && f.year);
  const month = Number(f && f.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    throw new Error("السنة غير صحيحة");
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new Error("الشهر غير صحيح");

  const key = `${year}-${String(month).padStart(2, "0")}`;
  return { key, from: `${key}-01`, to: `${key}-31` };
}

/* ---------- قوائم الأسماء: الجهات المستفيدة والجهات القائمة بالصرف ---------- */
const NAMED = {
  destinations: { column: "destination_id" },
  spenders: { column: "spender_id" },
};

function cleanListName(name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("اسم الجهة مطلوب");
  if (clean.length > 60) throw new Error("اسم الجهة طويل جداً");
  return clean;
}

function getNamed(table) {
  const col = NAMED[table].column;
  return db
    .prepare(
      `SELECT n.id, n.name, n.is_fixed,
              (SELECT COUNT(*) FROM expenses WHERE ${col} = n.id) AS expenses_count,
              COALESCE((SELECT SUM(amount) FROM expenses WHERE ${col} = n.id), 0) AS expenses_total
       FROM ${table} n
       ORDER BY n.id`,
    )
    .all();
}

function addNamed(table, name) {
  const clean = cleanListName(name);
  try {
    return db
      .prepare(`INSERT INTO ${table} (name, is_fixed) VALUES (?, 0)`)
      .run(clean).lastInsertRowid;
  } catch (err) {
    if (isConstraintError(err)) throw new Error("هذه الجهة موجودة مسبقاً");
    throw err;
  }
}

function updateNamed(table, id, name) {
  const clean = cleanListName(name);
  const row = db.prepare(`SELECT is_fixed FROM ${table} WHERE id = ?`).get(id);
  if (!row) throw new Error("الجهة غير موجودة");
  if (row.is_fixed) throw new Error("لا يمكن تعديل هذه الجهة");

  try {
    db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(clean, id);
  } catch (err) {
    if (isConstraintError(err)) throw new Error("هذه الجهة موجودة مسبقاً");
    throw err;
  }
}

function deleteNamed(table, id) {
  const col = NAMED[table].column;
  const row = db.prepare(`SELECT is_fixed FROM ${table} WHERE id = ?`).get(id);
  if (!row) throw new Error("الجهة غير موجودة");
  if (row.is_fixed) throw new Error("لا يمكن حذف هذه الجهة");

  const count = db
    .prepare(`SELECT COUNT(*) AS c FROM expenses WHERE ${col} = ?`)
    .get(id).c;
  if (count) throw new Error(`لا يمكن حذف جهة لديها ${count} مصروف`);

  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}

const getDestinations = () => getNamed("destinations");
const addDestination = (name) => addNamed("destinations", name);
const updateDestination = (id, name) => updateNamed("destinations", id, name);
const deleteDestination = (id) => deleteNamed("destinations", id);

const getSpenders = () => getNamed("spenders");
const addSpender = (name) => addNamed("spenders", name);
const updateSpender = (id, name) => updateNamed("spenders", id, name);
const deleteSpender = (id) => deleteNamed("spenders", id);

/* ---------- الجهات الممولة (تُنشأ من المقبوضات) ---------- */
function getFundingParties() {
  return db.prepare("SELECT id, name FROM loan_types ORDER BY id").all();
}

function ensureFundingParty(name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("الجهة الممولة مطلوبة");
  if (clean.length > 60) throw new Error("اسم الجهة الممولة طويل جداً");

  const found = db.prepare("SELECT id FROM loan_types WHERE name = ?").get(clean);
  if (found) return found.id;
  return db
    .prepare("INSERT INTO loan_types (name, is_fixed) VALUES (?, 0)")
    .run(clean).lastInsertRowid;
}

// تُحذف الجهة الممولة التي لا يستخدمها أي مقبوض أو مصروف
function pruneFundingParties() {
  db.prepare(
    `DELETE FROM loan_types
     WHERE id NOT IN (SELECT loan_type_id FROM loans)
       AND id NOT IN (SELECT loan_type_id FROM expenses WHERE loan_type_id IS NOT NULL)`,
  ).run();
}

/* ---------- المصروفات ---------- */
const EXPENSE_SELECT = `
  SELECT e.id, e.amount, e.details, e.date, e.note,
         e.destination_id, d.name AS destination,
         e.spender_id, s.name AS spender,
         e.loan_type_id AS funding_party_id, t.name AS funding_party,
         e.created_by, e.created_at, e.updated_by, e.updated_at
  FROM expenses e
  JOIN destinations d ON d.id = e.destination_id
  LEFT JOIN spenders s ON s.id = e.spender_id
  JOIN loan_types t ON t.id = e.loan_type_id
`;

function validateExpense(d) {
  if (!(Number(d.amount) > 0)) throw new Error("المبلغ غير صحيح");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
    throw new Error("التاريخ غير صحيح");
  if (!String(d.details || "").trim()) throw new Error("التفاصيل مطلوبة");

  if (!db.prepare("SELECT id FROM destinations WHERE id = ?").get(d.destinationId))
    throw new Error("الجهة المستفيدة غير موجودة");
  if (!db.prepare("SELECT id FROM spenders WHERE id = ?").get(d.spenderId))
    throw new Error("الجهة القائمة بالصرف غير موجودة");
  if (!db.prepare("SELECT id FROM loan_types WHERE id = ?").get(d.fundingPartyId))
    throw new Error("الجهة الممولة غير موجودة");
}

function getExpenses() {
  return db
    .prepare(`${EXPENSE_SELECT} ORDER BY e.id DESC LIMIT 100`)
    .all();
}

function addExpense(d, user) {
  validateExpense(d);
  const result = db
    .prepare(
      `INSERT INTO expenses
         (amount, details, date, note, destination_id, spender_id, loan_type_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      Number(d.amount),
      d.details.trim(),
      d.date,
      String(d.note || "").trim(),
      d.destinationId,
      d.spenderId,
      d.fundingPartyId,
      user,
      new Date().toISOString(),
    );
  syncCarry();
  return result.lastInsertRowid;
}

function updateExpense(id, d, user) {
  validateExpense(d);
  const result = db
    .prepare(
      `UPDATE expenses
       SET amount = ?, details = ?, date = ?, note = ?, destination_id = ?,
           spender_id = ?, loan_type_id = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      Number(d.amount),
      d.details.trim(),
      d.date,
      String(d.note || "").trim(),
      d.destinationId,
      d.spenderId,
      d.fundingPartyId,
      user,
      new Date().toISOString(),
      id,
    );
  if (result.changes === 0) throw new Error("المصروف غير موجود");
  syncCarry();
  pruneFundingParties();
}

function deleteExpense(id) {
  db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  syncCarry();
  pruneFundingParties();
}

/* ---------- المقبوضات ---------- */
const LOAN_SELECT = `
  SELECT l.id, l.amount, l.date, l.source AS note, l.is_carry,
         l.loan_type_id AS funding_party_id, t.name AS funding_party,
         l.created_by, l.created_at, l.updated_by, l.updated_at
  FROM loans l
  JOIN loan_types t ON t.id = l.loan_type_id
`;

function validateLoan(d) {
  if (!(Number(d.amount) > 0)) throw new Error("المبلغ غير صحيح");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
    throw new Error("التاريخ غير صحيح");
}

function getLoans() {
  syncCarry(); // لتظهر مقبوضات الترحيل فور بداية شهر جديد
  return db
    .prepare(`${LOAN_SELECT} ORDER BY l.date DESC, l.id DESC LIMIT 15`)
    .all();
}

function addLoan(d, user) {
  validateLoan(d);
  const id = db.transaction(() => {
    const partyId = ensureFundingParty(d.fundingParty);
    return db
      .prepare(
        `INSERT INTO loans (amount, date, source, loan_type_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Number(d.amount),
        d.date,
        String(d.note || "").trim(),
        partyId,
        user,
        new Date().toISOString(),
      ).lastInsertRowid;
  })();
  syncCarry();
  return id;
}

function assertNotCarry(id) {
  const row = db.prepare("SELECT is_carry FROM loans WHERE id = ?").get(id);
  if (!row) throw new Error("المقبوض غير موجود");
  if (row.is_carry) throw new Error(CARRY_LOCKED_MESSAGE);
}

function updateLoan(id, d, user) {
  validateLoan(d);
  assertNotCarry(id);

  db.transaction(() => {
    const partyId = ensureFundingParty(d.fundingParty);
    db.prepare(
      `UPDATE loans
       SET amount = ?, date = ?, source = ?, loan_type_id = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      Number(d.amount),
      d.date,
      String(d.note || "").trim(),
      partyId,
      user,
      new Date().toISOString(),
      id,
    );
  })();
  syncCarry();
  pruneFundingParties();
}

function deleteLoan(id) {
  assertNotCarry(id);
  db.prepare("DELETE FROM loans WHERE id = ?").run(id);
  syncCarry();
  pruneFundingParties();
}

/* ---------- القاصة الشهرية مع كشفها ---------- */
// byParty: لكل جهة ممولة صافي المقبوضات (مع المرحّل) والمصروف منها خلال الشهر
//          (الأشهر حتى بداية الترحيل تراكمية حتى نهاية الشهر)
// opening + rows: كشف الحركة، الوارد (المقبوضات) والصادر (المصروفات) بدون المرحّل
function getMonthCashReport(f) {
  const { key, from, to } = parsePeriod(f);
  syncCarry();

  const cumulative = key <= (getSetting("carry_start_month") || "0000-00");
  const rangeFrom = cumulative ? MIN_DATE : from;

  const byParty = db
    .prepare("SELECT id, name FROM loan_types ORDER BY id")
    .all()
    .map((p) => ({
      id: p.id,
      name: p.name,
      loans_total: sumLoans(p.id, rangeFrom, to, !cumulative),
      spent_total: sumExpenses(p.id, rangeFrom, to),
    }));

  const opening = cumulative
    ? db
        .prepare(
          `SELECT
             COALESCE((SELECT SUM(amount) FROM loans WHERE is_carry = 0 AND date < ?), 0)
           - COALESCE((SELECT SUM(amount) FROM expenses WHERE date < ?), 0) AS v`,
        )
        .get(from, from).v
    : db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS v FROM loans
           WHERE is_carry = 1 AND date >= ? AND date <= ?`,
        )
        .get(from, to).v;

  const rows = db
    .prepare(
      `
        SELECT 'loan' AS kind, 0 AS sort_order, l.id, l.date, l.source AS text,
               t.name AS party, l.amount,
               l.created_by, l.created_at, l.updated_by, l.updated_at
        FROM loans l
        JOIN loan_types t ON t.id = l.loan_type_id
        WHERE l.is_carry = 0 AND l.date >= ? AND l.date <= ?
        UNION ALL
        SELECT 'expense' AS kind, 1 AS sort_order, e.id, e.date, e.details AS text,
               t.name AS party, e.amount,
               e.created_by, e.created_at, e.updated_by, e.updated_at
        FROM expenses e
        JOIN loan_types t ON t.id = e.loan_type_id
        WHERE e.date >= ? AND e.date <= ?
        ORDER BY date ASC, sort_order ASC, id ASC
      `,
    )
    .all(from, to, from, to);

  return { cumulative, byParty, opening: round2(opening), rows };
}

/* ---------- الخلاصة الشهرية ---------- */
// مصروفات الشهر لكل جهة مستفيدة، ومجموع مقبوضات الشهر بدون المرحّل (فتبدأ الأشهر من صفر)
function getMonthSummary(f) {
  const { from, to } = parsePeriod(f);

  const destinations = db
    .prepare(
      `SELECT d.id, d.name,
              (SELECT COUNT(*) FROM expenses
               WHERE destination_id = d.id AND date >= ? AND date <= ?) AS expenses_count,
              COALESCE((SELECT SUM(amount) FROM expenses
                        WHERE destination_id = d.id AND date >= ? AND date <= ?), 0) AS expenses_total
       FROM destinations d
       ORDER BY d.id`,
    )
    .all(from, to, from, to);

  const loansTotal = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS v FROM loans
       WHERE is_carry = 0 AND date >= ? AND date <= ?`,
    )
    .get(from, to).v;

  return { destinations, loansTotal };
}

/* ---------- كشف المصروفات والمقبوضات ---------- */
function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    throw new Error(`${label} غير صحيح`);
}

function cleanIds(list) {
  return (Array.isArray(list) ? list : []).map(Number).filter(Number.isInteger);
}

// f = { by: 'destination' | 'spender', ids, from, to }
function getExpensesReport(f) {
  assertDate(f.from, "تاريخ البداية");
  assertDate(f.to, "تاريخ النهاية");

  const ids = cleanIds(f.ids);
  if (!ids.length) return [];

  const column = f.by === "spender" ? "e.spender_id" : "e.destination_id";

  return db
    .prepare(
      `${EXPENSE_SELECT}
       WHERE ${column} IN (${ids.map(() => "?").join(",")})
         AND e.date >= ? AND e.date <= ?
       ORDER BY e.date ASC, e.id ASC`,
    )
    .all(...ids, f.from, f.to);
}

// f = { fundingPartyIds, from, to }
function getLoansReport(f) {
  assertDate(f.from, "تاريخ البداية");
  assertDate(f.to, "تاريخ النهاية");

  const ids = cleanIds(f.fundingPartyIds);
  if (!ids.length) return [];

  return db
    .prepare(
      `${LOAN_SELECT}
       WHERE l.loan_type_id IN (${ids.map(() => "?").join(",")})
         AND l.date >= ? AND l.date <= ?
       ORDER BY l.date ASC, l.id ASC`,
    )
    .all(...ids, f.from, f.to);
}

/* ---------- المستخدمون ---------- */
const MIN_PASSWORD = 6;

function assertPassword(password) {
  if (String(password || "").length < MIN_PASSWORD) {
    throw new Error(`كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD} أحرف`);
  }
}

function cleanUsername(name) {
  const clean = String(name || "").trim();
  if (clean.length < 3) throw new Error("اسم المستخدم يجب ألا يقل عن 3 أحرف");
  if (clean.length > 30 || !/^[\p{L}\p{N}._-]+$/u.test(clean)) {
    throw new Error("اسم المستخدم: حروف وأرقام و . _ - فقط");
  }
  return clean;
}

function cleanDisplayName(name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  if (clean.length < 2) throw new Error("اسم المحاسب مطلوب");
  if (clean.length > 40 || !/^[\p{L}\p{N} ._-]+$/u.test(clean)) {
    throw new Error("اسم المحاسب: حروف وأرقام ومسافات فقط");
  }
  return clean;
}

// يرجع بيانات المستخدم عند النجاح، أو null عند الفشل
function login(username, password) {
  const user = db
    .prepare(
      "SELECT id, username, display_name, password_hash, role FROM users WHERE username = ?",
    )
    .get(String(username || "").trim());

  if (!user || !bcrypt.compareSync(String(password || ""), user.password_hash))
    return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    role: user.role,
  };
}

function changePassword(userId, oldPassword, newPassword) {
  assertPassword(newPassword);

  const user = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(userId);
  if (
    !user ||
    !bcrypt.compareSync(String(oldPassword || ""), user.password_hash)
  ) {
    throw new Error("كلمة المرور الحالية غير صحيحة");
  }

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(String(newPassword), 10),
    userId,
  );
}

function getAccountants() {
  return db
    .prepare(
      "SELECT id, username, display_name FROM users WHERE role = 'accountant' ORDER BY id",
    )
    .all();
}

function addAccountant(displayName, username, password) {
  const name = cleanDisplayName(displayName);
  const clean = cleanUsername(username);
  assertPassword(password);

  if (db.prepare("SELECT 1 FROM users WHERE display_name = ?").get(name)) {
    throw new Error("هذا الاسم مستخدم لمحاسب آخر");
  }

  try {
    return db
      .prepare(
        `INSERT INTO users (username, display_name, password_hash, role, created_at)
         VALUES (?, ?, ?, 'accountant', ?)`,
      )
      .run(
        clean,
        name,
        bcrypt.hashSync(String(password), 10),
        new Date().toISOString(),
      ).lastInsertRowid;
  } catch (err) {
    if (isConstraintError(err)) throw new Error("اسم المستخدم موجود مسبقاً");
    throw err;
  }
}

function updateAccountant(id, displayName, username, newPassword) {
  const name = cleanDisplayName(displayName);
  const clean = cleanUsername(username);
  const hasPassword = String(newPassword || "").length > 0;
  if (hasPassword) assertPassword(newPassword);

  const user = db
    .prepare("SELECT id FROM users WHERE id = ? AND role = 'accountant'")
    .get(id);
  if (!user) throw new Error("المحاسب غير موجود");

  if (
    db
      .prepare("SELECT 1 FROM users WHERE display_name = ? AND id <> ?")
      .get(name, id)
  ) {
    throw new Error("هذا الاسم مستخدم لمحاسب آخر");
  }

  try {
    db.transaction(() => {
      db.prepare(
        "UPDATE users SET display_name = ?, username = ? WHERE id = ?",
      ).run(name, clean, id);
      if (hasPassword) {
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
          bcrypt.hashSync(String(newPassword), 10),
          id,
        );
      }
    })();
  } catch (err) {
    if (isConstraintError(err)) throw new Error("اسم المستخدم موجود مسبقاً");
    throw err;
  }
}

function deleteAccountant(id) {
  const result = db
    .prepare("DELETE FROM users WHERE id = ? AND role = 'accountant'")
    .run(id);
  if (result.changes === 0) throw new Error("المحاسب غير موجود");
}

// استرجاع كلمة مرور الأدمن: يتطلب مفتاحاً يطابق البصمة المحفوظة في recovery.js
function recoverAdmin(key, newPassword, keyHash) {
  if (!keyHash) throw new Error("الاسترجاع غير مفعّل");
  if (!bcrypt.compareSync(String(key || ""), keyHash)) {
    throw new Error("مفتاح الاسترجاع غير صحيح");
  }
  assertPassword(newPassword);

  const result = db
    .prepare("UPDATE users SET password_hash = ? WHERE role = 'admin'")
    .run(bcrypt.hashSync(String(newPassword), 10));
  if (result.changes === 0) throw new Error("لا يوجد حساب أدمن");
}

module.exports = {
  init,
  getDestinations,
  addDestination,
  updateDestination,
  deleteDestination,
  getSpenders,
  addSpender,
  updateSpender,
  deleteSpender,
  getFundingParties,
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getLoans,
  addLoan,
  updateLoan,
  deleteLoan,
  getMonthCashReport,
  getMonthSummary,
  getExpensesReport,
  getLoansReport,
  login,
  changePassword,
  getAccountants,
  addAccountant,
  updateAccountant,
  deleteAccountant,
  recoverAdmin,
};