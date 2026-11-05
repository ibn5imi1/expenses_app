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

    // تحديث بيانات الصفحة عند فتحها
    if (name === 'cash') loadCash();
    if (name === 'destinations') reloadDestinations();
    if (name === 'summary') loadSummary();
}

navLinks.forEach(link => {
    link.addEventListener('click', () => showPage(link.dataset.page));
});

document.getElementById('refresh-btn').addEventListener('click', () => {
    loadExpenses();
    loadLoans();
    loadCash();
    reloadDestinations();
    reloadLoanTypes();
    loadSummary();
});

showPage('expenses');

/* ---------- حالة الصفحة ---------- */
let destinations = [];
let expenses = [];
let editingId = null;   // رقم المصروف الذي يجري تعديله، أو null عند الإضافة

/* ---------- عناصر فورم المصروفات ---------- */
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

// تقريب إلى خانتين عشريتين لتفادي فروق الكسور، مع فواصل الآلاف
function formatMoney(n) {
    return (Math.round(n * 100) / 100).toLocaleString('en-US');
}

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

// نص التلميح: من أضاف ومن عدّل
function auditTitle(row) {
    const lines = [`تمت الإضافة بواسطة ${row.created_by} — ${formatDateTime(row.created_at)}`];
    if (row.updated_by) {
        lines.push(`تم التعديل بواسطة ${row.updated_by} — ${formatDateTime(row.updated_at)}`);
    }
    return lines.join('\n');
}

/* ---------- أدوات مشتركة للجداول ---------- */
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

// رسالة الخطأ الأصلية بدون مقدمة Electron
function cleanError(err) {
    return String(err.message || err)
        .replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

/* ---------- جهة الصرف (قائمة فورم المصروفات) ---------- */
function setDefaultDestination() {
    const fixed = destinations.find(d => d.is_fixed);   // الكلية
    if (fixed) destinationSelect.value = fixed.id;
}

function fillDestinations() {
    const current = destinationSelect.value;   // نحافظ على الاختيار الحالي
    destinationSelect.innerHTML = '';
    destinations.forEach(d => {
        const option = document.createElement('option');
        option.value = d.id;
        option.textContent = d.name;
        destinationSelect.appendChild(option);
    });

    if (current && destinations.some(d => String(d.id) === current)) {
        destinationSelect.value = current;
    } else {
        setDefaultDestination();
    }
}

/* ---------- حقل التفاصيل يكبر مع الكتابة ---------- */
function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

detailsInput.addEventListener('input', () => autoGrow(detailsInput));

/* ---------- فورم المصروفات: إعادة الضبط والتعديل ---------- */
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
    expenseLoanTypeSelect.value = expense.loan_type_id;
    noteInput.value = expense.note;
    detailsInput.value = expense.details;
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

    if (!expenseLoanTypeSelect.value) {
        missing.push('نوع السلفة');
        badFields.push(expenseLoanTypeSelect);
    }

    if (!detailsInput.value.trim()) {
        missing.push('التفاصيل');
        badFields.push(detailsInput);
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
        amount: parseAmount(amountInput.value),
        date: dateInput.value,                          // YYYY-MM-DD
        destinationId: Number(destinationSelect.value),
        loanTypeId: Number(expenseLoanTypeSelect.value),
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
        tr.title = auditTitle(e);   // التلميح عند وقوف المؤشر على الصف

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

const loanTypeForm = document.getElementById('loan-type-form');
const loanTypeNameInput = document.getElementById('loan-type-name');
const loanTypeErrorBox = document.getElementById('loan-type-error');
const loanTypeSubmitBtn = document.getElementById('loan-type-submit');
const loanTypeCancelBtn = document.getElementById('loan-type-cancel');
const loanTypesBody = document.getElementById('loan-types-body');

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

// تحديث قائمتي السلف والمصروفات وجدول الأنواع
function fillLoanTypes() {
    fillTypeSelect(loanTypeSelect);
    fillTypeSelect(expenseLoanTypeSelect);
    renderLoanTypes();
}

async function reloadLoanTypes() {
    loanTypes = await window.api.getLoanTypes();
    fillLoanTypes();
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

/* ---------- فورم السلف ---------- */
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

/* ================= جهات الصرف ================= */
let editingDestinationId = null;

const destinationForm = document.getElementById('destination-form');
const destinationNameInput = document.getElementById('destination-name');
const destinationErrorBox = document.getElementById('destination-error');
const destinationSubmitBtn = document.getElementById('destination-submit');
const destinationCancelBtn = document.getElementById('destination-cancel');
const destinationsBody = document.getElementById('destinations-body');
const destinationsTotalCount = document.getElementById('destinations-total-count');
const destinationsTotalSum = document.getElementById('destinations-total-sum');

function clearDestinationError() {
    destinationErrorBox.classList.add('hidden');
    destinationNameInput.classList.remove('invalid');
}

function showDestinationError(message) {
    destinationErrorBox.textContent = message;
    destinationErrorBox.classList.remove('hidden');
}

function resetDestinationForm() {
    destinationForm.reset();
    editingDestinationId = null;
    destinationSubmitBtn.textContent = 'إضافة الجهة';
    destinationCancelBtn.classList.add('hidden');
    clearDestinationError();
}

function startDestinationEdit(dest) {
    editingDestinationId = dest.id;
    destinationNameInput.value = dest.name;
    destinationSubmitBtn.textContent = 'تحديث الجهة';
    destinationCancelBtn.classList.remove('hidden');
    clearDestinationError();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    destinationNameInput.focus();
}

async function reloadDestinations() {
    destinations = await window.api.getDestinations();
    fillDestinations();
    renderDestinations();
}

async function removeDestination(dest) {
    if (!confirm(`هل تريد حذف الجهة «${dest.name}»؟`)) return;
    try {
        await window.api.deleteDestination(dest.id);
        if (editingDestinationId === dest.id) resetDestinationForm();
        await reloadDestinations();
    } catch (err) {
        console.error(err);
        showDestinationError(cleanError(err));
    }
}

function renderDestinations() {
    destinationsBody.innerHTML = '';

    let totalCount = 0;
    let totalSum = 0;

    destinations.forEach(d => {
        totalCount += d.expenses_count;
        totalSum += d.expenses_total;

        const tr = document.createElement('tr');
        tr.appendChild(createCell(d.name));
        tr.appendChild(createCell(String(d.expenses_count)));
        tr.appendChild(createCell(formatMoney(d.expenses_total)));

        const actionsTd = document.createElement('td');
        if (d.is_fixed) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = 'ثابت';
            actionsTd.appendChild(badge);
        } else {
            const box = document.createElement('div');
            box.className = 'row-actions';
            box.appendChild(createButton('تعديل', 'btn btn-light btn-small', () => startDestinationEdit(d)));
            box.appendChild(createButton('حذف', 'btn btn-danger btn-small', () => removeDestination(d)));
            actionsTd.appendChild(box);
        }
        tr.appendChild(actionsTd);

        destinationsBody.appendChild(tr);
    });

    destinationsTotalCount.textContent = String(totalCount);
    destinationsTotalSum.textContent = formatMoney(totalSum);
}

destinationForm.addEventListener('submit', async e => {
    e.preventDefault();
    clearDestinationError();

    const name = destinationNameInput.value.replace(/\s+/g, ' ').trim();
    let message = '';

    if (!name) {
        message = 'اكتب اسم الجهة';
    } else if (destinations.some(d => d.name === name && d.id !== editingDestinationId)) {
        message = 'هذه الجهة موجودة مسبقاً';
    }

    if (message) {
        destinationNameInput.classList.add('invalid');
        showDestinationError(message);
        destinationNameInput.focus();
        return;
    }

    try {
        if (editingDestinationId) {
            await window.api.updateDestination(editingDestinationId, name);
        } else {
            await window.api.addDestination(name);
        }
        resetDestinationForm();
        await reloadDestinations();
    } catch (err) {
        console.error(err);
        showDestinationError(cleanError(err));
    }
});

destinationCancelBtn.addEventListener('click', resetDestinationForm);
destinationNameInput.addEventListener('input', () => destinationNameInput.classList.remove('invalid'));

/* ================= الخلاصة ================= */
const summaryExpenses = document.getElementById('summary-expenses');
const summaryLoans = document.getElementById('summary-loans');
const summaryTotal = document.getElementById('summary-total');
const summaryHint = document.getElementById('summary-hint');
const summaryBody = document.getElementById('summary-body');
const summaryTotalCount = document.getElementById('summary-total-count');
const summaryTotalSum = document.getElementById('summary-total-sum');

function renderSummary(dests, cash) {
    summaryBody.innerHTML = '';

    let totalCount = 0;
    let totalExpenses = 0;

    dests.forEach(d => {
        totalCount += d.expenses_count;
        totalExpenses += d.expenses_total;

        const tr = document.createElement('tr');
        tr.appendChild(createCell(d.name));
        tr.appendChild(createCell(String(d.expenses_count)));
        tr.appendChild(createCell(formatMoney(d.expenses_total)));
        summaryBody.appendChild(tr);
    });

    const totalLoans = cash.reduce((sum, t) => sum + t.loans_total, 0);
    const difference = Math.round((totalExpenses - totalLoans) * 100) / 100;

    summaryTotalCount.textContent = String(totalCount);
    summaryTotalSum.textContent = formatMoney(totalExpenses);

    summaryExpenses.textContent = formatMoney(totalExpenses);
    summaryLoans.textContent = formatMoney(totalLoans);
    summaryTotal.textContent = formatMoney(difference);

    if (difference > 0) {
        summaryHint.textContent = `المصروفات أكثر من السلف بمقدار ${formatMoney(difference)}`;
    } else if (difference < 0) {
        summaryHint.textContent = `تبقى من السلف ${formatMoney(Math.abs(difference))}`;
    } else {
        summaryHint.textContent = 'المصروفات تساوي السلف';
    }
}

async function loadSummary() {
    const [dests, cash] = await Promise.all([
        window.api.getDestinations(),
        window.api.getCash(),
    ]);
    renderSummary(dests, cash);
}

/* ---------- تشغيل أولي ---------- */
async function init() {
    destinations = await window.api.getDestinations();
    fillDestinations();

    loanTypes = await window.api.getLoanTypes();   // قبل المصروفات
    fillLoanTypes();
    renderDestinations();

    await loadExpenses();
    await loadLoans();
}

init();