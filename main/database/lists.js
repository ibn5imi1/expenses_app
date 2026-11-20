const { conn } = require('./connection');
const { isConstraintError, cleanName, parsePeriod, currentMonthKey } = require('./helpers');

// الجهات القائمة بالصرف والمصادر لا تُحذف نهائياً إن كانت مستخدمة في سجلات قديمة،
// بل تُخفى (is_active = 0) فتبقى أسماؤها في السجلات القديمة
const SOFT = new Set(['spenders', 'loan_types']);

function insertName(table, name, label) {
    const db = conn.db;
    const clean = cleanName(name, label);

    if (SOFT.has(table)) {
        const found = db.prepare(`SELECT id, is_active FROM ${table} WHERE name = ?`).get(clean);
        if (found) {
            if (found.is_active) throw new Error('هذا الاسم موجود مسبقاً');
            db.prepare(`UPDATE ${table} SET is_active = 1 WHERE id = ?`).run(found.id);   // اسم محذوف سابقاً: نعيد تفعيله
            return found.id;
        }
    }

    try {
        return db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(clean).lastInsertRowid;
    } catch (err) {
        if (isConstraintError(err)) throw new Error('هذا الاسم موجود مسبقاً');
        throw err;
    }
}

// الشهر الحالي (حسب تاريخ الجهاز)
function currentMonthRange() {
    const key = currentMonthKey();
    return { from: `${key}-01`, to: `${key}-31` };
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
// تُرجع الكل مع is_active، والواجهة تُظهر الفعّالة فقط في القوائم
const getSpenders = () => conn.db.prepare('SELECT id, name, is_active FROM spenders ORDER BY id').all();
const addSpender = name => insertName('spenders', name, 'الجهة القائمة بالصرف');

// الحذف مسموح إن لم يكن عليها مصروفات هذا الشهر
function deleteSpender(id) {
    const db = conn.db;
    const row = db.prepare('SELECT name, is_active FROM spenders WHERE id = ?').get(id);
    if (!row || !row.is_active) throw new Error('الجهة غير موجودة');

    const { from, to } = currentMonthRange();
    const count = db.prepare(
        'SELECT COUNT(*) AS c FROM expenses WHERE spender_id = ? AND date >= ? AND date <= ?',
    ).get(id, from, to).c;
    if (count) throw new Error(`لا يمكن حذف الجهة «${row.name}» لأن عليها ${count} مصروف هذا الشهر`);

    if (db.prepare('SELECT 1 FROM expenses WHERE spender_id = ? LIMIT 1').get(id)) {
        db.prepare('UPDATE spenders SET is_active = 0 WHERE id = ?').run(id);   // تبقى لسجلاتها القديمة
    } else {
        db.prepare('DELETE FROM spenders WHERE id = ?').run(id);
    }
}

// كشف شهري: عدد المصروفات ومجموع المدفوع نقداً لكل جهة قائمة بالصرف
// الجهة المحذوفة تظهر فقط في الأشهر التي كان لها فيها مصروفات
function getSpendersReport(f) {
    const { from, to } = parsePeriod(f);
    return conn.db.prepare(
        `SELECT s.id, s.name, s.is_active,
                (SELECT COUNT(*) FROM expenses
                 WHERE spender_id = s.id AND date >= ? AND date <= ?) AS expenses_count,
                COALESCE((SELECT SUM(cash_out) FROM expenses
                          WHERE spender_id = s.id AND date >= ? AND date <= ?), 0) AS expenses_total
         FROM spenders s
         WHERE s.is_active = 1
            OR EXISTS (SELECT 1 FROM expenses WHERE spender_id = s.id AND date >= ? AND date <= ?)
         ORDER BY s.id`,
    ).all(from, to, from, to, from, to);
}

/* ---------- المصادر (مصدر المقبوض ومصدر الاستقطاع) ---------- */
// month_count = مقبوضات هذا الشهر + المصروفات المستقطعة منه هذا الشهر
function getSources() {
    const { from, to } = currentMonthRange();
    return conn.db.prepare(
        `SELECT t.id, t.name, t.is_active,
                (SELECT COUNT(*) FROM loans
                 WHERE loan_type_id = t.id AND date >= ? AND date <= ?)
              + (SELECT COUNT(*) FROM expenses
                 WHERE loan_type_id = t.id AND date >= ? AND date <= ?) AS month_count
         FROM loan_types t ORDER BY t.id`,
    ).all(from, to, from, to);
}

const addSource = name => insertName('loan_types', name, 'المصدر');

// الحذف مسموح إن لم يكن منه مقبوض (أو مصروف مستقطع) هذا الشهر
function deleteSource(id) {
    const db = conn.db;
    const row = db.prepare('SELECT name, is_active FROM loan_types WHERE id = ?').get(id);
    if (!row || !row.is_active) throw new Error('المصدر غير موجود');

    const { from, to } = currentMonthRange();
    const loans = db.prepare(
        'SELECT COUNT(*) AS c FROM loans WHERE loan_type_id = ? AND date >= ? AND date <= ?',
    ).get(id, from, to).c;
    const expenses = db.prepare(
        'SELECT COUNT(*) AS c FROM expenses WHERE loan_type_id = ? AND date >= ? AND date <= ?',
    ).get(id, from, to).c;

    if (loans || expenses) {
        const parts = [loans && `${loans} مقبوض`, expenses && `${expenses} مصروف مستقطع`].filter(Boolean);
        throw new Error(`لا يمكن حذف المصدر «${row.name}» لأن منه ${parts.join(' و')} هذا الشهر`);
    }

    const used =
        db.prepare('SELECT 1 FROM loans WHERE loan_type_id = ? LIMIT 1').get(id) ||
        db.prepare('SELECT 1 FROM expenses WHERE loan_type_id = ? LIMIT 1').get(id);

    if (used) db.prepare('UPDATE loan_types SET is_active = 0 WHERE id = ?').run(id);   // يبقى لسجلاته القديمة
    else db.prepare('DELETE FROM loan_types WHERE id = ?').run(id);
}

module.exports = {
    getDestinations, addDestination, updateDestination, deleteDestination,
    getSpenders, addSpender, deleteSpender, getSpendersReport,
    getSources, addSource, deleteSource,
};