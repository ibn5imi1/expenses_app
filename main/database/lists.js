const { conn } = require('./connection');
const { isConstraintError, cleanName, parsePeriod } = require('./helpers');

function insertName(table, name, label) {
    const clean = cleanName(name, label);
    try {
        return conn.db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(clean).lastInsertRowid;
    } catch (err) {
        if (isConstraintError(err)) throw new Error('هذا الاسم موجود مسبقاً');
        throw err;
    }
}

/* ---------- الجهات المستفيدة ---------- */
function getDestinations() {
    return conn.db.prepare(
        `SELECT n.id, n.name, n.is_fixed,
                (SELECT COUNT(*) FROM expenses WHERE destination_id = n.id) AS expenses_count,
                COALESCE((SELECT SUM(cash_out) FROM expenses WHERE destination_id = n.id), 0) AS expenses_total
         FROM destinations n ORDER BY n.id`,
    ).all();
}

const addDestination = name => insertName('destinations', name, 'الجهة');

function updateDestination(id, name) {
    const clean = cleanName(name, 'الجهة');
    const row = conn.db.prepare('SELECT is_fixed FROM destinations WHERE id = ?').get(id);
    if (!row) throw new Error('الجهة غير موجودة');
    if (row.is_fixed) throw new Error('لا يمكن تعديل هذه الجهة');
    try {
        conn.db.prepare('UPDATE destinations SET name = ? WHERE id = ?').run(clean, id);
    } catch (err) {
        if (isConstraintError(err)) throw new Error('هذه الجهة موجودة مسبقاً');
        throw err;
    }
}

function deleteDestination(id) {
    const row = conn.db.prepare('SELECT is_fixed FROM destinations WHERE id = ?').get(id);
    if (!row) throw new Error('الجهة غير موجودة');
    if (row.is_fixed) throw new Error('لا يمكن حذف هذه الجهة');

    const count = conn.db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE destination_id = ?').get(id).c;
    if (count) throw new Error(`لا يمكن حذف جهة لديها ${count} مصروف`);
    conn.db.prepare('DELETE FROM destinations WHERE id = ?').run(id);
}

/* ---------- الجهات القائمة بالصرف ---------- */
const getSpenders = () => conn.db.prepare('SELECT id, name FROM spenders ORDER BY id').all();
const addSpender = name => insertName('spenders', name, 'الجهة القائمة بالصرف');

// كشف شهري: عدد المصروفات ومجموع المدفوع نقداً لكل جهة قائمة بالصرف
function getSpendersReport(f) {
    const { from, to } = parsePeriod(f);
    return conn.db.prepare(
        `SELECT s.id, s.name,
                (SELECT COUNT(*) FROM expenses
                 WHERE spender_id = s.id AND date >= ? AND date <= ?) AS expenses_count,
                COALESCE((SELECT SUM(cash_out) FROM expenses
                          WHERE spender_id = s.id AND date >= ? AND date <= ?), 0) AS expenses_total
         FROM spenders s ORDER BY s.id`,
    ).all(from, to, from, to);
}

/* ---------- المصادر (مصدر المقبوض ومصدر الاستقطاع) ---------- */
const getSources = () => conn.db.prepare('SELECT id, name FROM loan_types ORDER BY id').all();
const addSource = name => insertName('loan_types', name, 'المصدر');

module.exports = {
    getDestinations, addDestination, updateDestination, deleteDestination,
    getSpenders, addSpender, getSpendersReport, getSources, addSource,
};