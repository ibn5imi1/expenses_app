const { conn } = require('./connection');
const { round2, parsePeriod, assertDate, cleanIds } = require('./helpers');
const { EXPENSE_SELECT, LOAN_SELECT } = require('./queries');
const { sumLoans, sumExpenses, syncCash } = require('./cash-sync');

// القاصة الشهرية لكل مصدر: صافي المقبوضات (بعد خصم غير المصروف) والمصروف منه نقداً
function getMonthCashReport(f) {
    const { from, to } = parsePeriod(f);
    syncCash();

    const bySource = conn.db.prepare('SELECT id, name FROM loan_types ORDER BY id').all()
        .map(s => ({
            id: s.id,
            name: s.name,
            loans_total: round2(sumLoans(s.id, from, to)),
            spent_total: round2(sumExpenses(s.id, from, to)),
        }))
        .filter(s => s.loans_total !== 0 || s.spent_total !== 0);

    return { bySource };
}

// مصروفات الشهر لكل جهة مستفيدة، ومجموع صافي مقبوضات الشهر
function getMonthSummary(f) {
    const { from, to } = parsePeriod(f);
    syncCash();

    const destinations = conn.db.prepare(
        `SELECT d.id, d.name,
                (SELECT COUNT(*) FROM expenses
                 WHERE destination_id = d.id AND date >= ? AND date <= ?) AS expenses_count,
                COALESCE((SELECT SUM(cash_out) FROM expenses
                          WHERE destination_id = d.id AND date >= ? AND date <= ?), 0) AS expenses_total
         FROM destinations d ORDER BY d.id`,
    ).all(from, to, from, to);

    const loansTotal = conn.db.prepare(
        `SELECT COALESCE(SUM(amount - carry_deduct), 0) AS v FROM loans WHERE date >= ? AND date <= ?`,
    ).get(from, to).v;

    return { destinations, loansTotal };
}

// f = { by: 'destination' | 'spender', ids, from, to }
function getExpensesReport(f) {
    assertDate(f.from, 'تاريخ البداية');
    assertDate(f.to, 'تاريخ النهاية');
    const ids = cleanIds(f.ids);
    if (!ids.length) return [];

    const column = f.by === 'spender' ? 'e.spender_id' : 'e.destination_id';
    return conn.db.prepare(
        `${EXPENSE_SELECT}
         WHERE ${column} IN (${ids.map(() => '?').join(',')}) AND e.date >= ? AND e.date <= ?
         ORDER BY e.date ASC, e.id ASC`,
    ).all(...ids, f.from, f.to);
}

// f = { sourceIds, from, to }
function getLoansReport(f) {
    assertDate(f.from, 'تاريخ البداية');
    assertDate(f.to, 'تاريخ النهاية');
    const ids = cleanIds(f.sourceIds);
    if (!ids.length) return [];

    syncCash();
    return conn.db.prepare(
        `${LOAN_SELECT}
         WHERE l.loan_type_id IN (${ids.map(() => '?').join(',')}) AND l.date >= ? AND l.date <= ?
         ORDER BY l.date ASC, l.id ASC`,
    ).all(...ids, f.from, f.to);
}

module.exports = { getMonthCashReport, getMonthSummary, getExpensesReport, getLoansReport };