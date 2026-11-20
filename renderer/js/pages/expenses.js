// صفحة المصروفات: الإضافة والتعديل وآخر 100 مصروف
(() => {
    const form = $('expense-form');
    const amountInput = $('expense-amount');
    const paidInput = $('expense-paid');
    const receiptInput = $('expense-receipt');
    const dateInput = $('expense-date');
    const destinationSelect = $('expense-destination');
    const spenderSelect = $('expense-spender');
    const sourceSelect = $('expense-source');
    const noteInput = $('expense-note');
    const detailsInput = $('expense-details');
    const errorBox = $('expense-error');
    const submitBtn = $('expense-submit');
    const cancelBtn = $('expense-cancel');
    const body = $('expenses-body');

    attachAmountFormat(amountInput);
    attachAmountFormat(paidInput);
    const datePicker = createDatePicker(dateInput);
    detailsInput.addEventListener('input', () => autoGrow(detailsInput));

    let items = [];
    let editingId = null;
    let returnTo = null;   // صفحة العودة بعد الحفظ (عند التعديل من كشف)

    const setDefaultDestination = () => {
        const fixed = App.lists.destinations.find(d => d.is_fixed);
        if (fixed) destinationSelect.value = fixed.id;
    };

    function clearErrors() {
        errorBox.classList.add('hidden');
        form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    }

    function showError(message) {
        errorBox.textContent = message;
        errorBox.classList.remove('hidden');
    }

    function fillLists() {
        const hadDestination = destinationSelect.value;
        fillSelect(destinationSelect, App.lists.destinations);
        if (!hadDestination) setDefaultDestination();
        fillSelect(spenderSelect, App.lists.spenders, 'اختر الجهة القائمة بالصرف');
        fillSelect(sourceSelect, App.lists.sources, 'اختر مصدر الاستقطاع');
    }

    function reset() {
        form.reset();
        editingId = null;
        returnTo = null;
        delete spenderSelect.dataset.keep;
        delete sourceSelect.dataset.keep;
        fillLists();
        submitBtn.textContent = 'حفظ المصروف';
        cancelBtn.classList.add('hidden');
        detailsInput.style.height = 'auto';
        amountInput.readOnly = false;
        datePicker.setDate(new Date());
        setDefaultDestination();
        spenderSelect.value = '';
        sourceSelect.value = '';
        clearErrors();
    }

    function startEdit(expense, { returnTo: back = null } = {}) {
        returnTo = back;
        editingId = expense.id;

        // سجل قديم قد يستخدم جهة أو مصدراً محذوفاً: نُبقيه في القائمة أثناء هذا التعديل
        spenderSelect.dataset.keep = expense.spender_id ?? '';
        sourceSelect.dataset.keep = expense.source_id ?? '';
        fillLists();

        amountInput.value = formatAmount(expense.amount);
        paidInput.value = formatAmount(round2(expense.paid));
        receiptInput.value = expense.receipt_no || '';

        // قيد التسديد: المبلغ الكلي ثابت، والتسديد يتغير بتعديل «المدفوع نقداً» (وهو المدفوع تراكمياً)
        amountInput.readOnly = !!expense.settles_id;
        if (expense.settles_id) {
            showToast('هذا قيد تسديد: المبلغ الكلي ثابت، وتعدّل مبلغ التسديد بتغيير «المدفوع نقداً» (وهو المدفوع تراكمياً)', false, LONG_TOAST);
        }

        datePicker.setDate(expense.date);
        destinationSelect.value = expense.destination_id;
        spenderSelect.value = expense.spender_id ?? '';
        sourceSelect.value = expense.source_id ?? '';
        noteInput.value = expense.note;
        detailsInput.value = expense.details;
        autoGrow(detailsInput);

        submitBtn.textContent = 'تحديث المصروف';
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

        check(parseAmount(amountInput.value) > 0, 'المبلغ الكلي', amountInput);
        check(
            paidInput.value.trim() !== '' && parseAmount(paidInput.value) <= parseAmount(amountInput.value),
            'المدفوع نقداً (مطلوب، اكتب 0 إن لم يُدفع شيء، ولا يزيد على المبلغ الكلي)',
            paidInput,
        );
        check(dateInput.value, 'التاريخ', datePicker.altInput);
        check(destinationSelect.value, 'الجهة المستفيدة', destinationSelect);
        check(spenderSelect.value, 'الجهة القائمة بالصرف', spenderSelect);
        check(sourceSelect.value, 'مصدر الاستقطاع', sourceSelect);
        check(detailsInput.value.trim(), 'التفاصيل', detailsInput);

        if (!missing.length) return true;

        let message = `الرجاء إكمال الحقول التالية: ${missing.join('، ')}`;
        if (!activeOnly(App.lists.spenders).length) message += ' — أضف جهة قائمة بالصرف من صفحة «الجهات القائمة بالصرف»';
        if (!activeOnly(App.lists.sources).length) message += ' — أضف مصدراً من صفحة «المقبوضات»';

        bad.forEach(el => el.classList.add('invalid'));
        showError(message);
        bad[0].focus();
        return false;
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!validate()) return;

        const amount = parseAmount(amountInput.value);
        const data = {
            amount,
            remaining: round2(amount - parseAmount(paidInput.value)),
            receiptNo: receiptInput.value.trim(),
            date: dateInput.value,
            destinationId: Number(destinationSelect.value),
            spenderId: Number(spenderSelect.value),
            sourceId: Number(sourceSelect.value),
            note: noteInput.value.trim(),
            details: detailsInput.value.trim(),
        };
        const goBack = returnTo;

        try {
            if (editingId) await window.api.updateExpense(editingId, data);
            else await window.api.addExpense(data);

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

    async function remove(id) {
        if (!confirm('هل تريد حذف هذا المصروف؟')) return;
        try {
            await window.api.deleteExpense(id);
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
        if (!items.length) return emptyRow(body, 'لا توجد مصروفات بعد', 12);
        items.forEach(e => body.appendChild(buildExpenseRow(e, () => startEdit(e), () => remove(e.id))));
    }

    async function load() {
        items = await window.api.getExpenses();
        render();
    }

    App.registerPage('expenses', { refresh: load, fillLists, startEdit, onDeleted });
})();