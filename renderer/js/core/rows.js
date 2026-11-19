// صفوف مشتركة بين القائمة والكشف

function buildExpenseRow(e, onEdit, onDelete, actionsClass = '') {
    const tr = document.createElement('tr');
    tr.title = auditTitle(e);

    tr.appendChild(createCell(e.receipt_no || '—'));
    tr.appendChild(createCell(formatMoney(e.amount), 'num-cell'));
    tr.appendChild(createCell(formatMoney(e.paid), 'num-cell'));
    tr.appendChild(createCell(formatMoney(e.remaining), e.remaining > 0 ? 'num-cell negative' : 'num-cell'));
    tr.appendChild(createDateCell(e.date));
    tr.appendChild(createCell(e.details, 'details-cell'));
    tr.appendChild(createCell(e.note));
    tr.appendChild(createCell(e.destination));
    tr.appendChild(createTagCell(e.spender, 'spender'));
    tr.appendChild(createTagCell(e.source, 'source'));
    tr.appendChild(createCell(accountantOf(e)));
    tr.appendChild(createActionsCell(onEdit, onDelete, actionsClass));
    return tr;
}

function buildLoanRow(l, onEdit, onDelete, actionsClass = '') {
    const tr = document.createElement('tr');
    tr.title = auditTitle(l);

    const amountTd = createCell(formatMoney(l.amount), 'num-cell');
    if (l.carry_deduct > 0) {
        const note = document.createElement('small');
        note.className = 'amount-note';
        note.textContent = `الأصلي ${formatMoney(l.raw_amount)} (خُصم ${formatMoney(l.carry_deduct)} لأنه لم يُصرف)`;
        amountTd.appendChild(note);
    }
    tr.appendChild(amountTd);
    tr.appendChild(createDateCell(l.date));
    tr.appendChild(createTagCell(l.source, 'source'));
    tr.appendChild(createCell(accountantOf(l)));
    tr.appendChild(createActionsCell(onEdit, onDelete, actionsClass));
    return tr;
}