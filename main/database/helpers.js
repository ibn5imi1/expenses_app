const { conn } = require('./connection');

const MIN_DATE = '0000-01-01';
const round2 = n => Math.round(n * 100) / 100;
const isConstraintError = err => String(err.code).startsWith('SQLITE_CONSTRAINT');

function getSetting(key) {
    const row = conn.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setSetting(key, value) {
    conn.db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(key, value);
}

// 'YYYY-MM' + عدد أشهر
function shiftMonthKey(key, delta) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// يتحقق من السنة والشهر ويرجع حدود الشهر
function parsePeriod(f) {
    const year = Number(f && f.year);
    const month = Number(f && f.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('السنة غير صحيحة');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('الشهر غير صحيح');

    const key = `${year}-${String(month).padStart(2, '0')}`;
    return { key, from: `${key}-01`, to: `${key}-31` };
}

function assertDate(value, label) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(`${label} غير صحيح`);
}

const cleanIds = list => (Array.isArray(list) ? list : []).map(Number).filter(Number.isInteger);

function cleanName(name, label = 'الجهة') {
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    if (!clean) throw new Error(`اسم ${label} مطلوب`);
    if (clean.length > 60) throw new Error(`اسم ${label} طويل جداً`);
    return clean;
}

module.exports = {
    MIN_DATE, round2, isConstraintError, getSetting, setSetting,
    shiftMonthKey, currentMonthKey, parsePeriod, assertDate, cleanIds, cleanName,
};