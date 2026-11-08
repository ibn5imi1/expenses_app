const bcrypt = require("bcryptjs");
const path = require("path");
const { app } = require("electron");
const Database = require("better-sqlite3");

let db;

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
            source       TEXT NOT NULL,
            loan_type_id INTEGER NOT NULL REFERENCES loan_types(id),
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

    if (db.prepare("SELECT COUNT(*) AS c FROM loan_types").get().c === 0) {
      db.prepare("INSERT INTO loan_types (name, is_fixed) VALUES (?, 1)").run(
        "سلفة كلية",
      ); // ثابتة
    }

    if (db.prepare("SELECT COUNT(*) AS c FROM users").get().c === 0) {
      db.prepare(
        `
                INSERT INTO users (username, display_name, password_hash, role, created_at)
                VALUES (?, ?, ?, 'admin', ?)
            `,
      ).run(
        "admin",
        "الأدمن",
        bcrypt.hashSync("admin", 10),
        new Date().toISOString(),
      );
    }

    db.prepare(
      `
            INSERT INTO settings (key, value) VALUES ('schema_version', '5')
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `,
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

  // عمود نوع السلفة في المصروفات
  if (!hasColumn("expenses", "loan_type_id")) {
    db.exec(
      "ALTER TABLE expenses ADD COLUMN loan_type_id INTEGER REFERENCES loan_types(id)",
    );
  }

  const fixed = db
    .prepare("SELECT id FROM loan_types WHERE is_fixed = 1")
    .get();
  db.prepare(
    "UPDATE expenses SET loan_type_id = ? WHERE loan_type_id IS NULL",
  ).run(fixed.id);

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
}

function isConstraintError(err) {
  return String(err.code).startsWith("SQLITE_CONSTRAINT");
}

/* ---------- جهات الصرف ---------- */
function getDestinations() {
  return db
    .prepare(
      `
        SELECT d.id, d.name, d.is_fixed,
               (SELECT COUNT(*) FROM expenses WHERE destination_id = d.id) AS expenses_count,
               COALESCE((SELECT SUM(amount) FROM expenses WHERE destination_id = d.id), 0) AS expenses_total
        FROM destinations d
        ORDER BY d.id
    `,
    )
    .all();
}

function cleanDestinationName(name) {
  const clean = String(name || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) throw new Error("اسم الجهة مطلوب");
  return clean;
}

function addDestination(name) {
  const clean = cleanDestinationName(name);
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
  const clean = cleanDestinationName(name);

  const dest = db
    .prepare("SELECT is_fixed FROM destinations WHERE id = ?")
    .get(id);
  if (!dest) throw new Error("الجهة غير موجودة");
  if (dest.is_fixed) throw new Error("لا يمكن تعديل هذه الجهة");

  try {
    db.prepare("UPDATE destinations SET name = ? WHERE id = ?").run(clean, id);
  } catch (err) {
    if (isConstraintError(err)) throw new Error("هذه الجهة موجودة مسبقاً");
    throw err;
  }
}

function deleteDestination(id) {
  const dest = db
    .prepare("SELECT is_fixed FROM destinations WHERE id = ?")
    .get(id);
  if (!dest) throw new Error("الجهة غير موجودة");
  if (dest.is_fixed) throw new Error("لا يمكن حذف هذه الجهة");

  const count = db
    .prepare("SELECT COUNT(*) AS c FROM expenses WHERE destination_id = ?")
    .get(id).c;
  if (count) throw new Error(`لا يمكن حذف جهة لديها ${count} مصروف`);

  db.prepare("DELETE FROM destinations WHERE id = ?").run(id);
}

/* ---------- المصروفات ---------- */
function validateExpense(d) {
  if (!(Number(d.amount) > 0)) throw new Error("المبلغ غير صحيح");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
    throw new Error("التاريخ غير صحيح");
  if (!String(d.details || "").trim()) throw new Error("التفاصيل مطلوبة");

  const dest = db
    .prepare("SELECT id FROM destinations WHERE id = ?")
    .get(d.destinationId);
  if (!dest) throw new Error("جهة الصرف غير موجودة");

  const type = db
    .prepare("SELECT id FROM loan_types WHERE id = ?")
    .get(d.loanTypeId);
  if (!type) throw new Error("نوع السلفة غير موجود");
}

function getExpenses() {
  return db
    .prepare(
      `
        SELECT e.id, e.amount, e.details, e.date, e.note,
               e.destination_id, d.name AS destination,
               e.loan_type_id, t.name AS loan_type,
               e.created_by, e.created_at, e.updated_by, e.updated_at
        FROM expenses e
        JOIN destinations d ON d.id = e.destination_id
        JOIN loan_types t ON t.id = e.loan_type_id
        ORDER BY e.id DESC
        LIMIT 100
    `,
    )
    .all();
}

function addExpense(d, user) {
  validateExpense(d);
  const result = db
    .prepare(
      `
        INSERT INTO expenses (amount, details, date, note, destination_id, loan_type_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      Number(d.amount),
      d.details.trim(),
      d.date,
      String(d.note || "").trim(),
      d.destinationId,
      d.loanTypeId,
      user,
      new Date().toISOString(),
    );
  return result.lastInsertRowid;
}

function updateExpense(id, d, user) {
  validateExpense(d);
  const result = db
    .prepare(
      `
        UPDATE expenses
        SET amount = ?, details = ?, date = ?, note = ?, destination_id = ?, loan_type_id = ?,
            updated_by = ?, updated_at = ?
        WHERE id = ?
    `,
    )
    .run(
      Number(d.amount),
      d.details.trim(),
      d.date,
      String(d.note || "").trim(),
      d.destinationId,
      d.loanTypeId,
      user,
      new Date().toISOString(),
      id,
    );
  if (result.changes === 0) throw new Error("المصروف غير موجود");
}

function deleteExpense(id) {
  db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
}

/* ---------- أنواع السلف ---------- */
function getLoanTypes() {
  return db
    .prepare("SELECT id, name, is_fixed FROM loan_types ORDER BY id")
    .all();
}

function cleanTypeName(name) {
  const clean = String(name || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) throw new Error("اسم النوع مطلوب");
  return clean;
}

function addLoanType(name) {
  const clean = cleanTypeName(name);
  try {
    return db
      .prepare("INSERT INTO loan_types (name, is_fixed) VALUES (?, 0)")
      .run(clean).lastInsertRowid;
  } catch (err) {
    if (isConstraintError(err)) throw new Error("هذا النوع موجود مسبقاً");
    throw err;
  }
}

function updateLoanType(id, name) {
  const clean = cleanTypeName(name);
  const type = db
    .prepare("SELECT is_fixed FROM loan_types WHERE id = ?")
    .get(id);
  if (!type) throw new Error("النوع غير موجود");
  if (type.is_fixed) throw new Error("لا يمكن تعديل هذا النوع");

  try {
    db.prepare("UPDATE loan_types SET name = ? WHERE id = ?").run(clean, id);
  } catch (err) {
    if (isConstraintError(err)) throw new Error("هذا النوع موجود مسبقاً");
    throw err;
  }
}

function deleteLoanType(id) {
  const type = db
    .prepare("SELECT is_fixed FROM loan_types WHERE id = ?")
    .get(id);
  if (!type) throw new Error("النوع غير موجود");
  if (type.is_fixed) throw new Error("لا يمكن حذف هذا النوع");

  const loansCount = db
    .prepare("SELECT COUNT(*) AS c FROM loans WHERE loan_type_id = ?")
    .get(id).c;
  const expensesCount = db
    .prepare("SELECT COUNT(*) AS c FROM expenses WHERE loan_type_id = ?")
    .get(id).c;
  if (loansCount || expensesCount) {
    throw new Error(
      `لا يمكن حذف نوع مستخدم في ${loansCount} سلفة و${expensesCount} مصروف`,
    );
  }

  db.prepare("DELETE FROM loan_types WHERE id = ?").run(id);
}

/* ---------- السلف ---------- */
function validateLoan(d) {
  if (!(Number(d.amount) > 0)) throw new Error("المقدار غير صحيح");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
    throw new Error("التاريخ غير صحيح");
  if (!String(d.source || "").trim()) throw new Error("المصدر مطلوب");

  const type = db
    .prepare("SELECT id FROM loan_types WHERE id = ?")
    .get(d.loanTypeId);
  if (!type) throw new Error("نوع السلفة غير موجود");
}

function getLoans() {
  return db
    .prepare(
      `
        SELECT l.id, l.amount, l.date, l.source,
               l.loan_type_id, t.name AS loan_type,
               l.created_by, l.created_at, l.updated_by, l.updated_at
        FROM loans l
        JOIN loan_types t ON t.id = l.loan_type_id
        ORDER BY l.id DESC
        LIMIT 15
    `,
    )
    .all();
}

function addLoan(d, user) {
  validateLoan(d);
  return db
    .prepare(
      `
        INSERT INTO loans (amount, date, source, loan_type_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      Number(d.amount),
      d.date,
      d.source.trim(),
      d.loanTypeId,
      user,
      new Date().toISOString(),
    ).lastInsertRowid;
}

function updateLoan(id, d, user) {
  validateLoan(d);
  const result = db
    .prepare(
      `
        UPDATE loans
        SET amount = ?, date = ?, source = ?, loan_type_id = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
    `,
    )
    .run(
      Number(d.amount),
      d.date,
      d.source.trim(),
      d.loanTypeId,
      user,
      new Date().toISOString(),
      id,
    );
  if (result.changes === 0) throw new Error("السلفة غير موجودة");
}

function deleteLoan(id) {
  db.prepare("DELETE FROM loans WHERE id = ?").run(id);
}

/* ---------- القاصة ---------- */
// لكل نوع سلفة: مجموع السلف ومجموع المصروفات المخصومة منه
function getCash() {
  return db
    .prepare(
      `
        SELECT t.id, t.name, t.is_fixed,
               COALESCE((SELECT SUM(amount) FROM loans    WHERE loan_type_id = t.id), 0) AS loans_total,
               COALESCE((SELECT SUM(amount) FROM expenses WHERE loan_type_id = t.id), 0) AS spent_total
        FROM loan_types t
        ORDER BY t.id
    `,
    )
    .all();
}

/* ---------- الكشوفات ---------- */
function assertDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    throw new Error(`${label} غير صحيح`);
}

function cleanIds(list) {
  return (Array.isArray(list) ? list : []).map(Number).filter(Number.isInteger);
}

function getExpensesReport(f) {
  assertDate(f.from, "تاريخ البداية");
  assertDate(f.to, "تاريخ النهاية");

  const ids = cleanIds(f.destinationIds);
  if (!ids.length) return [];

  return db
    .prepare(
      `
        SELECT e.id, e.amount, e.details, e.date, e.note,
               e.destination_id, d.name AS destination,
               e.loan_type_id, t.name AS loan_type,
               e.created_by, e.created_at, e.updated_by, e.updated_at
        FROM expenses e
        JOIN destinations d ON d.id = e.destination_id
        JOIN loan_types t ON t.id = e.loan_type_id
        WHERE e.destination_id IN (${ids.map(() => "?").join(",")})
          AND e.date >= ? AND e.date <= ?
        ORDER BY e.date ASC, e.id ASC
    `,
    )
    .all(...ids, f.from, f.to);
}

function getLoansReport(f) {
  assertDate(f.from, "تاريخ البداية");
  assertDate(f.to, "تاريخ النهاية");

  const ids = cleanIds(f.loanTypeIds);
  if (!ids.length) return [];

  return db
    .prepare(
      `
        SELECT l.id, l.amount, l.date, l.source,
               l.loan_type_id, t.name AS loan_type,
               l.created_by, l.created_at, l.updated_by, l.updated_at
        FROM loans l
        JOIN loan_types t ON t.id = l.loan_type_id
        WHERE l.loan_type_id IN (${ids.map(() => "?").join(",")})
          AND l.date >= ? AND l.date <= ?
        ORDER BY l.date ASC, l.id ASC
    `,
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
  const clean = String(name || "")
    .replace(/\s+/g, " ")
    .trim();
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
        `
            INSERT INTO users (username, display_name, password_hash, role, created_at)
            VALUES (?, ?, ?, 'accountant', ?)
        `,
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

function resetPassword(userId, newPassword) {
  assertPassword(newPassword);

  const result = db
    .prepare(
      "UPDATE users SET password_hash = ? WHERE id = ? AND role = 'accountant'",
    )
    .run(bcrypt.hashSync(String(newPassword), 10), userId);
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

function updateAccountant(id, displayName, username, newPassword) {
  const name = cleanDisplayName(displayName);
  const clean = cleanUsername(username);
  const hasPassword = String(newPassword || "").length > 0;
  if (hasPassword) assertPassword(newPassword);

  const user = db
    .prepare("SELECT id FROM users WHERE id = ? AND role = 'accountant'")
    .get(id);
  if (!user) throw new Error("المحاسب غير موجود");

  if (db.prepare("SELECT 1 FROM users WHERE display_name = ? AND id <> ?").get(name, id)) {
    throw new Error("هذا الاسم مستخدم لمحاسب آخر");
  }

  try {
    db.transaction(() => {
      db.prepare("UPDATE users SET display_name = ?, username = ? WHERE id = ?").run(
        name,
        clean,
        id,
      );
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

/* ---------- كشف القاصة الشهري ---------- */
// الرصيد المرحّل: للأشهر حتى بداية الترحيل تراكمي، وبعدها هو سلف الترحيل المسجلة
// الحركات: السلف (وارد) والمصروفات (صادر) خلال الشهر، بدون السلف المرحّلة
function getMonthCashReport(f) {
  const year = Number(f.year);
  const month = Number(f.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    throw new Error("السنة غير صحيحة");
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new Error("الشهر غير صحيح");


  const key = `${year}-${String(month).padStart(2, "0")}`;
  const from = `${key}-01`;
  const to = `${key}-31`;
  const cumulative = key <= getSetting("carry_start_month");

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
        SELECT 'loan' AS kind, 0 AS sort_order, l.id, l.date, l.source AS text, l.amount,
               l.created_by, l.created_at, l.updated_by, l.updated_at
        FROM loans l
        WHERE l.is_carry = 0 AND l.date >= ? AND l.date <= ?
        UNION ALL
        SELECT 'expense' AS kind, 1 AS sort_order, e.id, e.date, e.details AS text, e.amount,
               e.created_by, e.created_at, e.updated_by, e.updated_at
        FROM expenses e
        WHERE e.date >= ? AND e.date <= ?
        ORDER BY date ASC, sort_order ASC, id ASC
      `,
    )
    .all(from, to, from, to);

  return { opening: round2(opening), rows };
}

module.exports = {
  init,
  getDestinations,
  addDestination,
  updateDestination,
  deleteDestination,
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getLoanTypes,
  addLoanType,
  updateLoanType,
  deleteLoanType,
  getLoans,
  addLoan,
  updateLoan,
  deleteLoan,
  getCash,
  getExpensesReport,
  getLoansReport,
  login,
  changePassword,
  getAccountants,
  addAccountant,
  resetPassword,
  recoverAdmin,
  updateAccountant,
  deleteAccountant,
    getMonthCashReport,
};