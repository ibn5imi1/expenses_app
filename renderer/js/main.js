/* ---------- التنقل ---------- */
const navLinks = document.querySelectorAll('.nav-link[data-page]');
const pages = document.querySelectorAll('.page');

let currentUser = null;   // { id, username, role }

function showPage(name) {
    if (name === 'admin' && (!currentUser || currentUser.role !== 'admin')) return;

    pages.forEach(page => {
        page.classList.toggle('hidden', page.id !== `page-${name}`);
    });
    navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.page === name);
    });

    // تحديث بيانات الصفحة عند فتحها
    if (name === 'cash') loadCash();
    if (name === 'summary') loadSummary();
    if (name === 'destinations') reloadDestinations();
    if (name === 'admin') loadAccountants();
}
navLinks.forEach(link => {
    link.addEventListener('click', () => showPage(link.dataset.page));
});

/* ---------- تحديث البيانات ---------- */
let refreshing = false;

async function refreshAll() {
    if (refreshing) return;   // لا نكرر التحديث إذا ضغط المستخدم مرتين
    refreshing = true;

    try {
        await Promise.all([
            reloadDestinations(),
            reloadLoanTypes(),
            loadExpenses(),
            loadLoans(),
            loadCash(),
            loadSummary(),
        ]);

        // إذا كان كشف معروضاً، نعيد عرضه بالأرقام الجديدة
        if (!expensesReportResult.classList.contains('hidden')) expensesReportForm.requestSubmit();
        if (!loansReportResult.classList.contains('hidden')) loansReportForm.requestSubmit();
                if (!cashReportResult.classList.contains('hidden')) cashReportForm.requestSubmit();

        showToast('تم تحديث البيانات');
    } catch (err) {
        console.error(err);
        showToast('تعذر تحديث البيانات', true);
    } finally {
        refreshing = false;
    }
}

document.getElementById('refresh-btn').addEventListener('click', refreshAll);

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

function createDatePicker(input, iconBtn, extra = {}) {
    const picker = flatpickr(input, Object.assign({
        locale: arabicIraq,
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'j/n/Y',
        defaultDate: 'today',
        disableMobile: true,
        onChange: () => picker.altInput.classList.remove('invalid'),
    }, extra));

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

    fillCheckList(reportDestinations, destinations);
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
        td.colSpan = 6;
        tr.appendChild(td);
        expensesBody.appendChild(tr);
        return;
    }

    expenses.forEach(e => {
        const tr = document.createElement('tr');
        tr.title = auditTitle(e);   // من أضاف ومن عدّل

        tr.appendChild(createCell(e.amount.toLocaleString('en-US'), 'num-cell'));
        tr.appendChild(createDateCell(e.date));
        tr.appendChild(createCell(e.details, 'details-cell'));
        tr.appendChild(createCell(e.note));
        tr.appendChild(createDeductionCell(e.loan_type));
        tr.appendChild(createActionsCell(() => startEdit(e), () => removeExpense(e.id)));

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
let returnToLoansReport = false;   // هل بدأ تعديل السلفة من كشف السلف؟

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
    fillCheckList(loanReportTypes, loanTypes);
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
    returnToLoansReport = false;
    loanSubmitBtn.textContent = 'حفظ السلفة';
    loanCancelBtn.classList.add('hidden');
    loanDatePicker.setDate(new Date());
    setDefaultLoanType();
    clearLoanErrors();
}

function startLoanEdit(loan) {
    returnToLoansReport = false;
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

loanCancelBtn.addEventListener('click', () => {
    const backToReport = returnToLoansReport;
    resetLoanForm();
    if (backToReport) showPage('loans-report');
});
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

    const backToReport = returnToLoansReport;

    try {
        if (editingLoanId) {
            await window.api.updateLoan(editingLoanId, data);
        } else {
            await window.api.addLoan(data);
        }
        resetLoanForm();
        await loadLoans();

        if (backToReport) {
            showPage('loans-report');
            loansReportForm.requestSubmit();   // يعيد عرض الكشف بالبيانات المحدثة
            showToast('تم تعديل السلفة');
        }
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
// خلية سلفة الاستقطاع: شارة واضحة
function createDeductionCell(name, className = '') {
    const td = document.createElement('td');
    td.className = `ded-cell ${className}`.trim();

    const badge = document.createElement('span');
    badge.className = 'ded-badge';
    badge.textContent = name;
    td.appendChild(badge);
    return td;
}

function createDateCell(iso) {
    const td = document.createElement('td');
    td.className = 'date-cell';
    const bdi = document.createElement('bdi');   // يحمي ترتيب الأرقام في الصفحة العربية
    bdi.textContent = formatDate(iso);
    td.appendChild(bdi);
    return td;
}

// خلية أزرار التعديل والحذف (موحّدة في كل الجداول)
function createActionsCell(onEdit, onDelete, className = '') {
    const td = document.createElement('td');
    td.className = `actions-cell ${className}`.trim();

    const box = document.createElement('div');
    box.className = 'row-actions';
    box.appendChild(createButton('تعديل', 'btn btn-light btn-small', onEdit));
    box.appendChild(createButton('حذف', 'btn btn-danger btn-small', onDelete));
    td.appendChild(box);
    return td;
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

/* ================= الكشوفات: أدوات مشتركة ================= */
function toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStartISO() {
    const now = new Date();
    return toISO(new Date(now.getFullYear(), now.getMonth(), 1));
}

// قائمة اختيارات تحافظ على ما حدده المستخدم، والعناصر الجديدة تظهر محددة
function fillCheckList(container, items) {
    const known = new Set((container.dataset.known || '').split(',').filter(Boolean));
    const checked = new Set([...container.querySelectorAll('input:checked')].map(i => i.value));

    container.innerHTML = '';
    items.forEach(item => {
        const label = document.createElement('label');
        label.className = 'check-item';

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = item.id;
        box.checked = !known.has(String(item.id)) || checked.has(String(item.id));

        const text = document.createElement('span');
        text.textContent = item.name;

        label.append(box, text);
        container.appendChild(label);
    });
    container.dataset.known = items.map(i => i.id).join(',');
}

function getCheckedIds(container) {
    return [...container.querySelectorAll('input:checked')].map(i => Number(i.value));
}

function setAllChecked(container, state) {
    container.querySelectorAll('input').forEach(i => { i.checked = state; });
}

function showNote(el, text) {
    el.textContent = text;
    el.className = 'form-error noprint';
}

function hideNote(el) {
    el.className = 'hidden';
}

function sumAmounts(rows) {
    return Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
}

function periodText(from, to) {
    return `من ${formatDate(from)} إلى ${formatDate(to)}`;
}



/* ---------- رسالة التأكيد (تظهر وتختفي وحدها) ---------- */
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(message, isError = false) {
    toastEl.textContent = message;
    toastEl.classList.toggle('toast-error', isError);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

async function exportReport(report) {
    if (!report) return;
    try {
        const result = await window.api.exportReport(report);
        if (result.saved) showToast(`تم تصدير ملف Excel: ${result.fileName}`);
    } catch (err) {
        console.error(err);
        showToast('تعذر حفظ الملف، تأكد أنه غير مفتوح في Excel', true);
    }
}

async function printReport() {
    try {
        const result = await window.api.printPage();
        if (result.success) {
            showToast('تمت الطباعة');
        } else if (!result.cancelled) {
            showToast('تعذرت الطباعة', true);
        }
    } catch (err) {
        console.error(err);
        showToast('تعذرت الطباعة', true);
    }
}

/* ================= كشف المصروفات ================= */
const reportDestinations = document.getElementById('report-destinations');
const expensesReportForm = document.getElementById('expenses-report-form');
const expFromInput = document.getElementById('exp-from');
const expToInput = document.getElementById('exp-to');
const expensesReportError = document.getElementById('expenses-report-error');
const expensesReportResult = document.getElementById('expenses-report-result');
const expensesReportTitle = document.getElementById('expenses-report-title');
const expensesReportSubtitle = document.getElementById('expenses-report-subtitle');
const expensesReportBody = document.getElementById('expenses-report-body');
const expensesReportTotal = document.getElementById('expenses-report-total');
const expensesReportCount = document.getElementById('expenses-report-count');
const expensesReportExcelBtn = document.getElementById('expenses-report-excel');

createDatePicker(expFromInput, document.getElementById('exp-from-icon'), { defaultDate: monthStartISO() });
createDatePicker(expToInput, document.getElementById('exp-to-icon'));

let expensesReport = null;   // آخر كشف معروض (للتصدير)

function renderExpensesReport(rows, ids, from, to) {
    const names = destinations.filter(d => ids.includes(d.id)).map(d => d.name).join('، ');
    const title = `كشف مصروفات: ${names}`;
    const subtitle = periodText(from, to);
    const total = sumAmounts(rows);

    expensesReportTitle.textContent = title;
    expensesReportSubtitle.textContent = subtitle;

    expensesReportBody.innerHTML = '';
    if (!rows.length) {
        const tr = document.createElement('tr');
        const td = createCell('لا توجد مصروفات في هذه الفترة');
        td.colSpan = 6;
        tr.appendChild(td);
        expensesReportBody.appendChild(tr);
    }

    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.title = auditTitle(r);   // من أضاف ومن عدّل عند وقوف المؤشر

        tr.appendChild(createCell(r.amount.toLocaleString('en-US'), 'num-cell'));
        tr.appendChild(createDateCell(r.date));
        tr.appendChild(createCell(r.details, 'details-cell'));
        tr.appendChild(createCell(r.note));
        tr.appendChild(createDeductionCell(r.loan_type));   // شاشة وطباعة
        tr.appendChild(createActionsCell(
            () => editFromReport(r),
            () => removeFromReport(r),
            'noprint'                                        // الأزرار لا تُطبع
        ));

        expensesReportBody.appendChild(tr);
    });

    expensesReportTotal.textContent = formatMoney(total);
    expensesReportCount.textContent = `المجموع — عدد المصروفات: ${rows.length}`;

    expensesReport = {
        title,
        subtitle,
        fileName: `expenses-report-${from}-to-${to}.xlsx`,
        columns: [
            { header: 'المبلغ', width: 16 },
            { header: 'التاريخ', width: 14 },
            { header: 'التفاصيل', width: 60 },
            { header: 'ملاحظات', width: 26 },
            { header: 'سلفة الاستقطاع', width: 22 },
        ],
        rows: rows.map(r => [r.amount, formatDate(r.date), r.details, r.note, r.loan_type]),
        total: [total, `المجموع — عدد المصروفات: ${rows.length}`, '', '', ''],
    };

    expensesReportExcelBtn.disabled = !rows.length;
    expensesReportResult.classList.remove('hidden');
}

expensesReportForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideNote(expensesReportError);

    const ids = getCheckedIds(reportDestinations);
    const from = expFromInput.value;
    const to = expToInput.value;

    if (!ids.length) {
        showNote(expensesReportError, 'اختر جهة صرف واحدة على الأقل');
        return;
    }
    if (from > to) {
        showNote(expensesReportError, 'تاريخ البداية بعد تاريخ النهاية');
        return;
    }

    try {
        const rows = await window.api.getExpensesReport({ destinationIds: ids, from, to });
        renderExpensesReport(rows, ids, from, to);
    } catch (err) {
        console.error(err);
        showNote(expensesReportError, cleanError(err));
    }
});

document.getElementById('report-dest-all').addEventListener('click', () => setAllChecked(reportDestinations, true));
document.getElementById('report-dest-none').addEventListener('click', () => setAllChecked(reportDestinations, false));
document.getElementById('expenses-report-print').addEventListener('click', printReport);
expensesReportExcelBtn.addEventListener('click', () => exportReport(expensesReport));


/* ================= كشف السلف ================= */
const loanReportTypes = document.getElementById('report-loan-types');
const loansReportForm = document.getElementById('loans-report-form');
const loanFromInput = document.getElementById('loan-from');
const loanToInput = document.getElementById('loan-to');
const loansReportError = document.getElementById('loans-report-error');
const loansReportResult = document.getElementById('loans-report-result');
const loansReportTitle = document.getElementById('loans-report-title');
const loansReportSubtitle = document.getElementById('loans-report-subtitle');
const loansReportBody = document.getElementById('loans-report-body');
const loansReportTotal = document.getElementById('loans-report-total');
const loansReportCount = document.getElementById('loans-report-count');
const loansReportExcelBtn = document.getElementById('loans-report-excel');

createDatePicker(loanFromInput, document.getElementById('loan-from-icon'), { defaultDate: monthStartISO() });
createDatePicker(loanToInput, document.getElementById('loan-to-icon'));

let loansReport = null;

function renderLoansReport(rows, ids, from, to) {
    const names = loanTypes.filter(t => ids.includes(t.id)).map(t => t.name).join('، ');
    const title = `كشف السلف المستلمة: ${names}`;
    const subtitle = periodText(from, to);
    const total = sumAmounts(rows);

    loansReportTitle.textContent = title;
    loansReportSubtitle.textContent = subtitle;

    loansReportBody.innerHTML = '';
    if (!rows.length) {
        const tr = document.createElement('tr');
        const td = createCell('لا توجد سلف في هذه الفترة');
        td.colSpan = 5;
        tr.appendChild(td);
        loansReportBody.appendChild(tr);
    }

    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.title = auditTitle(r);   // من أضاف ومن عدّل عند وقوف المؤشر

        tr.appendChild(createCell(r.amount.toLocaleString('en-US'), 'num-cell'));
        tr.appendChild(createDateCell(r.date));
        tr.appendChild(createCell(r.source));
        tr.appendChild(createCell(r.loan_type));
        tr.appendChild(createActionsCell(
            () => editLoanFromReport(r),
            () => removeLoanFromReport(r),
            'noprint'                    // الأزرار لا تُطبع
        ));

        loansReportBody.appendChild(tr);
    });

    loansReportTotal.textContent = formatMoney(total);
    loansReportCount.textContent = `المجموع — عدد السلف: ${rows.length}`;

    loansReport = {
        title,
        subtitle,
        fileName: `loans-report-${from}-to-${to}.xlsx`,
        columns: [
            { header: 'المبلغ', width: 18 },
            { header: 'التاريخ', width: 14 },
            { header: 'المصدر', width: 40 },
            { header: 'النوع', width: 22 },
        ],
        rows: rows.map(r => [r.amount, formatDate(r.date), r.source, r.loan_type]),
        total: [total, `المجموع — عدد السلف: ${rows.length}`, '', ''],
    };

    loansReportExcelBtn.disabled = !rows.length;
    loansReportResult.classList.remove('hidden');
}

// التعديل من كشف السلف: ننتقل لصفحة السلف، وبعد الحفظ نعود للكشف
function editLoanFromReport(row) {
    showPage('loans');
    startLoanEdit(row);
    returnToLoansReport = true;   // بعد startLoanEdit لأنها تصفّره
}

async function removeLoanFromReport(row) {
    if (!confirm('هل تريد حذف هذه السلفة؟')) return;

    try {
        await window.api.deleteLoan(row.id);
        if (editingLoanId === row.id) resetLoanForm();
        await loadLoans();
        loansReportForm.requestSubmit();   // يحدّث الكشف والمجموع
        showToast('تم حذف السلفة');
    } catch (err) {
        console.error(err);
        showToast('تعذر حذف السلفة', true);
    }
}

loansReportForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideNote(loansReportError);

    const ids = getCheckedIds(loanReportTypes);
    const from = loanFromInput.value;
    const to = loanToInput.value;

    if (!ids.length) {
        showNote(loansReportError, 'اختر نوع سلفة واحداً على الأقل');
        return;
    }
    if (from > to) {
        showNote(loansReportError, 'تاريخ البداية بعد تاريخ النهاية');
        return;
    }

    try {
        const rows = await window.api.getLoansReport({ loanTypeIds: ids, from, to });
        renderLoansReport(rows, ids, from, to);
    } catch (err) {
        console.error(err);
        showNote(loansReportError, cleanError(err));
    }
});

document.getElementById('report-type-all').addEventListener('click', () => setAllChecked(loanReportTypes, true));
document.getElementById('report-type-none').addEventListener('click', () => setAllChecked(loanReportTypes, false));
document.getElementById('loans-report-print').addEventListener('click', printReport);
loansReportExcelBtn.addEventListener('click', () => exportReport(loansReport));

/* ================= كشف القاصة (شهري) ================= */
const cashReportForm = document.getElementById('cash-report-form');
const cashrYear = document.getElementById('cashr-year');
const cashrMonth = document.getElementById('cashr-month');
const cashReportError = document.getElementById('cash-report-error');
const cashReportResult = document.getElementById('cash-report-result');
const cashReportTitle = document.getElementById('cash-report-title');
const cashReportSubtitle = document.getElementById('cash-report-subtitle');
const cashReportBody = document.getElementById('cash-report-body');
const cashReportCount = document.getElementById('cash-report-count');
const cashReportTotalIn = document.getElementById('cash-report-total-in');
const cashReportTotalOut = document.getElementById('cash-report-total-out');
const cashReportClosing = document.getElementById('cash-report-closing');
const cashReportExcelBtn = document.getElementById('cash-report-excel');

let cashReport = null;   // آخر كشف معروض (للتصدير)

const round2 = n => Math.round(n * 100) / 100;
const pad2 = n => String(n).padStart(2, '0');

// خلية مبلغ: السالب بالأحمر
function createMoneyCell(value) {
    const td = createCell(formatMoney(value), 'money-cell');
    if (value < 0) td.classList.add('negative');
    return td;
}

// قائمة الأشهر، والسنة والشهر الحاليان كقيمة افتراضية
MONTHS.forEach((name, i) => {
    const option = document.createElement('option');
    option.value = i + 1;
    option.textContent = name;
    cashrMonth.appendChild(option);
});
cashrYear.value = new Date().getFullYear();
cashrMonth.value = new Date().getMonth() + 1;

function renderCashReport(data, year, month) {
    const prevName = MONTHS[(month + 10) % 12];   // اسم الشهر السابق
    const lastDay = new Date(year, month, 0).getDate();
    const from = `${year}-${pad2(month)}-01`;
    const to = `${year}-${pad2(month)}-${pad2(lastDay)}`;

    const title = `كشف القاصة — ${MONTHS[month - 1]} ${year}`;
    const subtitle = periodText(from, to);
    const openingLabel = `الرصيد المرحّل من شهر ${prevName}`;

    let balance = round2(data.opening);
    let totalIn = 0;
    let totalOut = 0;

    cashReportTitle.textContent = title;
    cashReportSubtitle.textContent = subtitle;
    cashReportBody.innerHTML = '';

    // الصف الأول: الرصيد المرحّل
    const openingTr = document.createElement('tr');
    openingTr.className = 'opening-row';
    openingTr.appendChild(createCell(''));
    openingTr.appendChild(createCell(openingLabel));
    openingTr.appendChild(createCell(''));
    openingTr.appendChild(createCell(''));
    openingTr.appendChild(createMoneyCell(balance));
    cashReportBody.appendChild(openingTr);

    const excelRows = [['', openingLabel, '', '', balance]];

    data.rows.forEach(r => {
        const isLoan = r.kind === 'loan';
        const text = isLoan ? `سلفة: ${r.text}` : r.text;

        if (isLoan) {
            totalIn = round2(totalIn + r.amount);
            balance = round2(balance + r.amount);
        } else {
            totalOut = round2(totalOut + r.amount);
            balance = round2(balance - r.amount);
        }

        const tr = document.createElement('tr');
        tr.title = auditTitle(r);   // من أضاف ومن عدّل عند وقوف المؤشر

        tr.appendChild(createDateCell(r.date));
        tr.appendChild(createCell(text, 'details-cell'));
        tr.appendChild(isLoan ? createMoneyCell(r.amount) : createCell(''));
        tr.appendChild(isLoan ? createCell('') : createMoneyCell(r.amount));
        tr.appendChild(createMoneyCell(balance));
        cashReportBody.appendChild(tr);

        excelRows.push([
            formatDate(r.date),
            text,
            isLoan ? r.amount : '',
            isLoan ? '' : r.amount,
            balance,
        ]);
    });

    if (!data.rows.length) {
        const tr = document.createElement('tr');
        const td = createCell('لا توجد حركات في هذا الشهر');
        td.colSpan = 5;
        tr.appendChild(td);
        cashReportBody.appendChild(tr);
    }

    cashReportCount.textContent = `الإجمالي — عدد الحركات: ${data.rows.length}`;
    cashReportTotalIn.textContent = formatMoney(totalIn);
    cashReportTotalOut.textContent = formatMoney(totalOut);
    setRemaining(cashReportClosing, balance);

    cashReport = {
        title,
        subtitle,
        fileName: `cash-report-${year}-${pad2(month)}.xlsx`,
        mergeTotal: false,   // لا ندمج خلايا صف الإجمالي
        columns: [
            { header: 'التاريخ', width: 14 },
            { header: 'البيان', width: 56 },
            { header: 'وارد', width: 16 },
            { header: 'صادر', width: 16 },
            { header: 'الرصيد', width: 16 },
        ],
        rows: excelRows,
        total: ['الإجمالي', `عدد الحركات: ${data.rows.length}`, totalIn, totalOut, balance],
    };

    cashReportExcelBtn.disabled = false;
    cashReportResult.classList.remove('hidden');
}

cashReportForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideNote(cashReportError);

    const year = Number(cashrYear.value);
    const month = Number(cashrMonth.value);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        showNote(cashReportError, 'أدخل سنة صحيحة، مثل 2026');
        return;
    }

    try {
        const data = await window.api.getMonthCashReport({ year, month });
        renderCashReport(data, year, month);
    } catch (err) {
        console.error(err);
        showNote(cashReportError, cleanError(err));
    }
});

document.getElementById('cash-report-print').addEventListener('click', printReport);
cashReportExcelBtn.addEventListener('click', () => exportReport(cashReport));

/* ================= إظهار كلمة المرور ================= */
const EYE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const EYE_OFF_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

function addPasswordToggle(input) {
    const wrap = document.createElement('div');
    wrap.className = 'password-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-toggle';
    btn.setAttribute('aria-label', 'إظهار كلمة المرور');
    btn.innerHTML = EYE_ICON;
    btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = show ? EYE_OFF_ICON : EYE_ICON;
        btn.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    });
    wrap.appendChild(btn);
}

// تُضاف أيقونة العين لكل حقول كلمة المرور في البرنامج
document.querySelectorAll('input[type="password"]').forEach(addPasswordToggle);

/* ================= تسجيل الدخول والخروج ================= */
const MIN_PASSWORD = 6;

const loginScreen = document.getElementById('login-screen');
const appShell = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');
const adminLink = document.querySelector('.admin-only');

async function loadAllData() {
    destinations = await window.api.getDestinations();
    fillDestinations();

    loanTypes = await window.api.getLoanTypes();   // قبل المصروفات
    fillLoanTypes();
    renderDestinations();

    await loadExpenses();
    await loadLoans();
}

function showLogin() {
    appShell.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginUsername.focus();
}

async function enterApp(user) {
    currentUser = user;
    document.getElementById('current-user').textContent = user.displayName || user.username;
    adminLink.classList.toggle('hidden', user.role !== 'admin');

    loginScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    showPage('expenses');

    try {
        await loadAllData();
    } catch (err) {
        console.error(err);
        showToast('تعذر تحميل البيانات', true);
    }
}

loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideNote(loginError);

    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    if (!username || !password) {
        showNote(loginError, 'أدخل اسم المستخدم وكلمة المرور');
        return;
    }

    loginSubmit.disabled = true;
    try {
        const user = await window.api.login(username, password);
        loginPassword.value = '';
        await enterApp(user);
    } catch (err) {
        console.error(err);
        showNote(loginError, cleanError(err));
        loginPassword.select();
    } finally {
        loginSubmit.disabled = false;
    }
});

// الخروج: نعيد تحميل الصفحة لتنظيف كل شيء، فتظهر شاشة الدخول
document.getElementById('logout-btn').addEventListener('click', async () => {
    await window.api.logout();
    location.reload();
});

/* ================= الإعدادات: تغيير كلمة المرور ================= */
const passwordForm = document.getElementById('password-form');
const oldPasswordInput = document.getElementById('old-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const passwordError = document.getElementById('password-error');

passwordForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideNote(passwordError);

    const oldPassword = oldPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    let message = '';
    if (!oldPassword || !newPassword || !confirmPassword) {
        message = 'املأ جميع الحقول';
    } else if (newPassword.length < MIN_PASSWORD) {
        message = `كلمة المرور الجديدة يجب ألا تقل عن ${MIN_PASSWORD} أحرف`;
    } else if (newPassword !== confirmPassword) {
        message = 'كلمة المرور الجديدة وتأكيدها غير متطابقتين';
    } else if (newPassword === oldPassword) {
        message = 'كلمة المرور الجديدة يجب أن تختلف عن الحالية';
    }

    if (message) {
        showNote(passwordError, message);
        return;
    }

    try {
        await window.api.changePassword(oldPassword, newPassword);
        passwordForm.reset();
        showToast('تم تغيير كلمة المرور');
    } catch (err) {
        console.error(err);
        showNote(passwordError, cleanError(err));
    }
});

/* ================= الأدمن: المحاسبون ================= */
let accountants = [];
let editingAccountantId = null;

const accountantFormTitle = document.getElementById('accountant-form-title');
const accountantForm = document.getElementById('accountant-form');
const accountantName = document.getElementById('accountant-name');
const accountantUsername = document.getElementById('accountant-username');
const accountantPassword = document.getElementById('accountant-password');
const accountantPasswordLabel = document.getElementById('accountant-password-label');
const accountantError = document.getElementById('accountant-error');
const accountantSubmit = document.getElementById('accountant-submit');
const accountantCancel = document.getElementById('accountant-cancel');
const accountantsBody = document.getElementById('accountants-body');

function resetAccountantForm() {
    accountantForm.reset();
    editingAccountantId = null;
    accountantFormTitle.textContent = 'إضافة محاسب';
    accountantPasswordLabel.textContent = 'كلمة المرور';
    accountantSubmit.textContent = 'إضافة المحاسب';
    accountantCancel.classList.add('hidden');
    hideNote(accountantError);
}

function startAccountantEdit(a) {
    editingAccountantId = a.id;
    accountantName.value = a.display_name || a.username;
    accountantUsername.value = a.username;
    accountantPassword.value = '';

    accountantFormTitle.textContent = 'تعديل المحاسب';
    accountantPasswordLabel.textContent = 'كلمة مرور جديدة (اتركها فارغة بدون تغيير)';
    accountantSubmit.textContent = 'حفظ التعديل';
    accountantCancel.classList.remove('hidden');
    hideNote(accountantError);

    window.scrollTo({ top: 0, behavior: 'smooth' });
    accountantName.focus();
}

async function removeAccountant(a) {
    const name = a.display_name || a.username;
    if (!confirm(`هل تريد حذف المحاسب «${name}»؟ لن يستطيع الدخول بعد الآن، وتبقى سجلاته كما هي.`)) return;

    try {
        await window.api.deleteAccountant(a.id);
        if (editingAccountantId === a.id) resetAccountantForm();
        await loadAccountants();
        showToast(`تم حذف المحاسب: ${name}`);
    } catch (err) {
        console.error(err);
        showToast(cleanError(err), true);
    }
}

function renderAccountants() {
    accountantsBody.innerHTML = '';

    if (!accountants.length) {
        const tr = document.createElement('tr');
        const td = createCell('لا يوجد محاسبون بعد');
        td.colSpan = 3;
        tr.appendChild(td);
        accountantsBody.appendChild(tr);
        return;
    }

    accountants.forEach(a => {
        const tr = document.createElement('tr');
        tr.appendChild(createCell(a.display_name || a.username));
        tr.appendChild(createCell(a.username));

        const actionsTd = document.createElement('td');
        const box = document.createElement('div');
        box.className = 'row-actions';
        box.appendChild(createButton('تعديل', 'btn btn-light btn-small', () => startAccountantEdit(a)));
        box.appendChild(createButton('حذف', 'btn btn-danger btn-small', () => removeAccountant(a)));
        actionsTd.appendChild(box);
        tr.appendChild(actionsTd);

        accountantsBody.appendChild(tr);
    });
}

async function loadAccountants() {
    accountants = await window.api.getAccountants();
    renderAccountants();
}

accountantForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideNote(accountantError);

    const displayName = accountantName.value.replace(/\s+/g, ' ').trim();
    const username = accountantUsername.value.trim();
    const password = accountantPassword.value;
    const editing = editingAccountantId !== null;

    let message = '';
    if (!displayName || !username) {
        message = 'أدخل اسم المحاسب واسم المستخدم';
    } else if (!editing && !password) {
        message = 'أدخل كلمة المرور';
    } else if (password && password.length < MIN_PASSWORD) {
        message = `كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD} أحرف`;
    }

    if (message) {
        showNote(accountantError, message);
        return;
    }

    try {
        if (editing) {
            await window.api.updateAccountant(editingAccountantId, displayName, username, password);
            showToast(`تم تعديل بيانات المحاسب: ${displayName}`);
        } else {
            await window.api.addAccountant(displayName, username, password);
            showToast(`تمت إضافة المحاسب: ${displayName}`);
        }
        resetAccountantForm();
        await loadAccountants();
    } catch (err) {
        console.error(err);
        showNote(accountantError, cleanError(err));
    }
});

accountantCancel.addEventListener('click', resetAccountantForm);

/* ---------- تشغيل أولي ---------- */
async function startup() {
    try {
        const user = await window.api.getSession();   // بقاء الجلسة عند إعادة تحميل النافذة
        if (user) {
            await enterApp(user);
        } else {
            showLogin();
        }
    } catch (err) {
        console.error(err);
        showLogin();
    }
}

startup();