// صفحة المقبوضات: الإضافة والتعديل وإدارة المصادر وآخر 100 مقبوض
(() => {
    const form = $('loan-form');
    const amountInput = $('loan-amount');
    const dateInput = $('loan-date');
    const sourceSelect = $('loan-source');
    const errorBox = $('loan-error');
    const submitBtn = $('loan-submit');
    const cancelBtn = $('loan-cancel');
    const body = $('loans-body');
    const sourcesBody = $('sources-body');

    attachAmountFormat(amountInput);
    const datePicker = createDatePicker(dateInput);

    let items = [];
    let editingId = null;
    let returnTo = null;

    function clearErrors() {
        errorBox.classList.add('hidden');
        form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    }

    function showError(message) {
        errorBox.textContent = message;
        errorBox.classList.remove('hidden');
    }

    /* ---------- جدول المصادر (مع الحذف) ---------- */
    async function removeSource(s) {
        if (!confirm(`هل تريد حذف المصدر «${s.name}»؟`)) return;
        try {
            await window.api.deleteSource(s.id);
            await App.refreshAll({ silent: true });
        } catch (err) {
            console.error(err);
            showProblem(cleanError(err));   // مثلاً: لا يمكن حذف المصدر لأن منه مقبوضات هذا الشهر
        }
    }

    function renderSources() {
        sourcesBody.innerHTML = '';
        const list = activeOnly(App.lists.sources);
        if (!list.length) return emptyRow(sourcesBody, 'لا توجد مصادر، أضف مصدراً من الحقل أعلاه', 3);

        list.forEach(s => {
            const tr = document.createElement('tr');
            tr.appendChild(createCell(s.name));
            tr.appendChild(createCell(String(s.month_count)));
            tr.appendChild(createDeleteCell(() => removeSource(s)));
            sourcesBody.appendChild(tr);
        });
    }

    function fillLists() {
        fillSelect(sourceSelect, App.lists.sources, 'اختر المصدر');
        renderSources();
    }

    /* ---------- النموذج ---------- */
    function reset() {
        form.reset();
        editingId = null;
        returnTo = null;
        delete sourceSelect.dataset.keep;
        fillLists();
        submitBtn.textContent = 'حفظ المقبوض';
        cancelBtn.classList.add('hidden');
        datePicker.setDate(new Date());
        sourceSelect.value = '';
        clearErrors();
    }

    function startEdit(loan, { returnTo: back = null } = {}) {
        returnTo = back;
        editingId = loan.id;

        // مقبوض قديم قد يستخدم مصدراً محذوفاً: نُبقيه في القائمة أثناء هذا التعديل
        sourceSelect.dataset.keep = String(loan.source_id);
        fillLists();

        // نعدّل على المبلغ الأصلي، أما الجدول فيعرض المبلغ بعد خصم غير المصروف
        amountInput.value = formatAmount(loan.raw_amount ?? loan.amount);
        if (loan.carry_deduct > 0) {
            showToast(
                `المبلغ الأصلي ${formatMoney(loan.raw_amount)}، وخُصم منه ${formatMoney(loan.carry_deduct)} لأنه لم يُصرف في ذلك الشهر`,
                false, LONG_TOAST,
            );
        }
        datePicker.setDate(loan.date);
        sourceSelect.value = String(loan.source_id);

        submitBtn.textContent = 'تحديث المقبوض';
        cancelBtn.classList.remove('hidden');
        clearErrors();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        amountInput.focus();
    }

    function validate() {
        clearErrors();
        const missing = [];
        const bad = [];
        const check = (ok, label, field) => { if (!ok) { missing.push(label); bad.push(field); } };

        check(parseAmount(amountInput.value) > 0, 'المبلغ', amountInput);
        check(dateInput.value, 'التاريخ', datePicker.altInput);
        check(sourceSelect.value, 'المصدر', sourceSelect);
        if (!missing.length) return true;

        let message = `الرجاء إكمال الحقول التالية: ${missing.join('، ')}`;
        if (!activeOnly(App.lists.sources).length) message += ' — أضف مصدراً من الصندوق أدناه';

        bad.forEach(el => el.classList.add('invalid'));
        showError(message);
        bad[0].focus();
        return false;
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!validate()) return;

        const data = {
            amount: parseAmount(amountInput.value),
            date: dateInput.value,
            sourceId: Number(sourceSelect.value),
        };
        const goBack = returnTo;

        try {
            if (editingId) await window.api.updateLoan(editingId, data);
            else await window.api.addLoan(data);

            reset();
            await App.refreshAll({ silent: true });
            if (goBack) App.showPage(goBack);
        } catch (err) {
            console.error(err);
            showError(cleanError(err));
        }
    });

    form.addEventListener('input', e => e.target.classList.remove('invalid'));

    cancelBtn.addEventListener('click', () => {
        const goBack = returnTo;
        reset();
        if (goBack) App.showPage(goBack);
    });

    // صندوق إضافة مصدر
    createAddBox({
        form: $('source-add-form'),
        input: $('source-add-name'),
        existing: () => activeOnly(App.lists.sources),
        emptyMessage: 'اكتب اسم المصدر',
        add: name => window.api.addSource(name),
        onAdded: async (id, name) => {
            await loadLists();                        // يظهر المصدر في كل القوائم
            sourceSelect.value = String(id);          // ويُختار في نموذج المقبوض
            showToast(`تمت إضافة المصدر: ${name}`);
        },
    });

    /* ---------- آخر 100 مقبوض ---------- */
    async function remove(id) {
        if (!confirm('هل تريد حذف هذا المقبوض؟')) return;
        try {
            await window.api.deleteLoan(id);
            onDeleted(id);
            await App.refreshAll({ silent: true });
        } catch (err) {
            console.error(err);
            showProblem(cleanError(err));
        }
    }

    function onDeleted(id) {
        if (editingId === id) reset();
    }

    function render() {
        body.innerHTML = '';
        if (!items.length) return emptyRow(body, 'لا توجد مقبوضات بعد', 5);
        items.forEach(l => body.appendChild(buildLoanRow(l, () => startEdit(l), () => remove(l.id))));
    }

    async function load() {
        items = await window.api.getLoans();
        render();
    }

    App.registerPage('loans', { refresh: load, fillLists, startEdit, onDeleted });
})();