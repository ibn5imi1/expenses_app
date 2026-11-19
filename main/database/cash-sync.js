const { conn } = require('./connection');
const { MIN_DATE, round2, shiftMonthKey, currentMonthKey } = require('./helpers');

// raw = المبلغ الأصلي بدون خصم غير المصروف
function sumLoans(sourceId, from, to, raw = false) {
    return conn.db.prepare(
        `SELECT COALESCE(SUM(${raw ? 'amount' : 'amount - carry_deduct'}), 0) AS s
         FROM loans WHERE loan_type_id = ? AND date >= ? AND date <= ?`,
    ).get(sourceId, from, to).s;
}

// المصروف الفعلي من القاصة = المدفوع نقداً (cash_out) من الصرفيات المستقطعة من المصدر
function sumExpenses(sourceId, from, to) {
    return conn.db.prepare(
        `SELECT COALESCE(SUM(cash_out), 0) AS s
         FROM expenses WHERE loan_type_id = ? AND date >= ? AND date <= ?`,
    ).get(sourceId, from, to).s;
}

// ينقص غير المصروف من مقبوضات المصدر في الشهر (الأحدث أولاً) ويخزنه في carry_deduct
function applyDeductions(sourceId, from, to, amountToRemove) {
    const db = conn.db;
    const where = 'loan_type_id = ? AND date >= ? AND date <= ?';

    db.prepare(`UPDATE loans SET carry_deduct = 0 WHERE ${where} AND carry_deduct <> 0`).run(sourceId, from, to);

    let left = round2(Math.max(amountToRemove, 0));
    if (left <= 0) return;

    const rows = db.prepare(`SELECT id, amount FROM loans WHERE ${where} ORDER BY date DESC, id DESC`)
        .all(sourceId, from, to);
    const update = db.prepare('UPDATE loans SET carry_deduct = ? WHERE id = ?');

    for (const r of rows) {
        if (left <= 0) break;
        const take = round2(Math.min(r.amount, left));
        update.run(take, r.id);
        left = round2(left - take);
    }
}

// عند انتهاء كل شهر: لكل مصدر، المتبقي (مقبوضاته − المدفوع نقداً منها) يُنقَص من مقبوضاته
// فتساوي المصروف فعلاً ويتصفّر المتبقي. آمنة للتكرار وتُعيد الحساب عند أي تعديل.
function syncCash() {
    const db = conn.db;
    db.transaction(() => {
        const target = shiftMonthKey(currentMonthKey(), -1); // آخر شهر منتهٍ

        // الشهر الحالي وما بعده لا يُخصم منه شيء
        db.prepare('UPDATE loans SET carry_deduct = 0 WHERE date > ? AND carry_deduct <> 0').run(`${target}-31`);

        const first = db.prepare(
            `SELECT MIN(d) AS d FROM (
               SELECT MIN(date) AS d FROM loans UNION ALL SELECT MIN(date) AS d FROM expenses
             )`,
        ).get().d;
        if (!first) return;

        const sourcesIn = db.prepare(
            'SELECT DISTINCT loan_type_id AS id FROM loans WHERE date >= ? AND date <= ?',
        );

        for (let m = first.slice(0, 7); m <= target; m = shiftMonthKey(m, 1)) {
            const from = `${m}-01`;
            const to = `${m}-31`;
            for (const s of sourcesIn.all(from, to)) {
                const remaining = round2(sumLoans(s.id, from, to, true) - sumExpenses(s.id, from, to));
                applyDeductions(s.id, from, to, remaining);
            }
        }
    })();
}

module.exports = { sumLoans, sumExpenses, syncCash, MIN_DATE };