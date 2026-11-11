/* ================= التنقل ================= */
const navLinks = document.querySelectorAll('.nav-link[data-page]');
const pages = document.querySelectorAll('.page');

let currentUser = null;   // { id, username, displayName, role }

function showPage(name) {
    if (name === 'admin' && (!currentUser || currentUser.role !== 'admin')) return;

    pages.forEach(page => page.classList.toggle('hidden', page.id !== `page-${name}`));
    navLinks.forEach(link => link.classList.toggle('active', link.dataset.page === name));

    // تحديث بيانات الصفحة عند فتحها
    if (name === 'cash') loadCash();
    if (name === 'summary') loadSummary();
    if (name === 'destinations') beneficiaries.load();
    if (name === 'spenders') spenders.load();
    if (name === 'admin') loadAccountants();
}

navLinks.forEach(link => link.addEventListener('click', () => showPage(link.dataset.page)));

/* ================= أدوات عامة ================= */
const round2 = n => Math.round(n * 100) / 100;
const pad2 = n => String(n).padStart(2, '0');
const formatMoney = n => round2(n).toLocaleString('en-US');

// رسالة الخطأ الأصلية بدون مقدمة Electron
function cleanError(err) {
    return String(err.message || err)
        .replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

function showNote(el, text) {
    el.textContent = text;
    el.className = 'form-error noprint';
}

function hideNote(el) {
    el.className = 'hidden';
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
        if (result.success) showToast('تمت الطباعة');
        else if (!result.cancelled) showToast('تعذرت الطباعة', true);
    } catch (err) {
        console.error(err);
        showToast('تعذرت الطباعة', true);
    }
}

/* ---------- المبلغ (فواصل الآلاف) ---------- */
function formatAmount(value) {
    const clean = String(value)
        .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
        .replace(/[^\d.]/g, '');

    const [intPart, ...rest] = clean.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return rest.length ? `${withCommas}.${rest.join('')}` : withCommas;
}

const parseAmount = text => Number(String(text).replace(/,/g, '')) || 0;

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

const DATE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';

// يحوّل الحقل إلى حقل تاريخ بأيقونة تقويم، ويُحفظ YYYY-MM-DD ويُعرض j/n/Y
function createDatePicker(input, extra = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'date-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const iconBtn = document.createElement('button');
    iconBtn.type = 'button';
    iconBtn.className = 'date-icon';
    iconBtn.setAttribute('aria-label', 'اختيار التاريخ');
    iconBtn.innerHTML = DATE_ICON;
    wrap.appendChild(iconBtn);

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

const toISO = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function monthStartISO() {
    const now = new Date();
    return toISO(new Date(now.getFullYear(), now.getMonth(), 1));
}

// '2026-11-04' ← '4/11/2026'
function formatDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d}/${m}/${y}`;
}

// ISO كاملة ← '4/11/2026 10:30'
function formatDateTime(iso) {
    const t = new Date(iso);
    return `${t.getDate()}/${t.getMonth() + 1}/${t.getFullYear()} ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
}

const periodText = (from, to) => `من ${formatDate(from)} إلى ${formatDate(to)}`;

/* ---------- المحاسب والتلميح ---------- */
// المحاسب: من أضاف، وعند التعديل من عدّل فقط
const accountantOf = row => row.updated_by || row.created_by;

// نص التلميح: من أضاف ومن عدّل
function auditTitle(row) {
    const lines = [`تمت الإضافة بواسطة ${row.created_by} — ${formatDateTime(row.created_at)}`];
    if (row.updated_by) {
        lines.push(`تم التعديل بواسطة ${row.updated_by} — ${formatDateTime(row.updated_at)}`);
    }
    return lines.join('\n');
}

/* ---------- خلايا الجداول ---------- */
function createCell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;   // textContent يمنع تنفيذ أي HTML داخل النص
    if (className) td.className = className;
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

// خلية مبلغ: السالب بالأحمر
function createMoneyCell(value) {
    const td = createCell(formatMoney(value), 'money-cell');
    if (value < 0) td.classList.add('negative');
    return td;
}

// خلية الجهة الممولة: شارة واضحة
function createPartyCell(name) {
    const td = document.createElement('td');
    td.className = 'party-cell';
    const badge = document.createElement('span');
    badge.className = 'party-badge';
    badge.textContent = name;
    td.appendChild(badge);
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

// خلية بدل الأزرار للمقبوضات المرحّلة تلقائياً (لا تُعدَّل ولا تُحذف)
function createCarryCell(className = '') {
    const td = document.createElement('td');
    td.className = `actions-cell ${className}`.trim();
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'مرحّل تلقائياً';
    td.appendChild(badge);
    return td;
}

function emptyRow(body, text, columns) {
    const tr = document.createElement('tr');
    const td = createCell(text);
    td.colSpan = columns;
    tr.appendChild(td);
    body.appendChild(tr);
}

/* ---------- القوائم المنسدلة وقوائم الاختيار ---------- */
// يملأ قائمة منسدلة ويحافظ على الاختيار الحالي
function fillSelect(select, items, placeholder = null) {
    const current = select.value;
    select.innerHTML = '';

    if (placeholder) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = placeholder;
        select.appendChild(option);
    }

    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
    });

    const exists = items.some(i => String(i.id) === current);
    select.value = exists ? current : (placeholder ? '' : (items[0] ? items[0].id : ''));
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

const getCheckedIds = container =>
    [...container.querySelectorAll('input:checked')].map(i => Number(i.value));

const setAllChecked = (container, state) =>
    container.querySelectorAll('input').forEach(i => { i.checked = state; });

/* ================= الحالة العامة ================= */
let destinations = [];     // الجهات المستفيدة
let spenderList = [];      // الجهات القائمة بالصرف
let fundingParties = [];   // الجهات الممولة (تنشأ من المقبوضات)
let expenses = [];
let loans = [];

/* ================= الجهات المستفيدة والجهات القائمة بالصرف ================= */
// قسمان متطابقان في الشكل: إضافة وتعديل وحذف
function createNameList(cfg) {
    const p = cfg.prefix;
    const form = document.getElementById(`${p}-form`);
    const nameInput = document.getElementById(`${p}-name`);
    const errorBox = document.getElementById(`${p}-error`);
    const submitBtn = document.getElementById(`${p}-submit`);
    const cancelBtn = document.getElementById(`${p}-cancel`);
    const body = document.getElementById(`${p}-body`);
    const totalCount = document.getElementById(`${p}-total-count`);
    const totalSum = document.getElementById(`${p}-total-sum`);

    let items = [];
    let editingId = null;

    function clearError() {
        errorBox.classList.add('hidden');
        nameInput.classList.remove('invalid');
    }

    function showError(message) {
        errorBox.textContent = message;
        errorBox.classList.remove('hidden');
    }

    function reset() {
        form.reset();
        editingId = null;
        submitBtn.textContent = 'إضافة الجهة';
        cancelBtn.classList.add('hidden');
        clearError();
    }

    function startEdit(item) {
        editingId = item.id;
        nameInput.value = item.name;
        submitBtn.textContent = 'تحديث الجهة';
        cancelBtn.classList.remove('hidden');
        clearError();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        nameInput.focus();
    }

    async function remove(item) {
        if (!confirm(`هل تريد حذف الجهة «${item.name}»؟`)) return;
        try {
            await cfg.remove(item.id);
            if (editingId === item.id) reset();
            await load();
        } catch (err) {
            console.error(err);
            showError(cleanError(err));
        }
    }

    function render() {
        body.innerHTML = '';
        let count = 0;
        let sum = 0;

        items.forEach(item => {
            count += item.expenses_count;
            sum += item.expenses_total;

            const tr = document.createElement('tr');
            tr.appendChild(createCell(item.name));
            tr.appendChild(createCell(String(item.expenses_count)));
            tr.appendChild(createCell(formatMoney(item.expenses_total)));

            if (item.is_fixed) {
                const td = document.createElement('td');
                td.className = 'actions-cell';
                const badge = document.createElement('span');
                badge.className = 'badge';
                badge.textContent = 'ثابتة';
                td.appendChild(badge);
                tr.appendChild(td);
            } else {
                tr.appendChild(createActionsCell(() => startEdit(item), () => remove(item)));
            }
            body.appendChild(tr);
        });

        totalCount.textContent = String(count);
        totalSum.textContent = formatMoney(sum);
    }

    async function load() {
        items = await cfg.list();
        cfg.onLoaded(items);
        render();
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        clearError();

        const name = nameInput.value.replace(/\s+/g, ' ').trim();
        let message = '';

        if (!name) {
            message = 'اكتب اسم الجهة';
        } else if (items.some(i => i.name === name && i.id !== editingId)) {
            message = 'هذه الجهة موجودة مسبقاً';
        }

        if (message) {
            nameInput.classList.add('invalid');
            showError(message);
            nameInput.focus();
            return;
        }

        try {
            if (editingId) await cfg.update(editingId, name);
            else await cfg.add(name);
            reset();
            await load();
            cfg.afterChange();
        } catch (err) {
            console.error(err);
            showError(cleanError(err));
        }
    });

    cancelBtn.addEventListener('click', reset);
    nameInput.addEventListener('input', () => nameInput.classList.remove('invalid'));

    return { load };
}

const beneficiaries = createNameList({
    prefix: 'ben',
    list: () => window.api.getDestinations(),
    add: name => window.api.addDestination(name),
    update: (id, name) => window.api.updateDestination(id, name),
    remove: id => window.api.deleteDestination(id),
    onLoaded: items => { destinations = items; syncSelects(); },
    afterChange: () => refreshMoneyData(),
});

const spenders = createNameList({
    prefix: 'spn',
    list: () => window.api.getSpenders(),
    add: name => window.api.addSpender(name),
    update: (id, name) => window.api.updateSpender(id, name),
    remove: id => window.api.deleteSpender(id),
    onLoaded: items => { spenderList = items; syncSelects(); },
    afterChange: () => refreshMoneyData(),
});

/* ================= المصروفات ================= */
let editingId = null;         // رقم المصروف الذي يجري تعديله، أو null عند الإضافة
let returnToReport = false;   // هل بدأ التعديل من كشف المصروفات؟ للعودة إليه بعد الحفظ

const expenseForm = document.getElementById('expense-form');
const amountInput = document.getElementById('expense-amount');
const dateInput = document.getElementById('expense-date');
const destinationSelect = document.getElementById('expense-destination');
const spenderSelect = document.getElementById('expense-spender');
const funderSelect = document.getElementById('expense-funder');
const noteInput = document.getElementById('expense-note');
const detailsInput = document.getElementById('expense-details');
const errorBox = document.getElementById('expense-error');
const submitBtn = document.getElementById('expense-submit');
const cancelBtn = document.getElementById('expense-cancel');
const expensesBody = document.getElementById('expenses-body');

attachAmountFormat(amountInput);
const datePicker = createDatePicker(dateInput);

// الجهة المستفيدة الافتراضية: الثابتة (الكلية)
function setDefaultDestination() {
    const fixed = destinations.find(d => d.is_fixed);
    if (fixed) destinationSelect.value = fixed.id;
}

function clearErrors() {
    errorBox.classList.add('hidden');
    expenseForm.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
}

function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
}

function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

detailsInput.addEventListener('input', () => autoGrow(detailsInput));

function resetExpenseForm() {
    expenseForm.reset();
    editingId = null;
    returnToReport = false;
    submitBtn.textContent = 'حفظ المصروف';
    cancelBtn.classList.add('hidden');
    detailsInput.style.height = 'auto';
    datePicker.setDate(new Date());
    setDefaultDestination();
    spenderSelect.value = '';
    funderSelect.value = '';
    clearErrors();
}

function startEdit(expense) {
    returnToReport = false;
    editingId = expense.id;
    amountInput.value = formatAmount(expense.amount);
    datePicker.setDate(expense.date);
    destinationSelect.value = expense.destination_id;
    spenderSelect.value = expense.spender_id;
    funderSelect.value = expense.funding_party_id;
    noteInput.value = expense.note;
    detailsInput.value = expense.details;
    autoGrow(detailsInput);

    submitBtn.textContent = 'تحديث المصروف';
    cancelBtn.classList.remove('hidden');
    clearErrors();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    amountInput.focus();
}

cancelBtn.addEventListener('click', () => {
    const backToReport = returnToReport;
    resetExpenseForm();
    if (backToReport) showPage('expenses-report');
});

function validateExpense() {
    clearErrors();
    const missing = [];
    const badFields = [];
    const check = (ok, label, field) => {
        if (ok) return;
        missing.push(label);
        badFields.push(field);
    };

    check(parseAmount(amountInput.value) > 0, 'المبلغ', amountInput);
    check(dateInput.value, 'التاريخ', datePicker.altInput);
    check(destinationSelect.value, 'الجهة المستفيدة', destinationSelect);
    check(spenderSelect.value, 'الجهة القائمة بالصرف', spenderSelect);
    check(funderSelect.value, 'الجهة الممولة', funderSelect);
    check(detailsInput.value.trim(), 'التفاصيل', detailsInput);

    if (!missing.length) return true;

    let message = `الرجاء إكمال الحقول التالية: ${missing.join('، ')}`;
    if (!spenderList.length) message += ' — أضف جهة قائمة بالصرف من قسم «الجهات القائمة بالصرف»';
    if (!fundingParties.length) message += ' — أضف مقبوضاً أولاً لتظهر الجهة الممولة';

    badFields.forEach(el => el.classList.add('invalid'));
    showError(message);
    badFields[0].focus();
    return false;
}

expenseForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateExpense()) return;

    const data = {
        amount: parseAmount(amountInput.value),
        date: dateInput.value,                          // YYYY-MM-DD
        destinationId: Number(destinationSelect.value),
        spenderId: Number(spenderSelect.value),
        fundingPartyId: Number(funderSelect.value),
        note: noteInput.value.trim(),
        details: detailsInput.value.trim(),
    };

    const backToReport = returnToReport;

    try {
        if (editingId) await window.api.updateExpense(editingId, data);
        else await window.api.addExpense(data);

        resetExpenseForm();
        await refreshMoneyData();

        if (backToReport) {
            showPage('expenses-report');
            expensesReportForm.requestSubmit();   // يعيد عرض الكشف بالبيانات المحدثة
            showToast('تم تعديل المصروف');
        }
    } catch (err) {
        console.error(err);
        showError(cleanError(err));
    }
});

expenseForm.addEventListener('input', e => e.target.classList.remove('invalid'));

// صف مصروف موحّد في القائمة وفي الكشف
function buildExpenseRow(e, onEdit, onDelete, actionsClass = '') {
    const tr = document.createElement('tr');
    tr.title = auditTitle(e);   // من أضاف ومن عدّل عند وقوف المؤشر

    tr.appendChild(createCell(formatMoney(e.amount), 'num-cell'));
    tr.appendChild(createDateCell(e.date));
    tr.appendChild(createCell(e.details, 'details-cell'));
    tr.appendChild(createCell(e.note));
    tr.appendChild(createCell(e.destination));
    tr.appendChild(createCell(e.spender || '—'));
    tr.appendChild(createPartyCell(e.funding_party));
    tr.appendChild(createCell(accountantOf(e)));
    tr.appendChild(createActionsCell(onEdit, onDelete, actionsClass));
    return tr;
}

async function removeExpense(id) {
    if (!confirm('هل تريد حذف هذا المصروف؟')) return;
    try {
        await window.api.deleteExpense(id);
        if (editingId === id) resetExpenseForm();
        await refreshMoneyData();
    } catch (err) {
        console.error(err);
        showToast('تعذر الحذف', true);
    }
}

function renderExpenses() {
    expensesBody.innerHTML = '';
    if (!expenses.length) {
        emptyRow(expensesBody, 'لا توجد مصروفات بعد', 9);
        return;
    }
    expenses.forEach(e => {
        expensesBody.appendChild(buildExpenseRow(e, () => startEdit(e), () => removeExpense(e.id)));
    });
}

async function loadExpenses() {
    expenses = await window.api.getExpenses();
    renderExpenses();
}

/* ================= المقبوضات ================= */
let editingLoanId = null;
let returnToLoansReport = false;   // هل بدأ تعديل المقبوض من كشف المقبوضات؟

const loanForm = document.getElementById('loan-form');
const loanAmountInput = document.getElementById('loan-amount');
const loanDateInput = document.getElementById('loan-date');
const loanFunderInput = document.getElementById('loan-funder');
const loanNoteInput = document.getElementById('loan-note');
const fundersDatalist = document.getElementById('funders-list');
const loanErrorBox = document.getElementById('loan-error');
const loanSubmitBtn = document.getElementById('loan-submit');
const loanCancelBtn = document.getElementById('loan-cancel');
const loansBody = document.getElementById('loans-body');

attachAmountFormat(loanAmountInput);
const loanDatePicker = createDatePicker(loanDateInput);

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
    loanSubmitBtn.textContent = 'حفظ المقبوض';
    loanCancelBtn.classList.add('hidden');
    loanDatePicker.setDate(new Date());
    clearLoanErrors();
}

function startLoanEdit(loan) {
    returnToLoansReport = false;
    editingLoanId = loan.id;
    loanAmountInput.value = formatAmount(loan.amount);
    loanDatePicker.setDate(loan.date);
    loanFunderInput.value = loan.funding_party;
    loanNoteInput.value = loan.note;

    loanSubmitBtn.textContent = 'تحديث المقبوض';
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
    const check = (ok, label, field) => {
        if (ok) return;
        missing.push(label);
        badFields.push(field);
    };

    check(parseAmount(loanAmountInput.value) > 0, 'المبلغ', loanAmountInput);
    check(loanDateInput.value, 'التاريخ', loanDatePicker.altInput);
    check(loanFunderInput.value.trim(), 'الجهة الممولة', loanFunderInput);

    if (!missing.length) return true;

    badFields.forEach(el => el.classList.add('invalid'));
    showLoanError(`الرجاء إكمال الحقول التالية: ${missing.join('، ')}`);
    badFields[0].focus();
    return false;
}

loanForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateLoanForm()) return;

    const data = {
        amount: parseAmount(loanAmountInput.value),
        date: loanDateInput.value,
        fundingParty: loanFunderInput.value.replace(/\s+/g, ' ').trim(),
        note: loanNoteInput.value.trim(),
    };

    const backToReport = returnToLoansReport;

    try {
        if (editingLoanId) await window.api.updateLoan(editingLoanId, data);
        else await window.api.addLoan(data);

        resetLoanForm();
        await refreshMoneyData();

        if (backToReport) {
            showPage('loans-report');
            loansReportForm.requestSubmit();   // يعيد عرض الكشف بالبيانات المحدثة
            showToast('تم تعديل المقبوض');
        }
    } catch (err) {
        console.error(err);
        showLoanError(cleanError(err));
    }
});

// صف مقبوض موحّد في القائمة وفي الكشف
function buildLoanRow(l, onEdit, onDelete, actionsClass = '') {
    const tr = document.createElement('tr');
    tr.title = auditTitle(l);

    tr.appendChild(createCell(formatMoney(l.amount), 'num-cell'));
    tr.appendChild(createDateCell(l.date));
    tr.appendChild(createPartyCell(l.funding_party));
    tr.appendChild(createCell(l.note, 'details-cell'));
    tr.appendChild(createCell(accountantOf(l)));
    tr.appendChild(l.is_carry
        ? createCarryCell(actionsClass)
        : createActionsCell(onEdit, onDelete, actionsClass));
    return tr;
}

async function removeLoan(id) {
    if (!confirm('هل تريد حذف هذا المقبوض؟')) return;
    try {
        await window.api.deleteLoan(id);
        if (editingLoanId === id) resetLoanForm();
        await refreshMoneyData();
    } catch (err) {
        console.error(err);
        showToast(cleanError(err), true);
    }
}

function renderLoans() {
    loansBody.innerHTML = '';
    if (!loans.length) {
        emptyRow(loansBody, 'لا توجد مقبوضات بعد', 6);
        return;
    }
    loans.forEach(l => {
        loansBody.appendChild(buildLoanRow(l, () => startLoanEdit(l), () => removeLoan(l.id)));
    });
}

async function loadLoans() {
    loans = await window.api.getLoans();
    renderLoans();
}

/* ================= تحديث القوائم المرتبطة ================= */
// يعيد تعبئة كل القوائم المنسدلة وقوائم الاختيار من الحالة الحالية
function syncSelects() {
    const hadDestination = destinationSelect.value;
    fillSelect(destinationSelect, destinations);
    if (!hadDestination) setDefaultDestination();

    fillSelect(spenderSelect, spenderList, 'اختر الجهة القائمة بالصرف');
    fillSelect(funderSelect, fundingParties, 'اختر الجهة الممولة');

    fillCheckList(reportDestinations, destinations);
    fillCheckList(reportSpenders, spenderList);
    fillCheckList(reportFunders, fundingParties);

    // اقتراحات الجهات الممولة عند كتابة مقبوض
    fundersDatalist.innerHTML = '';
    fundingParties.forEach(p => {
        const option = document.createElement('option');
        option.value = p.name;
        fundersDatalist.appendChild(option);
    });
}

async function reloadFundingParties() {
    fundingParties = await window.api.getFundingParties();
    syncSelects();
}

// بعد أي إضافة أو تعديل أو حذف لمصروف أو مقبوض
async function refreshMoneyData() {
    await Promise.all([loadExpenses(), loadLoans(), reloadFundingParties()]);
}

/* ================= السنة والشهر (القاصة والخلاصة) ================= */
function initPeriodFields(yearInput, monthSelect) {
    MONTHS.forEach((name, i) => {
        const option = document.createElement('option');
        option.value = i + 1;
        option.textContent = name;
        monthSelect.appendChild(option);
    });

    const now = new Date();
    yearInput.value = now.getFullYear();
    monthSelect.value = now.getMonth() + 1;
}

// يقرأ السنة والشهر، ويعرض رسالة إن كانت السنة غير صحيحة
function readPeriod(yearInput, monthSelect, errorEl) {
    hideNote(errorEl);

    const year = Number(yearInput.value);
    const month = Number(monthSelect.value);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        showNote(errorEl, 'أدخل سنة صحيحة، مثل 2026');
        return null;
    }
    return { year, month };
}

function periodRange(year, month) {
    const last = new Date(year, month, 0).getDate();
    return {
        from: `${year}-${pad2(month)}-01`,
        to: `${year}-${pad2(month)}-${pad2(last)}`,
    };
}

/* ================= القاصة (شهرية، وكشفها في الصفحة نفسها) ================= */
const cashForm = document.getElementById('cash-form');
const cashYear = document.getElementById('cash-year');
const cashMonth = document.getElementById('cash-month');
const cashError = document.getElementById('cash-error');
const cashTitle = document.getElementById('cash-title');
const cashSubtitle = document.getElementById('cash-subtitle');
const cashHint = document.getElementById('cash-hint');
const cashBody = document.getElementById('cash-body');
const cashTotalLoans = document.getElementById('cash-total-loans');
const cashTotalSpent = document.getElementById('cash-total-spent');
const cashTotalRemaining = document.getElementById('cash-total-remaining');
const cashLedgerBody = document.getElementById('cash-ledger-body');
const cashLedgerCount = document.getElementById('cash-ledger-count');
const cashLedgerIn = document.getElementById('cash-ledger-in');
const cashLedgerOut = document.getElementById('cash-ledger-out');
const cashLedgerClosing = document.getElementById('cash-ledger-closing');
const cashExcelBtn = document.getElementById('cash-excel');

initPeriodFields(cashYear, cashMonth);

let cashExport = null;   // آخر قاصة معروضة (للتصدير)

function setRemaining(cell, value) {
    cell.textContent = formatMoney(value);
    cell.classList.toggle('negative', value < 0);   // الأحمر عند تجاوز المقبوضات
}

function renderCash(data, year, month) {
    const { from, to } = periodRange(year, month);
    const title = `القاصة — ${MONTHS[month - 1]} ${year}`;
    const subtitle = periodText(from, to);
    const prevName = MONTHS[(month + 10) % 12];   // اسم الشهر السابق

    cashTitle.textContent = title;
    cashSubtitle.textContent = subtitle;
    cashHint.textContent = data.cumulative
        ? 'أرقام تراكمية حتى نهاية هذا الشهر (قبل بدء الترحيل التلقائي).'
        : 'صافي المقبوضات يشمل المبلغ المرحّل من الشهر السابق، ويُرحَّل المتبقي تلقائياً في أول كل شهر كمقبوض بنفس الجهة الممولة.';

    /* --- جدول القاصة حسب الجهة الممولة --- */
    cashBody.innerHTML = '';
    let totalLoans = 0;
    let totalSpent = 0;
    const partyRows = [];

    data.byParty.forEach(r => {
        const remaining = round2(r.loans_total - r.spent_total);
        totalLoans = round2(totalLoans + r.loans_total);
        totalSpent = round2(totalSpent + r.spent_total);
        partyRows.push([r.name, r.loans_total, r.spent_total, remaining]);

        const tr = document.createElement('tr');
        tr.appendChild(createCell(r.name));
        tr.appendChild(createMoneyCell(r.loans_total));
        tr.appendChild(createMoneyCell(r.spent_total));
        tr.appendChild(createMoneyCell(remaining));
        cashBody.appendChild(tr);
    });

    if (!data.byParty.length) emptyRow(cashBody, 'لا توجد جهات ممولة بعد', 4);

    const totalRemaining = round2(totalLoans - totalSpent);
    cashTotalLoans.textContent = formatMoney(totalLoans);
    cashTotalSpent.textContent = formatMoney(totalSpent);
    setRemaining(cashTotalRemaining, totalRemaining);

    /* --- كشف القاصة (الحركات) --- */
    cashLedgerBody.innerHTML = '';
    let balance = round2(data.opening);
    let ledgerIn = 0;
    let ledgerOut = 0;
    const openingLabel = `الرصيد المرحّل من شهر ${prevName}`;

    const openingTr = document.createElement('tr');
    openingTr.className = 'opening-row';
    openingTr.appendChild(createCell(''));
    openingTr.appendChild(createCell(openingLabel));
    openingTr.appendChild(createCell(''));
    openingTr.appendChild(createCell(''));
    openingTr.appendChild(createMoneyCell(balance));
    cashLedgerBody.appendChild(openingTr);

    const excelRows = [['', openingLabel, '', '', balance]];

    data.rows.forEach(r => {
        const isLoan = r.kind === 'loan';
        const text = isLoan
            ? `مقبوض من ${r.party}${r.text ? ` — ${r.text}` : ''}`
            : r.text;

        if (isLoan) {
            ledgerIn = round2(ledgerIn + r.amount);
            balance = round2(balance + r.amount);
        } else {
            ledgerOut = round2(ledgerOut + r.amount);
            balance = round2(balance - r.amount);
        }

        const tr = document.createElement('tr');
        tr.title = auditTitle(r);

        tr.appendChild(createDateCell(r.date));
        tr.appendChild(createCell(text, 'details-cell'));
        tr.appendChild(isLoan ? createMoneyCell(r.amount) : createCell(''));
        tr.appendChild(isLoan ? createCell('') : createMoneyCell(r.amount));
        tr.appendChild(createMoneyCell(balance));
        cashLedgerBody.appendChild(tr);

        excelRows.push([
            formatDate(r.date),
            text,
            isLoan ? r.amount : '',
            isLoan ? '' : r.amount,
            balance,
        ]);
    });

    if (!data.rows.length) emptyRow(cashLedgerBody, 'لا توجد حركات في هذا الشهر', 5);

    cashLedgerCount.textContent = `الإجمالي — عدد الحركات: ${data.rows.length}`;
    cashLedgerIn.textContent = formatMoney(ledgerIn);
    cashLedgerOut.textContent = formatMoney(ledgerOut);
    setRemaining(cashLedgerClosing, balance);

    /* --- ملف Excel: ورقتان --- */
    cashExport = {
        title,
        subtitle,
        fileName: `cash-${year}-${pad2(month)}.xlsx`,
        sheets: [
            {
                name: 'القاصة',
                columns: [
                    { header: 'الجهة الممولة', width: 30 },
                    { header: 'صافي المقبوضات', width: 20 },
                    { header: 'المصروف منها', width: 20 },
                    { header: 'المتبقي', width: 20 },
                ],
                rows: partyRows,
                total: ['المجموع', totalLoans, totalSpent, totalRemaining],
                mergeTotal: false,
            },
            {
                name: 'كشف القاصة',
                columns: [
                    { header: 'التاريخ', width: 14 },
                    { header: 'البيان', width: 56 },
                    { header: 'وارد', width: 16 },
                    { header: 'صادر', width: 16 },
                    { header: 'الرصيد', width: 16 },
                ],
                rows: excelRows,
                total: ['الإجمالي', `عدد الحركات: ${data.rows.length}`, ledgerIn, ledgerOut, balance],
                mergeTotal: false,
            },
        ],
    };

    cashExcelBtn.disabled = false;
}

async function loadCash() {
    const period = readPeriod(cashYear, cashMonth, cashError);
    if (!period) return;

    try {
        renderCash(await window.api.getMonthCashReport(period), period.year, period.month);
    } catch (err) {
        console.error(err);
        showNote(cashError, cleanError(err));
    }
}

cashForm.addEventListener('submit', e => {
    e.preventDefault();
    loadCash();
});

document.getElementById('cash-print').addEventListener('click', printReport);
cashExcelBtn.addEventListener('click', () => exportReport(cashExport));

/* ================= الخلاصة (شهرية) ================= */
const summaryForm = document.getElementById('summary-form');
const summaryYear = document.getElementById('summary-year');
const summaryMonth = document.getElementById('summary-month');
const summaryError = document.getElementById('summary-error');
const summaryTitle = document.getElementById('summary-title');
const summarySubtitle = document.getElementById('summary-subtitle');
const summaryExpenses = document.getElementById('summary-expenses');
const summaryLoans = document.getElementById('summary-loans');
const summaryTotal = document.getElementById('summary-total');
const summaryHint = document.getElementById('summary-hint');
const summaryBody = document.getElementById('summary-body');
const summaryTotalCount = document.getElementById('summary-total-count');
const summaryTotalSum = document.getElementById('summary-total-sum');
const summaryExcelBtn = document.getElementById('summary-excel');

initPeriodFields(summaryYear, summaryMonth);

let summaryExport = null;   // آخر خلاصة معروضة (للتصدير)

function renderSummary(data, year, month) {
    const { from, to } = periodRange(year, month);
    const title = `الخلاصة — ${MONTHS[month - 1]} ${year}`;
    const subtitle = periodText(from, to);

    summaryTitle.textContent = title;
    summarySubtitle.textContent = subtitle;
    summaryBody.innerHTML = '';

    let totalCount = 0;
    let totalExpenses = 0;
    const excelRows = [];

    data.destinations.forEach(d => {
        totalCount += d.expenses_count;
        totalExpenses = round2(totalExpenses + d.expenses_total);
        excelRows.push([d.name, d.expenses_count, d.expenses_total]);

        const tr = document.createElement('tr');
        tr.appendChild(createCell(d.name));
        tr.appendChild(createCell(String(d.expenses_count)));
        tr.appendChild(createMoneyCell(d.expenses_total));
        summaryBody.appendChild(tr);
    });

    const totalLoans = round2(data.loansTotal);
    const difference = round2(totalExpenses - totalLoans);

    summaryTotalCount.textContent = String(totalCount);
    summaryTotalSum.textContent = formatMoney(totalExpenses);

    summaryExpenses.textContent = formatMoney(totalExpenses);
    summaryLoans.textContent = formatMoney(totalLoans);
    summaryTotal.textContent = formatMoney(difference);

    if (difference > 0) {
        summaryHint.textContent = `المصروفات أكثر من المقبوضات بمقدار ${formatMoney(difference)}`;
    } else if (difference < 0) {
        summaryHint.textContent = `تبقى من المقبوضات ${formatMoney(Math.abs(difference))}`;
    } else {
        summaryHint.textContent = 'المصروفات تساوي المقبوضات';
    }

    summaryExport = {
        title,
        subtitle,
        fileName: `summary-${year}-${pad2(month)}.xlsx`,
        sheets: [
            {
                name: 'الخلاصة',
                columns: [
                    { header: 'الجهة المستفيدة', width: 36 },
                    { header: 'عدد المصروفات', width: 20 },
                    { header: 'المجموع', width: 22 },
                ],
                rows: excelRows,
                total: ['إجمالي المصروفات', totalCount, totalExpenses],
                extraRows: [
                    ['مجموع المقبوضات', '', totalLoans],
                    ['المجموع الكلي (المصروفات − المقبوضات)', '', difference],
                ],
                mergeTotal: false,
            },
        ],
    };

    summaryExcelBtn.disabled = false;
}

async function loadSummary() {
    const period = readPeriod(summaryYear, summaryMonth, summaryError);
    if (!period) return;

    try {
        renderSummary(await window.api.getMonthSummary(period), period.year, period.month);
    } catch (err) {
        console.error(err);
        showNote(summaryError, cleanError(err));
    }
}

summaryForm.addEventListener('submit', e => {
    e.preventDefault();
    loadSummary();
});

document.getElementById('summary-print').addEventListener('click', printReport);
summaryExcelBtn.addEventListener('click', () => exportReport(summaryExport));

/* ================= كشف المصروفات ================= */
const expensesReportForm = document.getElementById('expenses-report-form');
const reportDestinations = document.getElementById('report-destinations');
const reportSpenders = document.getElementById('report-spenders');
const destGroup = document.getElementById('report-dest-group');
const spenderGroup = document.getElementById('report-spender-group');
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

createDatePicker(expFromInput, { defaultDate: monthStartISO() });
createDatePicker(expToInput);

let expensesReport = null;   // آخر كشف معروض (للتصدير)

const reportMode = () => document.querySelector('input[name="report-mode"]:checked').value;

// طريقة الكشف: حسب الجهة المستفيدة، أو حسب الجهة القائمة بالصرف
document.querySelectorAll('input[name="report-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const bySpender = reportMode() === 'spender';
        destGroup.classList.toggle('hidden', bySpender);
        spenderGroup.classList.toggle('hidden', !bySpender);
    });
});

function renderExpensesReport(rows, mode, ids, from, to) {
    const source = mode === 'spender' ? spenderList : destinations;
    const names = source.filter(i => ids.includes(i.id)).map(i => i.name).join('، ');
    const title = mode === 'spender'
        ? `كشف مصروفات الجهة القائمة بالصرف: ${names}`
        : `كشف مصروفات الجهة المستفيدة: ${names}`;
    const subtitle = periodText(from, to);
    const total = round2(rows.reduce((s, r) => s + r.amount, 0));

    expensesReportTitle.textContent = title;
    expensesReportSubtitle.textContent = subtitle;

    expensesReportBody.innerHTML = '';
    if (!rows.length) emptyRow(expensesReportBody, 'لا توجد مصروفات في هذه الفترة', 9);

    rows.forEach(r => {
        expensesReportBody.appendChild(buildExpenseRow(
            r,
            () => editFromReport(r),
            () => removeFromReport(r),
            'noprint',                       // الأزرار لا تُطبع
        ));
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
            { header: 'التفاصيل', width: 50 },
            { header: 'ملاحظات', width: 24 },
            { header: 'الجهة المستفيدة', width: 22 },
            { header: 'الجهة القائمة بالصرف', width: 24 },
            { header: 'الجهة الممولة', width: 22 },
            { header: 'المحاسب', width: 18 },
        ],
        rows: rows.map(r => [
            r.amount, formatDate(r.date), r.details, r.note,
            r.destination, r.spender || '—', r.funding_party, accountantOf(r),
        ]),
        total: [total, `المجموع — عدد المصروفات: ${rows.length}`, '', '', '', '', '', ''],
    };

    expensesReportExcelBtn.disabled = !rows.length;
    expensesReportResult.classList.remove('hidden');
}

// التعديل من الكشف: ننتقل لصفحة المصروفات، وبعد الحفظ نعود للكشف
function editFromReport(row) {
    showPage('expenses');
    startEdit(row);
    returnToReport = true;   // بعد startEdit لأنها تصفّره
}

async function removeFromReport(row) {
    if (!confirm('هل تريد حذف هذا المصروف؟')) return;

    try {
        await window.api.deleteExpense(row.id);
        if (editingId === row.id) resetExpenseForm();
        await refreshMoneyData();
        expensesReportForm.requestSubmit();   // يحدّث الكشف والمجموع
        showToast('تم حذف المصروف');
    } catch (err) {
        console.error(err);
        showToast('تعذر حذف المصروف', true);
    }
}

expensesReportForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideNote(expensesReportError);

    const mode = reportMode();
    const ids = getCheckedIds(mode === 'spender' ? reportSpenders : reportDestinations);
    const from = expFromInput.value;
    const to = expToInput.value;

    if (!ids.length) {
        showNote(
            expensesReportError,
            mode === 'spender'
                ? 'اختر جهة قائمة بالصرف واحدة على الأقل'
                : 'اختر جهة مستفيدة واحدة على الأقل',
        );
        return;
    }
    if (from > to) {
        showNote(expensesReportError, 'تاريخ البداية بعد تاريخ النهاية');
        return;
    }

    try {
        const rows = await window.api.getExpensesReport({ by: mode, ids, from, to });
        renderExpensesReport(rows, mode, ids, from, to);
    } catch (err) {
        console.error(err);
        showNote(expensesReportError, cleanError(err));
    }
});

document.getElementById('report-dest-all').addEventListener('click', () => setAllChecked(reportDestinations, true));
document.getElementById('report-dest-none').addEventListener('click', () => setAllChecked(reportDestinations, false));
document.getElementById('report-spn-all').addEventListener('click', () => setAllChecked(reportSpenders, true));
document.getElementById('report-spn-none').addEventListener('click', () => setAllChecked(reportSpenders, false));
document.getElementById('expenses-report-print').addEventListener('click', printReport);
expensesReportExcelBtn.addEventListener('click', () => exportReport(expensesReport));

/* ================= كشف المقبوضات (حسب الجهة الممولة) ================= */
const loansReportForm = document.getElementById('loans-report-form');
const reportFunders = document.getElementById('report-funders');
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

createDatePicker(loanFromInput, { defaultDate: monthStartISO() });
createDatePicker(loanToInput);

let loansReport = null;

function renderLoansReport(rows, ids, from, to) {
    const names = fundingParties.filter(p => ids.includes(p.id)).map(p => p.name).join('، ');
    const title = `كشف المقبوضات حسب الجهة الممولة: ${names}`;
    const subtitle = periodText(from, to);
    const total = round2(rows.reduce((s, r) => s + r.amount, 0));

    loansReportTitle.textContent = title;
    loansReportSubtitle.textContent = subtitle;

    loansReportBody.innerHTML = '';
    if (!rows.length) emptyRow(loansReportBody, 'لا توجد مقبوضات في هذه الفترة', 6);

    rows.forEach(r => {
        loansReportBody.appendChild(buildLoanRow(
            r,
            () => editLoanFromReport(r),
            () => removeLoanFromReport(r),
            'noprint',                       // الأزرار لا تُطبع
        ));
    });

    loansReportTotal.textContent = formatMoney(total);
    loansReportCount.textContent = `المجموع — عدد المقبوضات: ${rows.length}`;

    loansReport = {
        title,
        subtitle,
        fileName: `receipts-report-${from}-to-${to}.xlsx`,
        columns: [
            { header: 'المبلغ', width: 18 },
            { header: 'التاريخ', width: 14 },
            { header: 'الجهة الممولة', width: 30 },
            { header: 'البيان', width: 44 },
            { header: 'المحاسب', width: 18 },
        ],
        rows: rows.map(r => [r.amount, formatDate(r.date), r.funding_party, r.note, accountantOf(r)]),
        total: [total, `المجموع — عدد المقبوضات: ${rows.length}`, '', '', ''],
    };

    loansReportExcelBtn.disabled = !rows.length;
    loansReportResult.classList.remove('hidden');
}

// التعديل من كشف المقبوضات: ننتقل لصفحة المقبوضات، وبعد الحفظ نعود للكشف
function editLoanFromReport(row) {
    showPage('loans');
    startLoanEdit(row);
    returnToLoansReport = true;   // بعد startLoanEdit لأنها تصفّره
}

async function removeLoanFromReport(row) {
    if (!confirm('هل تريد حذف هذا المقبوض؟')) return;

    try {
        await window.api.deleteLoan(row.id);
        if (editingLoanId === row.id) resetLoanForm();
        await refreshMoneyData();
        loansReportForm.requestSubmit();   // يحدّث الكشف والمجموع
        showToast('تم حذف المقبوض');
    } catch (err) {
        console.error(err);
        showToast(cleanError(err), true);
    }
}

loansReportForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideNote(loansReportError);

    const ids = getCheckedIds(reportFunders);
    const from = loanFromInput.value;
    const to = loanToInput.value;

    if (!ids.length) {
        showNote(loansReportError, 'اختر جهة ممولة واحدة على الأقل');
        return;
    }
    if (from > to) {
        showNote(loansReportError, 'تاريخ البداية بعد تاريخ النهاية');
        return;
    }

    try {
        const rows = await window.api.getLoansReport({ fundingPartyIds: ids, from, to });
        renderLoansReport(rows, ids, from, to);
    } catch (err) {
        console.error(err);
        showNote(loansReportError, cleanError(err));
    }
});

document.getElementById('report-funder-all').addEventListener('click', () => setAllChecked(reportFunders, true));
document.getElementById('report-funder-none').addEventListener('click', () => setAllChecked(reportFunders, false));
document.getElementById('loans-report-print').addEventListener('click', printReport);
loansReportExcelBtn.addEventListener('click', () => exportReport(loansReport));

/* ================= تحديث البيانات ================= */
let refreshing = false;

async function refreshAll() {
    if (refreshing) return;   // لا نكرر التحديث إذا ضغط المستخدم مرتين
    refreshing = true;

    try {
        await Promise.all([
            beneficiaries.load(),
            spenders.load(),
            refreshMoneyData(),
            loadCash(),
            loadSummary(),
        ]);

        // إذا كان كشف معروضاً، نعيد عرضه بالأرقام الجديدة
        if (!expensesReportResult.classList.contains('hidden')) expensesReportForm.requestSubmit();
        if (!loansReportResult.classList.contains('hidden')) loansReportForm.requestSubmit();

        showToast('تم تحديث البيانات');
    } catch (err) {
        console.error(err);
        showToast('تعذر تحديث البيانات', true);
    } finally {
        refreshing = false;
    }
}

document.getElementById('refresh-btn').addEventListener('click', refreshAll);

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
    await Promise.all([beneficiaries.load(), spenders.load(), reloadFundingParties()]);
    await Promise.all([loadExpenses(), loadLoans()]);
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
        emptyRow(accountantsBody, 'لا يوجد محاسبون بعد', 3);
        return;
    }

    accountants.forEach(a => {
        const tr = document.createElement('tr');
        tr.appendChild(createCell(a.display_name || a.username));
        tr.appendChild(createCell(a.username));
        tr.appendChild(createActionsCell(() => startAccountantEdit(a), () => removeAccountant(a)));
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

/* ================= التشغيل الأولي ================= */
async function startup() {
    try {
        const user = await window.api.getSession();   // بقاء الجلسة عند إعادة تحميل النافذة
        if (user) await enterApp(user);
        else showLogin();
    } catch (err) {
        console.error(err);
        showLogin();
    }
}

startup();