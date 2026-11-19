// صفحة الخلاصة الشهرية
(() => {
    const form = $('summary-form');
    const yearInput = $('summary-year');
    const monthSelect = $('summary-month');
    const errorEl = $('summary-error');
    const body = $('summary-body');
    const excelBtn = $('summary-excel');

    initPeriodFields(yearInput, monthSelect);
    let exportData = null;

    function render(data, year, month) {
        const { from, to } = periodRange(year, month);
        const title = `الخلاصة — ${MONTHS[month - 1]} ${year}`;
        const subtitle = periodText(from, to);

        $('summary-title').textContent = title;
        $('summary-subtitle').textContent = subtitle;
        body.innerHTML = '';

        let count = 0;
        let expenses = 0;
        const rows = [];

        data.destinations.forEach(d => {
            count += d.expenses_count;
            expenses = round2(expenses + d.expenses_total);
            rows.push([d.name, d.expenses_count, d.expenses_total]);

            const tr = document.createElement('tr');
            tr.appendChild(createCell(d.name));
            tr.appendChild(createCell(String(d.expenses_count)));
            tr.appendChild(createMoneyCell(d.expenses_total));
            body.appendChild(tr);
        });

        const loans = round2(data.loansTotal);
        const difference = round2(expenses - loans);

        $('summary-total-count').textContent = String(count);
        $('summary-total-sum').textContent = formatMoney(expenses);
        $('summary-expenses').textContent = formatMoney(expenses);
        $('summary-loans').textContent = formatMoney(loans);
        $('summary-total').textContent = formatMoney(difference);

        $('summary-hint').textContent =
            difference > 0 ? `المصروفات أكثر من المقبوضات بمقدار ${formatMoney(difference)}`
                : difference < 0 ? `تبقى من المقبوضات ${formatMoney(Math.abs(difference))}`
                    : 'المصروفات تساوي المقبوضات';

        exportData = {
            title,
            subtitle,
            sheets: [{
                name: 'الخلاصة',
                columns: [
                    { header: 'الجهة المستفيدة', width: 36 },
                    { header: 'عدد المصروفات', width: 20 },
                    { header: 'المجموع', width: 22 },
                ],
                rows,
                total: ['إجمالي المصروفات', count, expenses],
                extraRows: [
                    ['مجموع المقبوضات', '', loans],
                    ['المجموع الكلي (المصروفات − المقبوضات)', '', difference],
                ],
                mergeTotal: false,
            }],
            fileName: `summary-${year}-${pad2(month)}.xlsx`,
        };
        excelBtn.disabled = false;
    }

    async function load() {
        const period = readPeriod(yearInput, monthSelect, errorEl);
        if (!period) return;
        try {
            render(await window.api.getMonthSummary(period), period.year, period.month);
        } catch (err) {
            console.error(err);
            showNote(errorEl, cleanError(err));
        }
    }

    form.addEventListener('submit', e => { e.preventDefault(); load(); });
    $('summary-print').addEventListener('click', printReport);
    excelBtn.addEventListener('click', () => exportReport(exportData));

    App.registerPage('summary', { refresh: load });
})();