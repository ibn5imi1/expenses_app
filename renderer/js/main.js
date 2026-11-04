/* ---------- التنقل ---------- */
const navLinks = document.querySelectorAll('.nav-link[data-page]');
const pages = document.querySelectorAll('.page');

function showPage(name) {
    pages.forEach(page => {
        page.classList.toggle('hidden', page.id !== `page-${name}`);
    });
    navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.page === name);
    });
    if (name === 'cash') loadCash();
}

navLinks.forEach(link => {
    link.addEventListener('click', () => showPage(link.dataset.page));
});

document.getElementById('refresh-btn').addEventListener('click', () => {
    loadExpenses();
    loadLoans();
    loadCash();
});
showPage('expenses');

/* ---------- حالة الصفحة ---------- */
let destinations = [];
let expenses = [];
let editingId = null;   // رقم المصروف الذي يجري تعديله، أو null عند الإضافة

/* ---------- عناصر الفورم ---------- */
const expenseLoanTypeSelect = document.getElementById('expense-loan-type');
const expenseForm = document.getElementById('expense-form');
const amountInput = document.getElementById('expense-amount');
const dateInput = document.getElementById('expense-date');
const destinationSelect = document.getElementById('expense-destination');
const noteInput = document.getElementById('expense-note');
const detailsInput = document.getElementById('expense-details');
const errorBox = document.getElementById('expense-error');
const submitBtn = document.getElementById('expense-submit');
const cancelBtn = document.getElementById('expense-cancel');
const expensesBody = document.getElementById('expenses-body');

/* ---------- المبلغ (فواصل الآلاف) ---------- */
function formatAmount(value) {
    const clean = String(value)
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
        .replace(/[^\d.]/g, '');

    const [intPart, ...rest] = clean.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return rest.length ? `${withCommas}.${rest.join('')}` : withCommas;
}

function parseAmount(text) {
    return Number(String(text).replace(/,/g, '')) || 0;
}

function attachAmountFormat(input) {
    input.addEventListener('input', () => {
        const pos = input.selectionStart;
        const digitsBefore = input.value.slice(0, pos).replace(/[^\d]/g, '').length;

        input.value = formatAmount(input.value);

        let newPos = 0, count = 0;
        while (newPos < input.value.length && count < digitsBefore) {
            if (/\d/.test(input.value[newPos])) count++;
            newPos++;
        }
        input.setSelectionRange(newPos, newPos);
    });
}

attachAmountFormat(amountInput);

/* ---------- التاريخ ---------- */
const MONTHS = [
    'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
    'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

const arabicIraq = {
    weekdays: {
        shorthand: ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'],
        longhand: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    },
    months: { shorthand: MONTHS, longhand: MONTHS },
    firstDayOfWeek: 6,
};

function createDatePicker(input, iconBtn) {
    const picker = flatpickr(input, {
        locale: arabicIraq,
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'j/n/Y',
        defaultDate: 'today',
        disableMobile: true,
        onChange: () => picker.altInput.classList.remove('invalid'),
    });

    iconBtn.addEventListener('click', e => {
        e.stopPropagation();
        picker.open();
    });
    return picker;
}


const datePicker = createDatePicker(dateInput, document.getElementById('date-icon'));

// '2026-11-04' ← '4/11/2026'
function formatDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d}/${m}/${y}`;
}

// ISO كاملة ← '4/11/2026 10:30'
function formatDateTime(iso) {
    const t = new Date(iso);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    return `${t.getDate()}/${t.getMonth() + 1}/${t.getFullYear()} ${hh}:${mm}`;
}
function auditTitle(row) {
    const lines = [`تمت الإضافة بواسطة ${row.created_by} — ${formatDateTime(row.created_at)}`];
    if (row.updated_by) {
        lines.push(`تم التعديل بواسطة ${row.updated_by} — ${formatDateTime(row.updated_at)}`);
    }
    return lines.join('\n');
}

/* ---------- جهة الصرف ---------- */
function setDefaultDestination() {
    const fixed = destinations.find(d => d.is_fixed);   // الكلية
    if (fixed) destinationSelect.value = fixed.id;
}

function fillDestinations() {
    destinationSelect.innerHTML = '';
    destinations.forEach(d => {
        const option = document.createElement('option');
        option.value = d.id;
        option.textContent = d.name;
        destinationSelect.appendChild(option);
    });
    setDefaultDestination();
}

/* ---------- حقل التفاصيل يكبر مع الكتابة ---------- */
function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

detailsInput.addEventListener('input', () => autoGrow(detailsInput));

/* ---------- الفورم: إعادة الضبط والتعديل ---------- */
function clearErrors() {
    errorBox.classList.add('hidden');
    expenseForm.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
}

function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
}

function resetExpenseForm() {
    expenseForm.reset();
    editingId = null;
    submitBtn.textContent = 'حفظ المصروف';
    cancelBtn.classList.add('hidden');
    detailsInput.style.height = 'auto';
    datePicker.setDate(new Date());
    setDefaultDestination();
     setDefaultType(expenseLoanTypeSelect);
    clearErrors();
}

function startEdit(expense) {
    editingId = expense.id;
    amountInput.value = formatAmount(expense.amount);
    datePicker.setDate(expense.date);
    destinationSelect.value = expense.destination_id;
    noteInput.value = expense.note;
    detailsInput.value = expense.details;
    expenseLoanTypeSelect.value = expense.loan_type_id;
    autoGrow(detailsInput);

    submitBtn.textContent = 'تحديث المصروف';
    cancelBtn.classList.remove('hidden');
    clearErrors();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    amountInput.focus();
}

cancelBtn.addEventListener('click', resetExpenseForm);

/* ---------- التحقق ---------- */
function validateExpense() {
    clearErrors();
    const missing = [];
    const badFields = [];

    if (!(parseAmount(amountInput.value) > 0)) {
        missing.push('المبلغ');
        badFields.push(amountInput);
    }

    if (!dateInput.value) {
        missing.push('التاريخ');
        badFields.push(datePicker.altInput);
    }

    if (!destinationSelect.value) {
        missing.push('جهة الصرف');
        badFields.push(destinationSelect);
    }

    if (!detailsInput.value.trim()) {
        missing.push('التفاصيل');
        badFields.push(detailsInput);
    }

        if (!expenseLoanTypeSelect.value) {
        missing.push('نوع السلفة');
        badFields.push(expenseLoanTypeSelect);
    }

    if (missing.length) {
        badFields.forEach(el => el.classList.add('invalid'));
        showError(`الرجاء إكمال الحقول التالية: ${missing.join('، ')}`);
        badFields[0].focus();
        return false;
    }
    
    return true;
}

/* ---------- الحفظ ---------- */
expenseForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateExpense()) return;

    const data = {
        loanTypeId: Number(expenseLoanTypeSelect.value),
        amount: parseAmount(amountInput.value),
        date: dateInput.value,                          // YYYY-MM-DD
        destinationId: Number(destinationSelect.value),
        note: noteInput.value.trim(),
        details: detailsInput.value.trim(),
    };

    try {
        if (editingId) {
            await window.api.updateExpense(editingId, data);
        } else {
            await window.api.addExpense(data);
        }
        resetExpenseForm();
        await loadExpenses();
    } catch (err) {
        console.error(err);
        showError('تعذر الحفظ، حاول مرة أخرى');
    }
});

expenseForm.addEventListener('input', e => e.target.classList.remove('invalid'));

/* ---------- عرض المصروفات ---------- */
function createCell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;   // textContent يمنع تنفيذ أي HTML داخل النص
    if (className) td.className = className;
    return td;
}

function createButton(text, className, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
}

async function removeExpense(id) {
    if (!confirm('هل تريد حذف هذا المصروف؟')) return;
    try {
        await window.api.deleteExpense(id);
        if (editingId === id) resetExpenseForm();
        await loadExpenses();
    } catch (err) {
        console.error(err);
        alert('تعذر الحذف');
    }
}

function renderExpenses() {
    expensesBody.innerHTML = '';

    if (!expenses.length) {
        const tr = document.createElement('tr');
        const td = createCell('لا توجد مصروفات بعد');
        td.colSpan = 5;
        tr.appendChild(td);
        expensesBody.appendChild(tr);
        return;
    }

    expenses.forEach(e => {
        const tr = document.createElement('tr');

        // التلميح عند وقوف المؤشر على الصف
        const lines = [`تمت الإضافة بواسطة ${e.created_by} — ${formatDateTime(e.created_at)}`];
        if (e.updated_by) {
            lines.push(`تم التعديل بواسطة ${e.updated_by} — ${formatDateTime(e.updated_at)}`);
        }
        tr.title = lines.join('\n');

        tr.appendChild(createCell(e.amount.toLocaleString('en-US')));

        const dateTd = document.createElement('td');
        const bdi = document.createElement('bdi');   // يحمي ترتيب الأرقام في الصفحة العربية
        bdi.textContent = formatDate(e.date);
        dateTd.appendChild(bdi);
        tr.appendChild(dateTd);

        tr.appendChild(createCell(e.details, 'details-cell'));
        tr.appendChild(createCell(e.note));

        const actionsTd = document.createElement('td');
        const box = document.createElement('div');
        box.className = 'row-actions';
        box.appendChild(createButton('تعديل', 'btn btn-light btn-small', () => startEdit(e)));
        box.appendChild(createButton('حذف', 'btn btn-danger btn-small', () => removeExpense(e.id)));
        actionsTd.appendChild(box);
        tr.appendChild(actionsTd);

        expensesBody.appendChild(tr);
    });
}

async function loadExpenses() {
    expenses = await window.api.getExpenses();
    renderExpenses();
}


/* ================= السلف ================= */
let loanTypes = [];
let loans = [];
let editingLoanId = null;

const loanForm = document.getElementById('loan-form');
const loanAmountInput = document.getElementById('loan-amount');
const loanDateInput = document.getElementById('loan-date');
const loanSourceInput = document.getElementById('loan-source');
const loanTypeSelect = document.getElementById('loan-type');
const loanErrorBox = document.getElementById('loan-error');
const loanSubmitBtn = document.getElementById('loan-submit');
const loanCancelBtn = document.getElementById('loan-cancel');
const loansBody = document.getElementById('loans-body');
const loanTypeSubmitBtn = document.getElementById('loan-type-submit');
const loanTypeCancelBtn = document.getElementById('loan-type-cancel');
const loanTypesBody = document.getElementById('loan-types-body');
const loanTypeForm = document.getElementById('loan-type-form');
const loanTypeNameInput = document.getElementById('loan-type-name');
const loanTypeErrorBox = document.getElementById('loan-type-error');

attachAmountFormat(loanAmountInput);
const loanDatePicker = createDatePicker(loanDateInput, document.getElementById('loan-date-icon'));

/* ---------- أنواع السلف ---------- */
let editingLoanTypeId = null;

function setDefaultType(select) {
    const fixed = loanTypes.find(t => t.is_fixed);   // سلفة كلية
    if (fixed) select.value = fixed.id;
}

function setDefaultLoanType() {
    setDefaultType(loanTypeSelect);
}

// يملأ أي قائمة أنواع مع الحفاظ على الاختيار الحالي
function fillTypeSelect(select) {
    const current = select.value;
    select.innerHTML = '';
    loanTypes.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = t.name;
        select.appendChild(option);
    });

    if (current && loanTypes.some(t => String(t.id) === current)) {
        select.value = current;
    } else {
        setDefaultType(select);
    }
}

// تحديث القائمتين (السلف والمصروفات) وجدول الأنواع
function fillLoanTypes() {
    fillTypeSelect(loanTypeSelect);
    fillTypeSelect(expenseLoanTypeSelect);
    renderLoanTypes();
}

async function reloadLoanTypes() {
    loanTypes = await window.api.getLoanTypes();
    fillLoanTypes();
}

// رسالة الخطأ الأصلية بدون مقدمة Electron
function cleanError(err) {
    return String(err.message || err)
        .replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

function clearLoanTypeError() {
    loanTypeErrorBox.classList.add('hidden');
    loanTypeNameInput.classList.remove('invalid');
}

function showLoanTypeError(message) {
    loanTypeErrorBox.textContent = message;
    loanTypeErrorBox.classList.remove('hidden');
}

function resetLoanTypeForm() {
    loanTypeForm.reset();
    editingLoanTypeId = null;
    loanTypeSubmitBtn.textContent = 'إضافة النوع';
    loanTypeCancelBtn.classList.add('hidden');
    clearLoanTypeError();
}

function startLoanTypeEdit(type) {
    editingLoanTypeId = type.id;
    loanTypeNameInput.value = type.name;
    loanTypeSubmitBtn.textContent = 'تحديث النوع';
    loanTypeCancelBtn.classList.remove('hidden');
    clearLoanTypeError();
    loanTypeNameInput.focus();
}

async function removeLoanType(type) {
    if (!confirm(`هل تريد حذف النوع «${type.name}»؟`)) return;
    try {
        await window.api.deleteLoanType(type.id);
        if (editingLoanTypeId === type.id) resetLoanTypeForm();
        await reloadLoanTypes();
    } catch (err) {
        console.error(err);
        showLoanTypeError(cleanError(err));
    }
}

function renderLoanTypes() {
    loanTypesBody.innerHTML = '';

    loanTypes.forEach(t => {
        const tr = document.createElement('tr');
        tr.appendChild(createCell(t.name));

        const actionsTd = document.createElement('td');
        if (t.is_fixed) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = 'ثابت';
            actionsTd.appendChild(badge);
        } else {
            const box = document.createElement('div');
            box.className = 'row-actions';
            box.appendChild(createButton('تعديل', 'btn btn-light btn-small', () => startLoanTypeEdit(t)));
            box.appendChild(createButton('حذف', 'btn btn-danger btn-small', () => removeLoanType(t)));
            actionsTd.appendChild(box);
        }
        tr.appendChild(actionsTd);

        loanTypesBody.appendChild(tr);
    });
}

loanTypeForm.addEventListener('submit', async e => {
    e.preventDefault();
    clearLoanTypeError();

    const name = loanTypeNameInput.value.replace(/\s+/g, ' ').trim();
    let message = '';

    if (!name) {
        message = 'اكتب اسم النوع';
    } else if (loanTypes.some(t => t.name === name && t.id !== editingLoanTypeId)) {
        message = 'هذا النوع موجود مسبقاً';
    }

    if (message) {
        loanTypeNameInput.classList.add('invalid');
        showLoanTypeError(message);
        loanTypeNameInput.focus();
        return;
    }

    try {
        if (editingLoanTypeId) {
            await window.api.updateLoanType(editingLoanTypeId, name);
        } else {
            await window.api.addLoanType(name);
        }
        resetLoanTypeForm();
        await reloadLoanTypes();
        await loadLoans();   // الاسم قد يتغير في جدول السلف
    } catch (err) {
        console.error(err);
        showLoanTypeError(cleanError(err));
    }
});

loanTypeCancelBtn.addEventListener('click', resetLoanTypeForm);
loanTypeNameInput.addEventListener('input', () => loanTypeNameInput.classList.remove('invalid'));

/* ---------- الفورم ---------- */
function clearLoanErrors() {
    loanErrorBox.classList.add('hidden');
    loanForm.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
}

function showLoanError(message) {
    loanErrorBox.textContent = message;
    loanErrorBox.classList.remove('hidden');
}

function resetLoanForm() {
    loanForm.reset();
    editingLoanId = null;
    loanSubmitBtn.textContent = 'حفظ السلفة';
    loanCancelBtn.classList.add('hidden');
    loanDatePicker.setDate(new Date());
    setDefaultLoanType();
    clearLoanErrors();
}

function startLoanEdit(loan) {
    editingLoanId = loan.id;
    loanAmountInput.value = formatAmount(loan.amount);
    loanDatePicker.setDate(loan.date);
    loanSourceInput.value = loan.source;
    loanTypeSelect.value = loan.loan_type_id;

    loanSubmitBtn.textContent = 'تحديث السلفة';
    loanCancelBtn.classList.remove('hidden');
    clearLoanErrors();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loanAmountInput.focus();
}

loanCancelBtn.addEventListener('click', resetLoanForm);
loanForm.addEventListener('input', e => e.target.classList.remove('invalid'));

function validateLoanForm() {
    clearLoanErrors();
    const missing = [];
    const badFields = [];

    if (!(parseAmount(loanAmountInput.value) > 0)) {
        missing.push('مقدار السلفة');
        badFields.push(loanAmountInput);
    }

    if (!loanDateInput.value) {
        missing.push('التاريخ');
        badFields.push(loanDatePicker.altInput);
    }

    if (!loanSourceInput.value.trim()) {
        missing.push('المصدر');
        badFields.push(loanSourceInput);
    }

    if (!loanTypeSelect.value) {
        missing.push('نوع السلفة');
        badFields.push(loanTypeSelect);
    }

    if (missing.length) {
        badFields.forEach(el => el.classList.add('invalid'));
        showLoanError(`الرجاء إكمال الحقول التالية: ${missing.join('، ')}`);
        badFields[0].focus();
        return false;
    }
    return true;
}

loanForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateLoanForm()) return;

    const data = {
        amount: parseAmount(loanAmountInput.value),
        date: loanDateInput.value,
        source: loanSourceInput.value.trim(),
        loanTypeId: Number(loanTypeSelect.value),
    };

    try {
        if (editingLoanId) {
            await window.api.updateLoan(editingLoanId, data);
        } else {
            await window.api.addLoan(data);
        }
        resetLoanForm();
        await loadLoans();
    } catch (err) {
        console.error(err);
        showLoanError('تعذر الحفظ، حاول مرة أخرى');
    }
});

/* ---------- عرض السلف ---------- */
async function removeLoan(id) {
    if (!confirm('هل تريد حذف هذه السلفة؟')) return;
    try {
        await window.api.deleteLoan(id);
        if (editingLoanId === id) resetLoanForm();
        await loadLoans();
    } catch (err) {
        console.error(err);
        alert('تعذر الحذف');
    }
}

function renderLoans() {
    loansBody.innerHTML = '';

    if (!loans.length) {
        const tr = document.createElement('tr');
        const td = createCell('لا توجد سلف بعد');
        td.colSpan = 5;
        tr.appendChild(td);
        loansBody.appendChild(tr);
        return;
    }

    loans.forEach(l => {
        const tr = document.createElement('tr');
        tr.title = auditTitle(l);

        tr.appendChild(createCell(l.amount.toLocaleString('en-US')));

        const dateTd = document.createElement('td');
        const bdi = document.createElement('bdi');
        bdi.textContent = formatDate(l.date);
        dateTd.appendChild(bdi);
        tr.appendChild(dateTd);

        tr.appendChild(createCell(l.source));
        tr.appendChild(createCell(l.loan_type));

        const actionsTd = document.createElement('td');
        const box = document.createElement('div');
        box.className = 'row-actions';
        box.appendChild(createButton('تعديل', 'btn btn-light btn-small', () => startLoanEdit(l)));
        box.appendChild(createButton('حذف', 'btn btn-danger btn-small', () => removeLoan(l.id)));
        actionsTd.appendChild(box);
        tr.appendChild(actionsTd);

        loansBody.appendChild(tr);
    });
}

async function loadLoans() {
    loans = await window.api.getLoans();
    renderLoans();
}



/* ================= القاصة ================= */
const cashBody = document.getElementById('cash-body');
const cashTotalLoans = document.getElementById('cash-total-loans');
const cashTotalSpent = document.getElementById('cash-total-spent');
const cashTotalRemaining = document.getElementById('cash-total-remaining');

// تقريب إلى خانتين عشريتين لتفادي فروق الكسور، مع فواصل الآلاف
function formatMoney(n) {
    return (Math.round(n * 100) / 100).toLocaleString('en-US');
}

function setRemaining(cell, value) {
    cell.textContent = formatMoney(value);
    cell.classList.toggle('negative', value < 0);   // الأحمر عند تجاوز السلفة
}

function renderCash(rows) {
    cashBody.innerHTML = '';

    let totalLoans = 0;
    let totalSpent = 0;

    rows.forEach(r => {
        const remaining = r.loans_total - r.spent_total;
        totalLoans += r.loans_total;
        totalSpent += r.spent_total;

        const tr = document.createElement('tr');
        tr.appendChild(createCell(r.name));
        tr.appendChild(createCell(formatMoney(r.loans_total)));
        tr.appendChild(createCell(formatMoney(r.spent_total)));

        const remainingTd = createCell('');
        setRemaining(remainingTd, remaining);
        tr.appendChild(remainingTd);

        cashBody.appendChild(tr);
    });

    cashTotalLoans.textContent = formatMoney(totalLoans);
    cashTotalSpent.textContent = formatMoney(totalSpent);
    setRemaining(cashTotalRemaining, totalLoans - totalSpent);
}

async function loadCash() {
    renderCash(await window.api.getCash());
}

/* ---------- تشغيل أولي ---------- */
async function init() {
    destinations = await window.api.getDestinations();
    fillDestinations();

    loanTypes = await window.api.getLoanTypes();   // قبل المصروفات
    fillLoanTypes();

    await loadExpenses();
    await loadLoans();
}

init();