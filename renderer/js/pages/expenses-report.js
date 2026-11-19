// كشف المصروفات: حسب الجهة المستفيدة أو حسب الجهة القائمة بالصرف
(() => {
    const form = $('expenses-report-form');
    const destinationsList = $('report-destinations');
    const spendersList = $('report-spenders');
    const destGroup = $('report-dest-group');
    const spenderGroup = $('report-spender-group');
    const fromInput = $('exp-from');
    const toInput = $('exp-to');
    const errorEl = $('expenses-report-error');
    const result = $('expenses-report-result');
    const body = $('expenses-report-body');
    const excelBtn = $('expenses-report-excel');

    createDatePicker(fromInput, { defaultDate: monthStartISO() });
    createDatePicker(toInput);

    let exportData = null;

    const mode = () => document.querySelector('input[name="report-mode"]:checked').value;

    document.querySelectorAll('input[name="report-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const bySpender = mode() === 'spender';
            destGroup.classList.toggle('hidden', bySpender);
            spenderGroup.classList.toggle('hidden', !bySpender);
        });
    });

    function render(rows, by, ids, from, to) {
        const source = by === 'spender' ? App.lists.spenders : App.lists.destinations;
        const names = source.filter(i => ids.includes(i.id)).map(i => i.name).join('، ');
        const title = by === 'spender'
            ? `كشف مصروفات الجهة القائمة بالصرف: ${names}`
            : `كشف مصروفات الجهة المستفيدة: ${names}`;
        const subtitle = periodText(from, to);
        const total = round2(rows.reduce((s, r) => s + r.cash_out, 0));   // المصروف نقداً فعلياً

        $('expenses-report-title').textContent = title;
        $('expenses-report-subtitle').textContent = subtitle;

        body.innerHTML = '';
        if (!rows.length) emptyRow(body, 'لا توجد مصروفات في هذه الفترة', 12);
        rows.forEach(r => {
            body.appendChild(buildExpenseRow(r, () => editRow(r), () => removeRow(r), 'noprint'));
        });

        $('expenses-report-total').textContent = formatMoney(total);
        $('expenses-report-count').textContent = `المجموع — عدد القيود: ${rows.length}`;

        exportData = {
            title,
            subtitle,
            fileName: `expenses-report-${from}-to-${to}.xlsx`,
            columns: [
                { header: 'رقم الوصل', width: 14 }, { header: 'المبلغ الكلي', width: 16 },
                { header: 'المدفوع نقداً', width: 16 }, { header: 'المتبقي', width: 16 },
                { header: 'التاريخ', width: 14 }, { header: 'التفاصيل', width: 50 },
                { header: 'ملاحظات', width: 24 }, { header: 'الجهة المستفيدة', width: 22 },
                { header: 'الجهة القائمة بالصرف', width: 24 }, { header: 'مصدر الاستقطاع', width: 22 },
                { header: 'المحاسب', width: 18 },
            ],
            rows: rows.map(r => [
                r.receipt_no || '', r.amount, r.paid, r.remaining, formatDate(r.date), r.details, r.note,
                r.destination, r.spender || '—', r.source || '—', accountantOf(r),
            ]),
            total: [`المجموع (المصروف نقداً فعلياً) — عدد القيود: ${rows.length}`, '', total, '', '', '', '', '', '', '', ''],
            mergeTotal: false,
        };
        excelBtn.disabled = !rows.length;
        result.classList.remove('hidden');
    }

    // التعديل من الكشف: ننتقل لصفحة المصروفات، وبعد الحفظ نعود للكشف
    function editRow(row) {
        App.showPage('expenses');
        App.pages.expenses.startEdit(row, { returnTo: 'expenses-report' });
    }

    async function removeRow(row) {
        if (!confirm('هل تريد حذف هذا المصروف؟')) return;
        try {
            await window.api.deleteExpense(row.id);
            App.pages.expenses.onDeleted(row.id);
            await App.refreshAll({ silent: true });   // يحدّث الكشف والمجموع وكل الصفحات
        } catch (err) {
            console.error(err);
            showProblem(cleanError(err));
        }
    }

    async function run() {
        hideNote(errorEl);
        const by = mode();
        const ids = getCheckedIds(by === 'spender' ? spendersList : destinationsList);
        const from = fromInput.value;
        const to = toInput.value;

        if (!ids.length) {
            return showNote(errorEl, by === 'spender' ? 'اختر جهة قائمة بالصرف واحدة على الأقل' : 'اختر جهة مستفيدة واحدة على الأقل');
        }
        if (from > to) return showNote(errorEl, 'تاريخ البداية بعد تاريخ النهاية');

        try {
            render(await window.api.getExpensesReport({ by, ids, from, to }), by, ids, from, to);
        } catch (err) {
            console.error(err);
            showNote(errorEl, cleanError(err));
        }
    }

    form.addEventListener('submit', e => { e.preventDefault(); run(); });

    $('report-dest-all').addEventListener('click', () => setAllChecked(destinationsList, true));
    $('report-dest-none').addEventListener('click', () => setAllChecked(destinationsList, false));
    $('report-spn-all').addEventListener('click', () => setAllChecked(spendersList, true));
    $('report-spn-none').addEventListener('click', () => setAllChecked(spendersList, false));
    $('expenses-report-print').addEventListener('click', printReport);
    excelBtn.addEventListener('click', () => exportReport(exportData));

    function fillLists() {
        fillCheckList(destinationsList, App.lists.destinations);
        fillCheckList(spendersList, App.lists.spenders);
    }

    // إن كان كشف معروضاً نعيد عرضه بالأرقام الجديدة
    const refresh = async () => { if (!result.classList.contains('hidden')) await run(); };

    App.registerPage('expensesReport', { refresh, fillLists });
})();