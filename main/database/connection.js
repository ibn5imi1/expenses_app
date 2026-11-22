const Database = require("better-sqlite3");

// المقبض المشترك: بقية الملفات تقرأ conn.db، و conn.file مسار ملف القاعدة
const conn = { db: null, file: null };

function open(file) {
  conn.db = new Database(file);
  conn.file = file;
  conn.db.pragma("journal_mode = WAL");
  conn.db.pragma("foreign_keys = ON");
}

function close() {
  if (conn.db) {
    conn.db.close();
    conn.db = null;
  }
}

module.exports = { conn, open, close };
