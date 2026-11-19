const { conn } = require('./connection');
const { round2 } = require('./helpers');
const { EXPENSE_SELECT } = require('./queries');
const { syncCash } = require('./cash-sync');

// remaining = المتبقي (دين) بعد هذا القيد، cash_out = ما خرج فعلاً من القاصة بهذا القيد
// settles_id = القيد السابق الذي سدّد منه هذا القيد (للتسديدات فقط)
function validateExpense(d) {
    const db = conn.db;
    if (!(Number(d.amount) > 0)) throw new Error('المبلغ غير صحيح');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) throw new Error('التاريخ غير صحيح');
    if (!String(d.details || '').trim()) throw new Error('التفاصيل مطلوبة');
    if (String(d.receiptNo || '').trim().length > 40) throw new Error('رقم الوصل طويل جداً');

    if (!db.prepare('SELECT id FROM destinations WHERE id = ?').get(d.destinationId))
        throw new Error('الجهة المستفيدة غير موجودة');
    if (!db.prepare('SELECT id FROM spenders WHERE id = ?').get(d.spenderId))
        throw new Error('الجهة القائمة بالصرف غير موجودة');
    if (!db.prepare('SELECT id FROM loan_types WHERE id = ?').get(d.sourceId))
        throw new Error('مصدر الاستقطاع غير موجود');
}

function readRemaining(d, max) {
    const remaining = round2(Number(d.remaining || 0));
    if (!(remaining >= 0)) throw new Error('المتبقي غير صحيح');
    if (remaining > max) throw new Error('المتبقي لا يمكن أن يزيد على المبلغ');
    return remaining;
}

const hasSettlement = id => !!conn.db.prepare('SELECT 1 FROM expenses WHERE settles_id = ?').get(id);

const getExpenses = () => conn.db.prepare(`${EXPENSE_SELECT} ORDER BY e.id DESC LIMIT 100`).all();

function addExpense(d, user) {
    validateExpense(d);
    const amount = round2(Number(d.amount));
    const remaining = readRemaining(d, amount);

    const result = conn.db.prepare(
        `INSERT INTO expenses
           (amount, remaining, cash_out, receipt_no, details, date, note,
            destination_id, spender_id, loan_type_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        amount, remaining, round2(amount - remaining),
        String(d.receiptNo || '').trim(), d.details.trim(), d.date, String(d.note || '').trim(),
        d.destinationId, d.spenderId, d.sourceId, user, new Date().toISOString(),
    );
    syncCash();
    return result.lastInsertRowid;
}

function updateExpense(id, d, user) {
    validateExpense(d);

    const old = conn.db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    if (!old) throw new Error('المصروف غير موجود');

    let amount = round2(Number(d.amount));
    let remaining;
    let cashOut;

    if (old.settles_id) {
        // قيد تسديد: المبلغ الكلي من القيد السابق، والتسديد = متبقي السابق − متبقي هذا القيد
        const parent = conn.db.prepare('SELECT amount, remaining FROM expenses WHERE id = ?').get(old.settles_id);
        if (!parent) throw new Error('القيد الأصلي للتسديد غير موجود');

        amount = parent.amount;
        remaining = readRemaining(d, parent.remaining);
        cashOut = round2(parent.remaining - remaining);
        if (!(cashOut > 0)) throw new Error('مبلغ التسديد يجب أن يكون أكبر من صفر');
    } else {
        remaining = readRemaining(d, amount);
        cashOut = round2(amount - remaining);
    }

    if (hasSettlement(id) && (round2(amount) !== round2(old.amount) || remaining !== round2(old.remaining))) {
        throw new Error('لا يمكن تعديل المبلغ أو المتبقي لأن عليه تسديداً لاحقاً، احذف التسديد أولاً');
    }

    conn.db.prepare(
        `UPDATE expenses
         SET amount = ?, remaining = ?, cash_out = ?, receipt_no = ?, details = ?, date = ?, note = ?,
             destination_id = ?, spender_id = ?, loan_type_id = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`,
    ).run(
        amount, remaining, cashOut, String(d.receiptNo || '').trim(), d.details.trim(), d.date,
        String(d.note || '').trim(), d.destinationId, d.spenderId, d.sourceId,
        user, new Date().toISOString(), id,
    );
    syncCash();
}

function deleteExpense(id) {
    if (hasSettlement(id)) throw new Error('لا يمكن حذف هذا المصروف لأن عليه تسديداً، احذف التسديد أولاً');
    conn.db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    syncCash();
}

module.exports = { getExpenses, addExpense, updateExpense, deleteExpense, hasSettlement };