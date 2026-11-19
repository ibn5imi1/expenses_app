const Database = require('better-sqlite3');

// المقبض المشترك: بقية الملفات تقرأ conn.db
const conn = { db: null };

function open(file) {
    conn.db = new Database(file);
    conn.db.pragma('journal_mode = WAL');
    conn.db.pragma('foreign_keys = ON');
}

module.exports = { conn, open };