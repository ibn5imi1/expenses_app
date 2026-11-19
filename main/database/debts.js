const { conn } = require('./connection');
const { round2, cleanIds } = require('./helpers');
const { EXPENSE_SELECT, ACTIVE_DEBT } = require('./queries');
const { hasSettlement } = require('./expenses');
const { syncCash } = require('./cash-sync');

// الجهة الدائنة = الجهة المستفيدة، ومجموع الديون = مجموع المتبقي
function getDebtsSummary() {
    return conn.db.prepare(
        `SELECT d.id, d.name, COALESCE(SUM(e.remaining), 0) AS total
         FROM expenses e JOIN destinations d ON d.id = e.destination_id
         WHERE ${ACTIVE_DEBT}
         GROUP BY d.id ORDER BY d.id`,
    ).all();
}

function getDebtItems(destinationId) {
    return conn.db.prepare(
        `${EXPENSE_SELECT} WHERE e.destination_id = ? AND ${ACTIVE_DEBT} ORDER BY e.date ASC, e.id ASC`,
    ).all(Number(destinationId));
}

// ids = أرقام الجهات الدائنة المختارة
function getDebtsReport(ids) {
    const list = cleanIds(ids);
    if (!list.length) return [];
    return conn.db.prepare(
        `${EXPENSE_SELECT}
         WHERE e.destination_id IN (${list.map(() => '?').join(',')}) AND ${ACTIVE_DEBT}
         ORDER BY e.destination_id, e.date ASC, e.id ASC`,
    ).all(...list);
}

// تسديد: قيد جديد بنفس بيانات القيد القديم، والأصل لا يتغير. d = { expenseId, amount, date }
function settleDebt(d, user) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) throw new Error('التاريخ غير صحيح');

    const old = conn.db.prepare('SELECT * FROM expenses WHERE id = ?').get(d.expenseId);
    if (!old) throw new Error('المصروف غير موجود');
    if (hasSettlement(old.id)) throw new Error('تم تسديد هذا الدين سابقاً، حدّث البيانات');
    if (!(old.remaining > 0)) throw new Error('لا يوجد متبقٍ على هذا المصروف');

    const pay = round2(Number(d.amount));
    if (!(pay > 0)) throw new Error('مبلغ التسديد غير صحيح');
    if (pay > old.remaining) throw new Error('مبلغ التسديد أكبر من المتبقي');

    const result = conn.db.prepare(
        `INSERT INTO expenses
           (amount, remaining, cash_out, settles_id, receipt_no, details, date, note,
            destination_id, spender_id, loan_type_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        old.amount, round2(old.remaining - pay), pay, old.id, old.receipt_no, old.details, d.date,
        'تسديد قديم', old.destination_id, old.spender_id, old.loan_type_id, user, new Date().toISOString(),
    );
    syncCash();
    return result.lastInsertRowid;
}

module.exports = { getDebtsSummary, getDebtItems, getDebtsReport, settleDebt };