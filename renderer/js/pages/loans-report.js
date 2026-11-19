// كشف المقبوضات حسب المصدر
(() => {
    const form = $('loans-report-form');
    const sourcesList = $('report-sources');
    const fromInput = $('loan-from');
    const toInput = $('loan-to');
    const errorEl = $('loans-report-error');
    const result = $('loans-report-result');
    const body = $('loans-report-body');
    const excelBtn = $('loans-report-excel');

    createDatePicker(fromInput, { defaultDate: monthStartISO() });
    createDatePicker(toInput);

    let exportData = null;

    function render(rows, ids, from, to) {
        const names = App.lists.sources.filter(s => ids.includes(s.id)).map(s => s.name).join('، ');
        const title = `كشف المقبوضات حسب المصدر: ${names}`;
        const subtitle = periodText(from, to);
        const total = round2(rows.reduce((s, r) => s + r.amount, 0));

        $('loans-report-title').textContent = title;
        $('loans-report-subtitle').textContent = subtitle;

        body.innerHTML = '';
        if (!rows.length) emptyRow(body, 'لا توجد مقبوضات في هذه الفترة', 5);
        rows.forEach(r => {
            body.appendChild(buildLoanRow(r, () => editRow(r), () => removeRow(r), 'noprint'));
        });

        $('loans-report-total').textContent = formatMoney(total);
        $('loans-report-count').textContent = `المجموع — عدد المقبوضات: ${rows.length}`;

        exportData = {
            title,
            subtitle,
            fileName: `receipts-report-${from}-to-${to}.xlsx`,
            columns: [
                { header: 'المبلغ', width: 18 }, { header: 'التاريخ', width: 14 },
                { header: 'المصدر', width: 30 }, { header: 'المحاسب', width: 18 },
            ],
            rows: rows.map(r => [r.amount, formatDate(r.date), r.source, accountantOf(r)]),
            total: [total, `المجموع — عدد المقبوضات: ${rows.length}`, '', ''],
        };
        excelBtn.disabled = !rows.length;
        result.classList.remove('hidden');
    }

    function editRow(row) {
        App.showPage('loans');
        App.pages.loans.startEdit(row, { returnTo: 'loans-report' });
    }

    async function removeRow(row) {
        if (!confirm('هل تريد حذف هذا المقبوض؟')) return;
        try {
            await window.api.deleteLoan(row.id);
            App.pages.loans.onDeleted(row.id);
            await App.refreshAll({ silent: true });
        } catch (err) {
            console.error(err);
            showProblem(cleanError(err));
        }
    }

    async function run() {
        hideNote(errorEl);
        const ids = getCheckedIds(sourcesList);
        const from = fromInput.value;
        const to = toInput.value;

        if (!ids.length) return showNote(errorEl, 'اختر مصدراً واحداً على الأقل');
        if (from > to) return showNote(errorEl, 'تاريخ البداية بعد تاريخ النهاية');

        try {
            render(await window.api.getLoansReport({ sourceIds: ids, from, to }), ids, from, to);
        } catch (err) {
            console.error(err);
            showNote(errorEl, cleanError(err));
        }
    }

    form.addEventListener('submit', e => { e.preventDefault(); run(); });
    $('report-source-all').addEventListener('click', () => setAllChecked(sourcesList, true));
    $('report-source-none').addEventListener('click', () => setAllChecked(sourcesList, false));
    $('loans-report-print').addEventListener('click', printReport);
    excelBtn.addEventListener('click', () => exportReport(exportData));

    const fillLists = () => fillCheckList(sourcesList, App.lists.sources);
    const refresh = async () => { if (!result.classList.contains('hidden')) await run(); };

    App.registerPage('loansReport', { refresh, fillLists });
})();