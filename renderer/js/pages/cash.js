// صفحة القاصة: كشف شهري حسب المصدر
(() => {
    const form = $('cash-form');
    const yearInput = $('cash-year');
    const monthSelect = $('cash-month');
    const errorEl = $('cash-error');
    const body = $('cash-body');
    const totalLoans = $('cash-total-loans');
    const totalSpent = $('cash-total-spent');
    const totalRemaining = $('cash-total-remaining');
    const excelBtn = $('cash-excel');

    initPeriodFields(yearInput, monthSelect);
    let exportData = null;

    function setRemaining(cell, value) {
        cell.textContent = formatMoney(value);
        cell.classList.toggle('negative', value < 0);
    }

    function render(data, year, month) {
        const { from, to } = periodRange(year, month);
        const title = `القاصة — ${MONTHS[month - 1]} ${year}`;
        const subtitle = periodText(from, to);

        $('cash-title').textContent = title;
        $('cash-subtitle').textContent = subtitle;
        $('cash-hint').textContent =
            'المصروف منها = المدفوع نقداً من الصرفيات المستقطعة من المصدر. عند انتهاء الشهر يُصفَّر المتبقي لكل مصدر، وتُعدَّل مقبوضاته لتساوي ما صُرف منه فعلاً.';

        body.innerHTML = '';
        let loans = 0;
        let spent = 0;
        const rows = [];

        data.bySource.forEach(r => {
            const remaining = round2(r.loans_total - r.spent_total);
            loans = round2(loans + r.loans_total);
            spent = round2(spent + r.spent_total);
            rows.push([r.name, r.loans_total, r.spent_total, remaining]);

            const tr = document.createElement('tr');
            tr.appendChild(createCell(r.name));
            tr.appendChild(createMoneyCell(r.loans_total));
            tr.appendChild(createMoneyCell(r.spent_total));
            tr.appendChild(createMoneyCell(remaining));
            body.appendChild(tr);
        });
        if (!data.bySource.length) emptyRow(body, 'لا توجد حركات في هذا الشهر', 4);

        const remainingAll = round2(loans - spent);
        totalLoans.textContent = formatMoney(loans);
        totalSpent.textContent = formatMoney(spent);
        setRemaining(totalRemaining, remainingAll);

        exportData = {
            title,
            subtitle,
            fileName: `cash-${year}-${pad2(month)}.xlsx`,
            columns: [
                { header: 'المصدر', width: 40 }, { header: 'صافي المقبوضات', width: 20 },
                { header: 'المصروف منها', width: 20 }, { header: 'المتبقي', width: 20 },
            ],
            rows,
            total: ['المجموع', loans, spent, remainingAll],
            mergeTotal: false,
        };
        excelBtn.disabled = false;
    }

    async function load() {
        const period = readPeriod(yearInput, monthSelect, errorEl);
        if (!period) return;
        try {
            render(await window.api.getMonthCashReport(period), period.year, period.month);
        } catch (err) {
            console.error(err);
            showNote(errorEl, cleanError(err));
        }
    }

    form.addEventListener('submit', e => { e.preventDefault(); load(); });
    $('cash-print').addEventListener('click', printReport);
    excelBtn.addEventListener('click', () => exportReport(exportData));

    App.registerPage('cash', { refresh: load });
})();