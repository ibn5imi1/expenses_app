const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');

let db;

function init() {
    const file = path.join(app.getPath('userData'), 'college.db');
    db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

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
    `);

    seed();
    migrate();
}

// البيانات الأساسية تُدخل مرة واحدة فقط عندما تكون الجداول فارغة
function seed() {
    db.transaction(() => {
        if (db.prepare('SELECT COUNT(*) AS c FROM destinations').get().c === 0) {
            const insert = db.prepare('INSERT INTO destinations (name, is_fixed) VALUES (?, ?)');
            insert.run('الكلية', 1);   // ثابتة
            ['مصروفات شخصية', 'كلية الذكاء', 'المتعففين', 'الخلاصة'].forEach(n => insert.run(n, 0));
        }

        if (db.prepare('SELECT COUNT(*) AS c FROM loan_types').get().c === 0) {
            db.prepare('INSERT INTO loan_types (name, is_fixed) VALUES (?, 1)').run('سلفة كلية');   // ثابتة
        }

        db.prepare(`
            INSERT INTO settings (key, value) VALUES ('schema_version', '4')
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run();
    })();
}

// ترحيل القواعد القديمة
function migrate() {
    const hasColumn = (table, column) =>
        db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);

    // عمود نوع السلفة في المصروفات
    if (!hasColumn('expenses', 'loan_type_id')) {
        db.exec('ALTER TABLE expenses ADD COLUMN loan_type_id INTEGER REFERENCES loan_types(id)');
    }

    const fixed = db.prepare('SELECT id FROM loan_types WHERE is_fixed = 1').get();
    db.prepare('UPDATE expenses SET loan_type_id = ? WHERE loan_type_id IS NULL').run(fixed.id);

    // عمود قديم من نسخة سابقة في جهات الصرف: لم نعد نستخدمه
    if (hasColumn('destinations', 'loan_type_id')) {
        db.prepare('UPDATE destinations SET loan_type_id = NULL').run();
    }
}

function isConstraintError(err) {
    return String(err.code).startsWith('SQLITE_CONSTRAINT');
}

/* ---------- جهات الصرف ---------- */
function getDestinations() {
    return db.prepare(`
        SELECT d.id, d.name, d.is_fixed,
               (SELECT COUNT(*) FROM expenses WHERE destination_id = d.id) AS expenses_count,
               COALESCE((SELECT SUM(amount) FROM expenses WHERE destination_id = d.id), 0) AS expenses_total
        FROM destinations d
        ORDER BY d.id
    `).all();
}

function cleanDestinationName(name) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    if (!clean) throw new Error('اسم الجهة مطلوب');
    return clean;
}

function addDestination(name) {
    const clean = cleanDestinationName(name);
    try {
        return db.prepare('INSERT INTO destinations (name, is_fixed) VALUES (?, 0)').run(clean).lastInsertRowid;
    } catch (err) {
        if (isConstraintError(err)) throw new Error('هذه الجهة موجودة مسبقاً');
        throw err;
    }
}

function updateDestination(id, name) {
    const clean = cleanDestinationName(name);

    const dest = db.prepare('SELECT is_fixed FROM destinations WHERE id = ?').get(id);
    if (!dest) throw new Error('الجهة غير موجودة');
    if (dest.is_fixed) throw new Error('لا يمكن تعديل هذه الجهة');

    try {
        db.prepare('UPDATE destinations SET name = ? WHERE id = ?').run(clean, id);
    } catch (err) {
        if (isConstraintError(err)) throw new Error('هذه الجهة موجودة مسبقاً');
        throw err;
    }
}

function deleteDestination(id) {
    const dest = db.prepare('SELECT is_fixed FROM destinations WHERE id = ?').get(id);
    if (!dest) throw new Error('الجهة غير موجودة');
    if (dest.is_fixed) throw new Error('لا يمكن حذف هذه الجهة');

    const count = db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE destination_id = ?').get(id).c;
    if (count) throw new Error(`لا يمكن حذف جهة لديها ${count} مصروف`);

    db.prepare('DELETE FROM destinations WHERE id = ?').run(id);
}

/* ---------- المصروفات ---------- */
function validateExpense(d) {
    if (!(Number(d.amount) > 0)) throw new Error('المبلغ غير صحيح');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) throw new Error('التاريخ غير صحيح');
    if (!String(d.details || '').trim()) throw new Error('التفاصيل مطلوبة');

    const dest = db.prepare('SELECT id FROM destinations WHERE id = ?').get(d.destinationId);
    if (!dest) throw new Error('جهة الصرف غير موجودة');

    const type = db.prepare('SELECT id FROM loan_types WHERE id = ?').get(d.loanTypeId);
    if (!type) throw new Error('نوع السلفة غير موجود');
}

function getExpenses() {
    return db.prepare(`
        SELECT e.id, e.amount, e.details, e.date, e.note,
               e.destination_id, d.name AS destination,
               e.loan_type_id, t.name AS loan_type,
               e.created_by, e.created_at, e.updated_by, e.updated_at
        FROM expenses e
        JOIN destinations d ON d.id = e.destination_id
        JOIN loan_types t ON t.id = e.loan_type_id
        ORDER BY e.id DESC
        LIMIT 15
    `).all();
}

function addExpense(d, user) {
    validateExpense(d);
    const result = db.prepare(`
        INSERT INTO expenses (amount, details, date, note, destination_id, loan_type_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        Number(d.amount),
        d.details.trim(),
        d.date,
        String(d.note || '').trim(),
        d.destinationId,
        d.loanTypeId,
        user,
        new Date().toISOString()
    );
    return result.lastInsertRowid;
}

function updateExpense(id, d, user) {
    validateExpense(d);
    const result = db.prepare(`
        UPDATE expenses
        SET amount = ?, details = ?, date = ?, note = ?, destination_id = ?, loan_type_id = ?,
            updated_by = ?, updated_at = ?
        WHERE id = ?
    `).run(
        Number(d.amount),
        d.details.trim(),
        d.date,
        String(d.note || '').trim(),
        d.destinationId,
        d.loanTypeId,
        user,
        new Date().toISOString(),
        id
    );
    if (result.changes === 0) throw new Error('المصروف غير موجود');
}

function deleteExpense(id) {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
}

/* ---------- أنواع السلف ---------- */
function getLoanTypes() {
    return db.prepare('SELECT id, name, is_fixed FROM loan_types ORDER BY id').all();
}

function cleanTypeName(name) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    if (!clean) throw new Error('اسم النوع مطلوب');
    return clean;
}

function addLoanType(name) {
    const clean = cleanTypeName(name);
    try {
        return db.prepare('INSERT INTO loan_types (name, is_fixed) VALUES (?, 0)').run(clean).lastInsertRowid;
    } catch (err) {
        if (isConstraintError(err)) throw new Error('هذا النوع موجود مسبقاً');
        throw err;
    }
}

function updateLoanType(id, name) {
    const clean = cleanTypeName(name);
    const type = db.prepare('SELECT is_fixed FROM loan_types WHERE id = ?').get(id);
    if (!type) throw new Error('النوع غير موجود');
    if (type.is_fixed) throw new Error('لا يمكن تعديل هذا النوع');

    try {
        db.prepare('UPDATE loan_types SET name = ? WHERE id = ?').run(clean, id);
    } catch (err) {
        if (isConstraintError(err)) throw new Error('هذا النوع موجود مسبقاً');
        throw err;
    }
}

function deleteLoanType(id) {
    const type = db.prepare('SELECT is_fixed FROM loan_types WHERE id = ?').get(id);
    if (!type) throw new Error('النوع غير موجود');
    if (type.is_fixed) throw new Error('لا يمكن حذف هذا النوع');

    const loansCount = db.prepare('SELECT COUNT(*) AS c FROM loans WHERE loan_type_id = ?').get(id).c;
    const expensesCount = db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE loan_type_id = ?').get(id).c;
    if (loansCount || expensesCount) {
        throw new Error(`لا يمكن حذف نوع مستخدم في ${loansCount} سلفة و${expensesCount} مصروف`);
    }

    db.prepare('DELETE FROM loan_types WHERE id = ?').run(id);
}

/* ---------- السلف ---------- */
function validateLoan(d) {
    if (!(Number(d.amount) > 0)) throw new Error('المقدار غير صحيح');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) throw new Error('التاريخ غير صحيح');
    if (!String(d.source || '').trim()) throw new Error('المصدر مطلوب');

    const type = db.prepare('SELECT id FROM loan_types WHERE id = ?').get(d.loanTypeId);
    if (!type) throw new Error('نوع السلفة غير موجود');
}

function getLoans() {
    return db.prepare(`
        SELECT l.id, l.amount, l.date, l.source,
               l.loan_type_id, t.name AS loan_type,
               l.created_by, l.created_at, l.updated_by, l.updated_at
        FROM loans l
        JOIN loan_types t ON t.id = l.loan_type_id
        ORDER BY l.id DESC
        LIMIT 15
    `).all();
}

function addLoan(d, user) {
    validateLoan(d);
    return db.prepare(`
        INSERT INTO loans (amount, date, source, loan_type_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        Number(d.amount), d.date, d.source.trim(), d.loanTypeId, user, new Date().toISOString()
    ).lastInsertRowid;
}

function updateLoan(id, d, user) {
    validateLoan(d);
    const result = db.prepare(`
        UPDATE loans
        SET amount = ?, date = ?, source = ?, loan_type_id = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
    `).run(
        Number(d.amount), d.date, d.source.trim(), d.loanTypeId, user, new Date().toISOString(), id
    );
    if (result.changes === 0) throw new Error('السلفة غير موجودة');
}

function deleteLoan(id) {
    db.prepare('DELETE FROM loans WHERE id = ?').run(id);
}

/* ---------- القاصة ---------- */
// لكل نوع سلفة: مجموع السلف ومجموع المصروفات المخصومة منه
function getCash() {
    return db.prepare(`
        SELECT t.id, t.name, t.is_fixed,
               COALESCE((SELECT SUM(amount) FROM loans    WHERE loan_type_id = t.id), 0) AS loans_total,
               COALESCE((SELECT SUM(amount) FROM expenses WHERE loan_type_id = t.id), 0) AS spent_total
        FROM loan_types t
        ORDER BY t.id
    `).all();
}

/* ---------- الكشوفات ---------- */
function assertDate(value, label) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(`${label} غير صحيح`);
}

function cleanIds(list) {
    return (Array.isArray(list) ? list : []).map(Number).filter(Number.isInteger);
}

function getExpensesReport(f) {
    assertDate(f.from, 'تاريخ البداية');
    assertDate(f.to, 'تاريخ النهاية');

    const ids = cleanIds(f.destinationIds);
    if (!ids.length) return [];

    return db.prepare(`
        SELECT e.id, e.amount, e.details, e.date, e.note, d.name AS destination
        FROM expenses e
        JOIN destinations d ON d.id = e.destination_id
        WHERE e.destination_id IN (${ids.map(() => '?').join(',')})
          AND e.date >= ? AND e.date <= ?
        ORDER BY e.date ASC, e.id ASC
    `).all(...ids, f.from, f.to);
}

function getLoansReport(f) {
    assertDate(f.from, 'تاريخ البداية');
    assertDate(f.to, 'تاريخ النهاية');

    const ids = cleanIds(f.loanTypeIds);
    if (!ids.length) return [];

    return db.prepare(`
        SELECT l.id, l.amount, l.date, l.source, t.name AS loan_type
        FROM loans l
        JOIN loan_types t ON t.id = l.loan_type_id
        WHERE l.loan_type_id IN (${ids.map(() => '?').join(',')})
          AND l.date >= ? AND l.date <= ?
        ORDER BY l.date ASC, l.id ASC
    `).all(...ids, f.from, f.to);
}

module.exports = {
    init,
    getDestinations, addDestination, updateDestination, deleteDestination,
    getExpenses, addExpense, updateExpense, deleteExpense,
    getLoanTypes, addLoanType, updateLoanType, deleteLoanType,
    getLoans, addLoan, updateLoan, deleteLoan,
    getCash,
    getExpensesReport, getLoansReport,
};