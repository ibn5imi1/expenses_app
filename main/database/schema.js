const bcrypt = require('bcryptjs');
const { conn } = require('./connection');
const { getSetting, setSetting } = require('./helpers');

function createTables() {
    conn.db.exec(`
        CREATE TABLE IF NOT EXISTS destinations (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, is_fixed INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS spenders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, is_fixed INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS loan_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, is_fixed INTEGER NOT NULL DEFAULT 0
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
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
            display_name  TEXT,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL CHECK (role IN ('admin', 'accountant')),
            created_at    TEXT NOT NULL
        );
    `);
}

// البيانات الأساسية تُدخل مرة واحدة فقط عندما تكون الجداول فارغة
function seed() {
    const db = conn.db;
    db.transaction(() => {
        if (db.prepare('SELECT COUNT(*) AS c FROM destinations').get().c === 0) {
            const insert = db.prepare('INSERT INTO destinations (name, is_fixed) VALUES (?, ?)');
            insert.run('الكلية', 1);
            ['مصروفات شخصية', 'كلية الذكاء', 'المتعففين', 'الخلاصة'].forEach(n => insert.run(n, 0));
        }

        if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
            db.prepare(
                `INSERT INTO users (username, display_name, password_hash, role, created_at)
                 VALUES (?, ?, ?, 'admin', ?)`,
            ).run('admin', 'الأدمن', bcrypt.hashSync('admin', 10), new Date().toISOString());
        }

        setSetting('schema_version', '10');
    })();
}

// ترحيل القواعد القديمة (آمن للتكرار)
function migrate() {
    const db = conn.db;
    const hasColumn = (table, column) =>
        db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
    const addColumn = (table, column, def) => {
        if (!hasColumn(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    };

    addColumn('expenses', 'loan_type_id', 'INTEGER REFERENCES loan_types(id)');
    addColumn('expenses', 'spender_id', 'INTEGER REFERENCES spenders(id)');
    addColumn('expenses', 'remaining', 'REAL NOT NULL DEFAULT 0');
    addColumn('expenses', 'cash_out', 'REAL');
    addColumn('expenses', 'settles_id', 'INTEGER REFERENCES expenses(id)');
    addColumn('expenses', 'receipt_no', "TEXT NOT NULL DEFAULT ''");
    addColumn('loans', 'is_carry', 'INTEGER NOT NULL DEFAULT 0');
    addColumn('loans', 'carry_deduct', 'REAL NOT NULL DEFAULT 0');
    addColumn('users', 'display_name', 'TEXT');

    const first = db.prepare('SELECT id FROM loan_types ORDER BY id LIMIT 1').get();
    if (first) {
        db.prepare('UPDATE expenses SET loan_type_id = ? WHERE loan_type_id IS NULL').run(first.id);
    }
    if (hasColumn('destinations', 'loan_type_id')) {
        db.prepare('UPDATE destinations SET loan_type_id = NULL').run();
    }
    db.prepare(
        `UPDATE users SET display_name = CASE WHEN role = 'admin' THEN 'الأدمن' ELSE username END
         WHERE display_name IS NULL OR display_name = ''`,
    ).run();
    db.prepare('UPDATE loan_types SET is_fixed = 0 WHERE is_fixed = 1').run();
    db.prepare('UPDATE expenses SET cash_out = amount - remaining WHERE cash_out IS NULL').run();

    // النموذج الحالي: لا ترحيل، بل يُصفَّر المتبقي لكل مصدر عند انتهاء الشهر
    if (getSetting('carry_model') !== '3') {
        db.prepare('DELETE FROM loans WHERE is_carry = 1').run();
        db.prepare('UPDATE loans SET carry_deduct = 0').run();
        setSetting('carry_model', '3');
    }

    // مصادر قديمة اسمها «المتبقي في القاصة لشهر ...» وغير مستخدمة تُحذف
    db.prepare(
        `DELETE FROM loan_types
         WHERE name LIKE 'المتبقي في القاصة لشهر%'
           AND id NOT IN (SELECT loan_type_id FROM loans)
           AND id NOT IN (SELECT loan_type_id FROM expenses WHERE loan_type_id IS NOT NULL)`,
    ).run();

    // فصل «الجهة القائمة بالصرف» عن «المصدر»: كانتا قائمة واحدة، فننسخ أسماءها مرة واحدة
    // لتبقى المصروفات القديمة بجهتها
    if (getSetting('split_model') !== '1') {
        const insert = db.prepare('INSERT OR IGNORE INTO spenders (name) VALUES (?)');
        const findSpender = db.prepare('SELECT id FROM spenders WHERE name = ?');
        const assign = db.prepare(
            'UPDATE expenses SET spender_id = ? WHERE loan_type_id = ? AND spender_id IS NULL',
        );
        db.transaction(() => {
            for (const t of db.prepare('SELECT id, name FROM loan_types').all()) {
                insert.run(t.name);
                assign.run(findSpender.get(t.name).id, t.id);
            }
            setSetting('split_model', '1');
        })();
    }
}

module.exports = { createTables, seed, migrate };