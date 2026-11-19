// صفحة الجهات القائمة بالصرف: إضافة جهة + كشف شهري
(() => {
    const form = $('spn-form');
    const yearInput = $('spn-year');
    const monthSelect = $('spn-month');
    const errorEl = $('spn-error');
    const body = $('spn-body');
    const excelBtn = $('spn-excel');

    initPeriodFields(yearInput, monthSelect);
    let exportData = null;

    createAddBox({
        form: $('spn-add-form'),
        input: $('spn-add-name'),
        existing: () => App.lists.spenders,
        emptyMessage: 'اكتب اسم الجهة القائمة بالصرف',
        add: name => window.api.addSpender(name),
        onAdded: async (id, name) => {
            await App.refreshAll({ silent: true });
            showToast(`تمت إضافة الجهة القائمة بالصرف: ${name}`);
        },
    });

    function render(rows, year, month) {
        const { from, to } = periodRange(year, month);
        const title = `كشف الجهات القائمة بالصرف — ${MONTHS[month - 1]} ${year}`;
        const subtitle = periodText(from, to);

        $('spn-title').textContent = title;
        $('spn-subtitle').textContent = subtitle;
        body.innerHTML = '';

        let count = 0;
        let sum = 0;
        const excelRows = [];

        rows.forEach(r => {
            count += r.expenses_count;
            sum = round2(sum + r.expenses_total);
            excelRows.push([r.name, r.expenses_count, r.expenses_total]);

            const tr = document.createElement('tr');
            tr.appendChild(createCell(r.name));
            tr.appendChild(createCell(String(r.expenses_count)));
            tr.appendChild(createMoneyCell(r.expenses_total));
            body.appendChild(tr);
        });
        if (!rows.length) emptyRow(body, 'لا توجد جهات قائمة بالصرف، أضفها من الصندوق أعلاه', 3);

        $('spn-total-count').textContent = String(count);
        $('spn-total-sum').textContent = formatMoney(sum);

        exportData = {
            title,
            subtitle,
            fileName: `spenders-${year}-${pad2(month)}.xlsx`,
            columns: [
                { header: 'الجهة القائمة بالصرف', width: 40 },
                { header: 'عدد المصروفات', width: 20 },
                { header: 'مجموع المصروفات', width: 22 },
            ],
            rows: excelRows,
            total: ['المجموع', count, sum],
            mergeTotal: false,
        };
        excelBtn.disabled = !rows.length;
    }

    async function load() {
        const period = readPeriod(yearInput, monthSelect, errorEl);
        if (!period) return;
        try {
            render(await window.api.getSpendersReport(period), period.year, period.month);
        } catch (err) {
            console.error(err);
            showNote(errorEl, cleanError(err));
        }
    }

    form.addEventListener('submit', e => { e.preventDefault(); load(); });
    $('spn-print').addEventListener('click', printReport);
    excelBtn.addEventListener('click', () => exportReport(exportData));

    App.registerPage('spenders', { refresh: load });
})();