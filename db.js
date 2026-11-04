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

        CREATE TABLE IF NOT EXISTS expenses (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            amount         REAL NOT NULL,
            details        TEXT NOT NULL,
            date           TEXT NOT NULL,
            note           TEXT NOT NULL DEFAULT '',
            destination_id INTEGER NOT NULL REFERENCES destinations(id),
            destination_id INTEGER NOT NULL REFERENCES destinations(id),
            loan_type_id   INTEGER REFERENCES loan_types(id),
            created_by     TEXT NOT NULL,
            created_at     TEXT NOT NULL,
            updated_by     TEXT,
            updated_at     TEXT
        );

        CREATE TABLE IF NOT EXISTS loan_types (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT NOT NULL UNIQUE,
            is_fixed INTEGER NOT NULL DEFAULT 0
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

// جهات الصرف الأساسية تُدخل مرة واحدة فقط عندما يكون الجدول فارغاً
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
            INSERT INTO settings (key, value) VALUES ('schema_version', '3')
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run();
    })();
}

// ترحيل القواعد القديمة: إضافة عمود نوع السلفة للمصروفات
function migrate() {
    const cols = db.prepare('PRAGMA table_info(expenses)').all().map(c => c.name);
    if (!cols.includes('loan_type_id')) {
        db.exec('ALTER TABLE expenses ADD COLUMN loan_type_id INTEGER REFERENCES loan_types(id)');
    }

    const fixed = db.prepare('SELECT id FROM loan_types WHERE is_fixed = 1').get();
    db.prepare('UPDATE expenses SET loan_type_id = ? WHERE loan_type_id IS NULL').run(fixed.id);
}
/* ---------- جهات الصرف ---------- */
function getDestinations() {
    return db.prepare('SELECT id, name, is_fixed FROM destinations ORDER BY id').all();
}

/* ---------- المصروفات ---------- */
function validateExpense(d) {
    if (!(Number(d.amount) > 0)) throw new Error('المبلغ غير صحيح');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) throw new Error('التاريخ غير صحيح');
    if (!String(d.details || '').trim()) throw new Error('التفاصيل مطلوبة');

    const dest = db.prepare('SELECT id FROM destinations WHERE id = ?').get(d.destinationId);
    if (!dest) throw new Error('جهة الصرف غير موجودة');
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

function isConstraintError(err) {
    return String(err.code).startsWith('SQLITE_CONSTRAINT');
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

module.exports = {
    init, getDestinations,
    getExpenses, addExpense, updateExpense, deleteExpense,
     getLoanTypes, addLoanType, updateLoanType, deleteLoanType,
    getLoans, addLoan, updateLoan, deleteLoan,
};

