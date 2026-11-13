// start db.js
const bcrypt = require("bcryptjs");
const path = require("path");
const { app } = require("electron");
const Database = require("better-sqlite3");

let db;

/*
  ملاحظة: جدول loan_types وعمود loan_type_id يمثلان الآن "الجهات القائمة بالصرف"
  (وهي نفسها الجهات الممولة). أبقينا أسماءهما القديمة داخل قاعدة البيانات لحماية البيانات.
  جدول spenders وعمود expenses.spender_id لم يعودا مستخدمين (بقيا لحماية البيانات القديمة).
  عمود loans.carry_deduct يمثل الآن المبلغ المخصوم من المقبوض لأنه لم يُصرف في شهره.
*/

const MIN_PASSWORD = 6;

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
            remaining      REAL NOT NULL DEFAULT 0,
            cash_out       REAL,
            settles_id     INTEGER REFERENCES expenses(id),
            receipt_no     TEXT NOT NULL DEFAULT '',
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
            carry_deduct REAL NOT NULL DEFAULT 0,
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
  syncCash();
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
      `INSERT INTO settings (key, value) VALUES ('schema_version', '9')
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

  // عمود الجهة في المصروفات (قواعد قديمة جداً)
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

  if (!hasColumn("loans", "is_carry")) {
    db.exec("ALTER TABLE loans ADD COLUMN is_carry INTEGER NOT NULL DEFAULT 0");
  }

  if (!hasColumn("expenses", "spender_id")) {
    db.exec(
      "ALTER TABLE expenses ADD COLUMN spender_id INTEGER REFERENCES spenders(id)",
    );
  }

  // الجهات: لم تعد هناك جهة ثابتة
  db.prepare("UPDATE loan_types SET is_fixed = 0 WHERE is_fixed = 1").run();

  // الديون: المتبقي، المصروف نقداً، ربط التسديد، رقم الوصل
  if (!hasColumn("expenses", "remaining")) {
    db.exec("ALTER TABLE expenses ADD COLUMN remaining REAL NOT NULL DEFAULT 0");
  }
  if (!hasColumn("expenses", "cash_out")) {
    db.exec("ALTER TABLE expenses ADD COLUMN cash_out REAL");
  }
  if (!hasColumn("expenses", "settles_id")) {
    db.exec(
      "ALTER TABLE expenses ADD COLUMN settles_id INTEGER REFERENCES expenses(id)",
    );
  }
  if (!hasColumn("expenses", "receipt_no")) {
    db.exec("ALTER TABLE expenses ADD COLUMN receipt_no TEXT NOT NULL DEFAULT ''");
  }
  // المصروفات القديمة دُفعت كاملة: المصروف نقداً = المبلغ
  db.prepare(
    "UPDATE expenses SET cash_out = amount - remaining WHERE cash_out IS NULL",
  ).run();

  if (!hasColumn("loans", "carry_deduct")) {
    db.exec("ALTER TABLE loans ADD COLUMN carry_deduct REAL NOT NULL DEFAULT 0");
  }

  // النموذج الجديد (3): لا ترحيل للشهر التالي، بل يُصفَّر المتبقي لكل جهة عند انتهاء الشهر
  if (getSetting("carry_model") !== "3") {
    db.prepare("DELETE FROM loans WHERE is_carry = 1").run();
    db.prepare("UPDATE loans SET carry_deduct = 0").run();
    setSetting("carry_model", "3");
  }
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

/* ---------- تصفير القاصة تلقائياً عند انتهاء كل شهر ---------- */
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

// raw = المبلغ الأصلي بدون خصم غير المصروف
function sumLoans(partyId, from, to, raw = false) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(${raw ? "amount" : "amount - carry_deduct"}), 0) AS s
       FROM loans WHERE loan_type_id = ? AND date >= ? AND date <= ?`,
    )
    .get(partyId, from, to).s;
}

// المصروف الفعلي من القاصة = المدفوع نقداً فقط (cash_out)
function sumExpenses(partyId, from, to) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(cash_out), 0) AS s
       FROM expenses WHERE loan_type_id = ? AND date >= ? AND date <= ?`,
    )
    .get(partyId, from, to).s;
}

// ينقص غير المصروف من مقبوضات الجهة في الشهر (الأحدث أولاً) ويخزنه في carry_deduct
// المبلغ الأصلي يبقى محفوظاً في amount، والمعروض = amount - carry_deduct
function applyDeductions(partyId, from, to, amountToRemove) {
  const where = "loan_type_id = ? AND date >= ? AND date <= ?";

  db.prepare(
    `UPDATE loans SET carry_deduct = 0 WHERE ${where} AND carry_deduct <> 0`,
  ).run(partyId, from, to);

  let left = round2(Math.max(amountToRemove, 0));
  if (left <= 0) return;

  const rows = db
    .prepare(`SELECT id, amount FROM loans WHERE ${where} ORDER BY date DESC, id DESC`)
    .all(partyId, from, to);
  const update = db.prepare("UPDATE loans SET carry_deduct = ? WHERE id = ?");

  for (const r of rows) {
    if (left <= 0) break;
    const take = round2(Math.min(r.amount, left));
    update.run(take, r.id);
    left = round2(left - take);
  }
}

// عند انتهاء كل شهر: لكل جهة، المتبقي (مقبوضاتها − المدفوع نقداً منها) يُنقَص من مقبوضاتها
// فتصبح المقبوضات مساوية للمصروف فعلاً، ويتصفّر المتبقي. لا ترحيل للشهر التالي.
// آمنة للتكرار، وتُعيد الحساب عند أي تعديل.
function syncCash() {
  db.transaction(() => {
    const target = shiftMonthKey(currentMonthKey(), -1); // آخر شهر منتهٍ

    // الشهر الحالي وما بعده لا يُخصم منه شيء
    db.prepare(
      "UPDATE loans SET carry_deduct = 0 WHERE date > ? AND carry_deduct <> 0",
    ).run(`${target}-31`);

    const first = db
      .prepare(
        `SELECT MIN(d) AS d FROM (
           SELECT MIN(date) AS d FROM loans
           UNION ALL
           SELECT MIN(date) AS d FROM expenses
         )`,
      )
      .get().d;
    if (!first) return;

    const partiesIn = db.prepare(
      "SELECT DISTINCT loan_type_id AS id FROM loans WHERE date >= ? AND date <= ?",
    );

    for (let m = first.slice(0, 7); m <= target; m = shiftMonthKey(m, 1)) {
      const from = `${m}-01`;
      const to = `${m}-31`;

      for (const p of partiesIn.all(from, to)) {
        const remaining = round2(
          sumLoans(p.id, from, to, true) - sumExpenses(p.id, from, to),
        );
        applyDeductions(p.id, from, to, remaining);
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

/* ---------- الجهات المستفيدة ---------- */
function cleanListName(name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("اسم الجهة مطلوب");
  if (clean.length > 60) throw new Error("اسم الجهة طويل جداً");
  return clean;
}

function getDestinations() {
  return db
    .prepare(
      `SELECT n.id, n.name, n.is_fixed,
              (SELECT COUNT(*) FROM expenses WHERE destination_id = n.id) AS expenses_count,
              COALESCE((SELECT SUM(cash_out) FROM expenses WHERE destination_id = n.id), 0) AS expenses_total
       FROM destinations n
       ORDER BY n.id`,
    )
    .all();
}

function addDestination(name) {
  const clean = cleanListName(name);
  try {
    return db
      .prepare("INSERT INTO destinations (name, is_fixed) VALUES (?, 0)")
      .run(clean).lastInsertRowid;
  } catch (err) {
    if (isConstraintError(err)) throw new Error("هذه الجهة موجودة مسبقاً");
    throw err;
  }
}

function updateDestination(id, name) {
  const clean = cleanListName(name);
  const row = db.prepare("SELECT is_fixed FROM destinations WHERE id = ?").get(id);
  if (!row) throw new Error("الجهة غير موجودة");
  if (row.is_fixed) throw new Error("لا يمكن تعديل هذه الجهة");

  try {
    db.prepare("UPDATE destinations SET name = ? WHERE id = ?").run(clean, id);
  } catch (err) {
    if (isConstraintError(err)) throw new Error("هذه الجهة موجودة مسبقاً");
    throw err;
  }
}

function deleteDestination(id) {
  const row = db.prepare("SELECT is_fixed FROM destinations WHERE id = ?").get(id);
  if (!row) throw new Error("الجهة غير موجودة");
  if (row.is_fixed) throw new Error("لا يمكن حذف هذه الجهة");

  const count = db
    .prepare("SELECT COUNT(*) AS c FROM expenses WHERE destination_id = ?")
    .get(id).c;
  if (count) throw new Error(`لا يمكن حذف جهة لديها ${count} مصروف`);

  db.prepare("DELETE FROM destinations WHERE id = ?").run(id);
}

/* ---------- الجهات القائمة بالصرف (= الجهات الممولة، وتُنشأ من المقبوضات) ---------- */
function getFundingParties() {
  return db.prepare("SELECT id, name FROM loan_types ORDER BY id").all();
}

// تُحذف الجهات القديمة «المتبقي في القاصة لشهر ...» التي لا يستخدمها أي مقبوض أو مصروف
function pruneFundingParties() {
  db.prepare(
    `DELETE FROM loan_types
     WHERE name LIKE 'المتبقي في القاصة لشهر%'
       AND id NOT IN (SELECT loan_type_id FROM loans)
       AND id NOT IN (SELECT loan_type_id FROM expenses WHERE loan_type_id IS NOT NULL)`,
  ).run();
}

function addFundingParty(name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("اسم الجهة القائمة بالصرف مطلوب");
  if (clean.length > 60) throw new Error("اسم الجهة طويل جداً");
  if (db.prepare("SELECT 1 FROM loan_types WHERE name = ?").get(clean))
    throw new Error("هذه الجهة موجودة مسبقاً");
  return db
    .prepare("INSERT INTO loan_types (name, is_fixed) VALUES (?, 0)")
    .run(clean).lastInsertRowid;
}

// كشف الجهات القائمة بالصرف لشهر وسنة: عدد المصروفات ومجموع المدفوع نقداً
function getSpendersReport(f) {
  const { from, to } = parsePeriod(f);
  return db
    .prepare(
      `SELECT t.id, t.name,
              (SELECT COUNT(*) FROM expenses
               WHERE loan_type_id = t.id AND date >= ? AND date <= ?) AS expenses_count,
              COALESCE((SELECT SUM(cash_out) FROM expenses
                        WHERE loan_type_id = t.id AND date >= ? AND date <= ?), 0) AS expenses_total
       FROM loan_types t
       ORDER BY t.id`,
    )
    .all(from, to, from, to);
}

/* ---------- المصروفات ---------- */
// remaining = المتبقي (دين) بعد هذا القيد، paid = المدفوع نقداً تراكمياً
// cash_out = ما خرج فعلاً من القاصة بهذا القيد (للتسديد: مبلغ التسديد فقط)
// settles_id = القيد السابق الذي سدّد منه هذا القيد (للتسديدات فقط)
// الجهة القائمة بالصرف (spender) = loan_type_id
const EXPENSE_SELECT = `
  SELECT e.id, e.amount, e.remaining, (e.amount - e.remaining) AS paid, e.cash_out,
         e.settles_id, e.receipt_no, e.details, e.date, e.note,
         e.destination_id, d.name AS destination,
         e.loan_type_id AS spender_id, t.name AS spender,
         e.created_by, e.created_at, e.updated_by, e.updated_at
  FROM expenses e
  JOIN destinations d ON d.id = e.destination_id
  JOIN loan_types t ON t.id = e.loan_type_id
`;

function validateExpense(d) {
  if (!(Number(d.amount) > 0)) throw new Error("المبلغ غير صحيح");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
    throw new Error("التاريخ غير صحيح");
  if (!String(d.details || "").trim()) throw new Error("التفاصيل مطلوبة");
  if (String(d.receiptNo || "").trim().length > 40)
    throw new Error("رقم الوصل طويل جداً");

  if (!db.prepare("SELECT id FROM destinations WHERE id = ?").get(d.destinationId))
    throw new Error("الجهة المستفيدة غير موجودة");
  if (!db.prepare("SELECT id FROM loan_types WHERE id = ?").get(d.spenderId))
    throw new Error("الجهة القائمة بالصرف غير موجودة");
}

function readRemaining(d, max) {
  const remaining = round2(Number(d.remaining || 0));
  if (!(remaining >= 0)) throw new Error("المتبقي غير صحيح");
  if (remaining > max) throw new Error("المتبقي لا يمكن أن يزيد على المبلغ");
  return remaining;
}

const hasSettlement = (id) =>
  !!db.prepare("SELECT 1 FROM expenses WHERE settles_id = ?").get(id);

function getExpenses() {
  return db
    .prepare(`${EXPENSE_SELECT} ORDER BY e.id DESC LIMIT 100`)
    .all();
}

function addExpense(d, user) {
  validateExpense(d);
  const amount = round2(Number(d.amount));
  const remaining = readRemaining(d, amount);

  const result = db
    .prepare(
      `INSERT INTO expenses
         (amount, remaining, cash_out, receipt_no, details, date, note,
          destination_id, loan_type_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      amount,
      remaining,
      round2(amount - remaining),
      String(d.receiptNo || "").trim(),
      d.details.trim(),
      d.date,
      String(d.note || "").trim(),
      d.destinationId,
      d.spenderId,
      user,
      new Date().toISOString(),
    );
  syncCash();
  return result.lastInsertRowid;
}

function updateExpense(id, d, user) {
  validateExpense(d);

  const old = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
  if (!old) throw new Error("المصروف غير موجود");

  let amount = round2(Number(d.amount));
  let remaining;
  let cashOut;

  if (old.settles_id) {
    // قيد تسديد: المبلغ الكلي من القيد السابق، والتسديد = متبقي السابق − متبقي هذا القيد
    const parent = db
      .prepare("SELECT amount, remaining FROM expenses WHERE id = ?")
      .get(old.settles_id);
    if (!parent) throw new Error("القيد الأصلي للتسديد غير موجود");

    amount = parent.amount;
    remaining = readRemaining(d, parent.remaining);
    cashOut = round2(parent.remaining - remaining);
    if (!(cashOut > 0)) throw new Error("مبلغ التسديد يجب أن يكون أكبر من صفر");
  } else {
    remaining = readRemaining(d, amount);
    cashOut = round2(amount - remaining);
  }

  if (
    hasSettlement(id) &&
    (round2(amount) !== round2(old.amount) || remaining !== round2(old.remaining))
  ) {
    throw new Error(
      "لا يمكن تعديل المبلغ أو المتبقي لأن عليه تسديداً لاحقاً، احذف التسديد أولاً",
    );
  }

  db.prepare(
    `UPDATE expenses
     SET amount = ?, remaining = ?, cash_out = ?, receipt_no = ?, details = ?, date = ?,
         note = ?, destination_id = ?, loan_type_id = ?,
         updated_by = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    amount,
    remaining,
    cashOut,
    String(d.receiptNo || "").trim(),
    d.details.trim(),
    d.date,
    String(d.note || "").trim(),
    d.destinationId,
    d.spenderId,
    user,
    new Date().toISOString(),
    id,
  );
  syncCash();
}

function deleteExpense(id) {
  if (hasSettlement(id)) {
    throw new Error("لا يمكن حذف هذا المصروف لأن عليه تسديداً، احذف التسديد أولاً");
  }
  db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  syncCash();
}

/* ---------- الديون ---------- */
// الدين الحالي: قيد متبقيه أكبر من صفر ولم يُسدَّد منه بقيد لاحق
const ACTIVE_DEBT = `
  e.remaining > 0
  AND NOT EXISTS (SELECT 1 FROM expenses x WHERE x.settles_id = e.id)
`;

// الجهة الدائنة = الجهة المستفيدة، ومجموع الديون = مجموع المتبقي
function getDebtsSummary() {
  return db
    .prepare(
      `SELECT d.id, d.name, COALESCE(SUM(e.remaining), 0) AS total
       FROM expenses e
       JOIN destinations d ON d.id = e.destination_id
       WHERE ${ACTIVE_DEBT}
       GROUP BY d.id
       ORDER BY d.id`,
    )
    .all();
}

function getDebtItems(destinationId) {
  return db
    .prepare(
      `${EXPENSE_SELECT}
       WHERE e.destination_id = ? AND ${ACTIVE_DEBT}
       ORDER BY e.date ASC, e.id ASC`,
    )
    .all(Number(destinationId));
}
// ids = أرقام الجهات الدائنة المختارة
function getDebtsReport(ids) {
  const list = cleanIds(ids);
  if (!list.length) return [];

  return db
    .prepare(
      `${EXPENSE_SELECT}
       WHERE e.destination_id IN (${list.map(() => "?").join(",")})
         AND ${ACTIVE_DEBT}
       ORDER BY e.destination_id, e.date ASC, e.id ASC`,
    )
    .all(...list);
}

// تسديد: قيد جديد بنفس بيانات القيد القديم، والأصل لا يتغير
// d = { expenseId, amount, date }
function settleDebt(d, user) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
    throw new Error("التاريخ غير صحيح");

  const old = db.prepare("SELECT * FROM expenses WHERE id = ?").get(d.expenseId);
  if (!old) throw new Error("المصروف غير موجود");
  if (hasSettlement(old.id))
    throw new Error("تم تسديد هذا الدين سابقاً، حدّث البيانات");
  if (!(old.remaining > 0)) throw new Error("لا يوجد متبقٍ على هذا المصروف");

  const pay = round2(Number(d.amount));
  if (!(pay > 0)) throw new Error("مبلغ التسديد غير صحيح");
  if (pay > old.remaining) throw new Error("مبلغ التسديد أكبر من المتبقي");

  const result = db
    .prepare(
      `INSERT INTO expenses
         (amount, remaining, cash_out, settles_id, receipt_no, details, date, note,
          destination_id, loan_type_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      old.amount,
      round2(old.remaining - pay),
      pay,
      old.id,
      old.receipt_no,
      old.details,
      d.date,
      "تسديد قديم",
      old.destination_id,
      old.loan_type_id,
      user,
      new Date().toISOString(),
    );
  syncCash();
  return result.lastInsertRowid;
}

/* ---------- المقبوضات ---------- */
const LOAN_SELECT = `
  SELECT l.id, (l.amount - l.carry_deduct) AS amount, l.amount AS raw_amount,
         l.carry_deduct, l.date, l.source AS note,
         l.loan_type_id AS funding_party_id, t.name AS funding_party,
         l.created_by, l.created_at, l.updated_by, l.updated_at
  FROM loans l
  JOIN loan_types t ON t.id = l.loan_type_id
`;

function validateLoan(d) {
  if (!(Number(d.amount) > 0)) throw new Error("المبلغ غير صحيح");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
    throw new Error("التاريخ غير صحيح");
  if (!db.prepare("SELECT id FROM loan_types WHERE id = ?").get(d.fundingPartyId))
    throw new Error("الجهة القائمة بالصرف غير موجودة");
}

function getLoans() {
  syncCash(); // ليُصفَّر المتبقي فور بداية شهر جديد
  return db
    .prepare(`${LOAN_SELECT} ORDER BY l.date DESC, l.id DESC LIMIT 100`)
    .all();
}

function addLoan(d, user) {
  validateLoan(d);
  const id = db
    .prepare(
      `INSERT INTO loans (amount, date, source, loan_type_id, created_by, created_at)
       VALUES (?, ?, '', ?, ?, ?)`,
    )
    .run(Number(d.amount), d.date, d.fundingPartyId, user, new Date().toISOString())
    .lastInsertRowid;
  syncCash();
  return id;
}

function updateLoan(id, d, user) {
  validateLoan(d);
  if (!db.prepare("SELECT 1 FROM loans WHERE id = ?").get(id))
    throw new Error("المقبوض غير موجود");

  db.prepare(
    `UPDATE loans
     SET amount = ?, date = ?, loan_type_id = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
  ).run(Number(d.amount), d.date, d.fundingPartyId, user, new Date().toISOString(), id);

  syncCash();
}

function deleteLoan(id) {
  const result = db.prepare("DELETE FROM loans WHERE id = ?").run(id);
  if (result.changes === 0) throw new Error("المقبوض غير موجود");
  syncCash();
}

/* ---------- القاصة الشهرية ---------- */
// لكل جهة قائمة بالصرف: صافي المقبوضات (بعد خصم غير المصروف في الأشهر المنتهية)
// والمصروف منها نقداً خلال الشهر. تظهر فقط الجهات التي لها حركة في الشهر.
function getMonthCashReport(f) {
  const { from, to } = parsePeriod(f);
  syncCash();

  const byParty = db
    .prepare("SELECT id, name FROM loan_types ORDER BY id")
    .all()
    .map((p) => ({
      id: p.id,
      name: p.name,
      loans_total: round2(sumLoans(p.id, from, to)),
      spent_total: round2(sumExpenses(p.id, from, to)),
    }))
    .filter((p) => p.loans_total !== 0 || p.spent_total !== 0);

  return { byParty };
}

/* ---------- الخلاصة الشهرية ---------- */
// مصروفات الشهر لكل جهة مستفيدة، ومجموع صافي مقبوضات الشهر
function getMonthSummary(f) {
  const { from, to } = parsePeriod(f);
  syncCash();

  const destinations = db
    .prepare(
      `SELECT d.id, d.name,
              (SELECT COUNT(*) FROM expenses
               WHERE destination_id = d.id AND date >= ? AND date <= ?) AS expenses_count,
              COALESCE((SELECT SUM(cash_out) FROM expenses
                        WHERE destination_id = d.id AND date >= ? AND date <= ?), 0) AS expenses_total
       FROM destinations d
       ORDER BY d.id`,
    )
    .all(from, to, from, to);

  const loansTotal = db
    .prepare(
      `SELECT COALESCE(SUM(amount - carry_deduct), 0) AS v FROM loans
       WHERE date >= ? AND date <= ?`,
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

  const column = f.by === "spender" ? "e.loan_type_id" : "e.destination_id";

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

  syncCash();

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
  getFundingParties,
  addFundingParty,
  getSpendersReport,
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getDebtsSummary,
  getDebtItems,
  getDebtsReport,
  settleDebt,
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

// end db.js