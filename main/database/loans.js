const { conn } = require('./connection');
const { LOAN_SELECT } = require('./queries');
const { syncCash } = require('./cash-sync');

function validateLoan(d) {
    if (!(Number(d.amount) > 0)) throw new Error('المبلغ غير صحيح');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) throw new Error('التاريخ غير صحيح');
    if (!conn.db.prepare('SELECT id FROM loan_types WHERE id = ?').get(d.sourceId))
        throw new Error('المصدر غير موجود');
}

function getLoans() {
    syncCash(); // ليُصفَّر المتبقي فور بداية شهر جديد
    return conn.db.prepare(`${LOAN_SELECT} ORDER BY l.date DESC, l.id DESC LIMIT 100`).all();
}

function addLoan(d, user) {
    validateLoan(d);
    const id = conn.db.prepare(
        `INSERT INTO loans (amount, date, source, loan_type_id, created_by, created_at)
         VALUES (?, ?, '', ?, ?, ?)`,
    ).run(Number(d.amount), d.date, d.sourceId, user, new Date().toISOString()).lastInsertRowid;
    syncCash();
    return id;
}

function updateLoan(id, d, user) {
    validateLoan(d);
    if (!conn.db.prepare('SELECT 1 FROM loans WHERE id = ?').get(id)) throw new Error('المقبوض غير موجود');

    conn.db.prepare(
        `UPDATE loans SET amount = ?, date = ?, loan_type_id = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
    ).run(Number(d.amount), d.date, d.sourceId, user, new Date().toISOString(), id);
    syncCash();
}

function deleteLoan(id) {
    const result = conn.db.prepare('DELETE FROM loans WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('المقبوض غير موجود');
    syncCash();
}

module.exports = { getLoans, addLoan, updateLoan, deleteLoan };