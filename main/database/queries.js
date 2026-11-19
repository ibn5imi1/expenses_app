// استعلامات مشتركة بين المصروفات والديون والكشوفات
const EXPENSE_SELECT = `
  SELECT e.id, e.amount, e.remaining, (e.amount - e.remaining) AS paid, e.cash_out,
         e.settles_id, e.receipt_no, e.details, e.date, e.note,
         e.destination_id, d.name AS destination,
         e.spender_id, s.name AS spender,
         e.loan_type_id AS source_id, t.name AS source,
         e.created_by, e.created_at, e.updated_by, e.updated_at
  FROM expenses e
  JOIN destinations d ON d.id = e.destination_id
  LEFT JOIN spenders s ON s.id = e.spender_id
  LEFT JOIN loan_types t ON t.id = e.loan_type_id
`;

// amount = بعد خصم غير المصروف، raw_amount = المبلغ الأصلي
const LOAN_SELECT = `
  SELECT l.id, (l.amount - l.carry_deduct) AS amount, l.amount AS raw_amount,
         l.carry_deduct, l.date,
         l.loan_type_id AS source_id, t.name AS source,
         l.created_by, l.created_at, l.updated_by, l.updated_at
  FROM loans l
  JOIN loan_types t ON t.id = l.loan_type_id
`;

// الدين الحالي: قيد متبقيه أكبر من صفر ولم يُسدَّد منه بقيد لاحق (الاستعلام يستخدم الاسم e)
const ACTIVE_DEBT = `
  e.remaining > 0
  AND NOT EXISTS (SELECT 1 FROM expenses x WHERE x.settles_id = e.id)
`;

module.exports = { EXPENSE_SELECT, LOAN_SELECT, ACTIVE_DEBT };