// صفحة الديون: كشف الديون (ملخص وتفصيلي) وتسديد الديون
(() => {
    const tabList = $('debts-tab-list');
    const tabPay = $('debts-tab-pay');
    const viewList = $('debts-view-list');
    const viewPay = $('debts-view-pay');

    // ملخص الديون
    const summaryBody = $('debts-body');
    const summaryTotal = $('debts-total');
    const summarySubtitle = $('debts-subtitle');
    const summaryExcelBtn = $('debts-excel');

    // كشف الديون حسب الجهة
    const reportForm = $('debts-report-form');
    const reportCreditors = $('debts-report-creditors');
    const reportError = $('debts-report-error');
    const reportResult = $('debts-report-result');
    const reportBody = $('debts-report-body');
    const reportExcelBtn = $('debts-report-excel');

    // تسديد الديون
    const creditorSelect = $('debt-creditor');
    const itemsCard = $('debt-items-card');
    const itemsBody = $('debt-items-body');
    const itemsExcelBtn = $('debt-items-excel');
    const payForm = $('debt-pay-form');
    const payAmount = $('debt-pay-amount');
    const payDate = $('debt-pay-date');
    const payError = $('debt-pay-error');

    attachAmountFormat(payAmount);
    const payPicker = createDatePicker(payDate);

    let creditors = [];     // [{ id, name, total }]
    let paying = null;      // القيد الذي يجري تسديده
    let summaryExport = null;
    let reportExport = null;
    let itemsExport = null;

    function showView(view) {
        const isPay = view === 'pay';
        viewList.classList.toggle('hidden', isPay);
        viewPay.classList.toggle('hidden', !isPay);
        tabList.classList.toggle('btn-light', isPay);
        tabPay.classList.toggle('btn-light', !isPay);
    }
    tabList.addEventListener('click', () => showView('list'));
    tabPay.addEventListener('click', () => showView('pay'));

    /* ---------- ملخص الديون ---------- */
    function renderSummary() {
        summaryBody.innerHTML = '';
        let total = 0;

        creditors.forEach(c => {
            total = round2(total + c.total);
            const tr = document.createElement('tr');
            tr.appendChild(createCell(c.name));
            tr.appendChild(createMoneyCell(c.total));
            summaryBody.appendChild(tr);
        });
        if (!creditors.length) emptyRow(summaryBody, 'لا توجد ديون', 2);

        summaryTotal.textContent = formatMoney(total);
        summarySubtitle.textContent = todayText();

        summaryExport = {
            title: 'كشف الديون',
            subtitle: todayText(),
            fileName: `debts-${toISO(new Date())}.xlsx`,
            columns: [{ header: 'الجهة الدائنة', width: 40 }, { header: 'مجموع الديون', width: 24 }],
            rows: creditors.map(c => [c.name, c.total]),
            total: ['المجموع', total],
            mergeTotal: false,
        };
        summaryExcelBtn.disabled = !creditors.length;

        fillCheckList(reportCreditors, creditors);
        fillSelect(creditorSelect, creditors, 'اختر الجهة الدائنة');
    }

    /* ---------- كشف الديون حسب الجهة ---------- */
    function renderReport(items, ids) {
        const allSelected = ids.length === creditors.length;
        const names = creditors.filter(c => ids.includes(c.id)).map(c => c.name).join('، ');
        const title = allSelected ? 'كشف الديون — كل الجهات' : `كشف الديون — ${names}`;
        const total = round2(items.reduce((s, i) => s + i.remaining, 0));

        $('debts-report-title').textContent = title;
        $('debts-report-subtitle').textContent = todayText();
        reportBody.innerHTML = '';
        if (!items.length) emptyRow(reportBody, 'لا توجد ديون للجهات المختارة', 9);

        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.title = auditTitle(item);
            tr.appendChild(createCell(item.destination));
            tr.appendChild(createCell(item.receipt_no || '—'));
            tr.appendChild(createCell(formatMoney(item.amount), 'num-cell'));
            tr.appendChild(createCell(formatMoney(item.paid), 'num-cell'));
            tr.appendChild(createCell(formatMoney(item.remaining), 'num-cell negative'));
            tr.appendChild(createDateCell(item.date));
            tr.appendChild(createCell(item.details, 'details-cell'));
            tr.appendChild(createTagCell(item.spender, 'spender'));
            tr.appendChild(createCell(accountantOf(item)));
            reportBody.appendChild(tr);
        });
        $('debts-report-total').textContent = formatMoney(total);

        reportExport = {
            title,
            subtitle: todayText(),
            fileName: `debts-report-${toISO(new Date())}.xlsx`,
            columns: [
                { header: 'الجهة الدائنة', width: 22 }, { header: 'رقم الوصل', width: 14 },
                { header: 'المبلغ الكلي', width: 16 }, { header: 'المدفوع نقداً', width: 16 },
                { header: 'المتبقي', width: 16 }, { header: 'التاريخ', width: 14 },
                { header: 'التفاصيل', width: 50 }, { header: 'الجهة القائمة بالصرف', width: 24 },
                { header: 'المحاسب', width: 18 },
            ],
            rows: items.map(i => [
                i.destination, i.receipt_no || '', i.amount, i.paid, i.remaining,
                formatDate(i.date), i.details, i.spender || '—', accountantOf(i),
            ]),
            total: ['المجموع', '', '', '', total, '', '', '', ''],
            mergeTotal: false,
        };
        reportExcelBtn.disabled = !items.length;
        reportResult.classList.remove('hidden');
    }

    async function runReport() {
        hideNote(reportError);
        const ids = getCheckedIds(reportCreditors);
        if (!ids.length) return showNote(reportError, 'اختر جهة دائنة واحدة على الأقل');

        try {
            renderReport(await window.api.getDebtsReport(ids), ids);
        } catch (err) {
            console.error(err);
            showNote(reportError, cleanError(err));
        }
    }

    reportForm.addEventListener('submit', e => { e.preventDefault(); runReport(); });
    $('debts-report-all').addEventListener('click', () => setAllChecked(reportCreditors, true));
    $('debts-report-none').addEventListener('click', () => setAllChecked(reportCreditors, false));

    /* ---------- تسديد الديون ---------- */
    function cancelPayment() {
        paying = null;
        payForm.classList.add('hidden');
        payError.classList.add('hidden');
        payAmount.classList.remove('invalid');
    }

    function startPayment(item) {
        paying = item;
        const receipt = item.receipt_no ? `وصل رقم ${item.receipt_no} — ` : '';
        $('debt-pay-info').textContent = `${receipt}${item.details} — المتبقي ${formatMoney(item.remaining)}`;
        payAmount.value = formatAmount(item.remaining);
        payPicker.setDate(new Date());
        payError.classList.add('hidden');
        payForm.classList.remove('hidden');
        payForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        payAmount.focus();
        payAmount.select();
    }

    async function loadItems() {
        const id = Number(creditorSelect.value);
        itemsBody.innerHTML = '';

        if (!id) {
            cancelPayment();
            itemsExport = null;
            itemsCard.classList.add('hidden');
            return;
        }

        const items = await window.api.getDebtItems(id);
        const creditor = creditors.find(c => c.id === id);
        const name = creditor ? creditor.name : '';
        const title = `الصرفيات التي بها متبقي — ${name}`;
        $('debt-items-title').textContent = title;
        $('debt-items-subtitle').textContent = todayText();

        // إن تغيّر القيد الذي نسدده (حُدّث من حاسبة أخرى) نلغي نموذج التسديد
        if (paying && !items.some(i => i.id === paying.id)) cancelPayment();

        let total = 0;
        items.forEach(item => {
            total = round2(total + item.remaining);

            const tr = document.createElement('tr');
            tr.title = auditTitle(item);
            tr.appendChild(createCell(item.receipt_no || '—'));
            tr.appendChild(createCell(formatMoney(item.amount), 'num-cell'));
            tr.appendChild(createCell(formatMoney(item.paid), 'num-cell'));
            tr.appendChild(createCell(formatMoney(item.remaining), 'num-cell negative'));
            tr.appendChild(createDateCell(item.date));
            tr.appendChild(createCell(item.details, 'details-cell'));
            tr.appendChild(createTagCell(item.spender, 'spender'));
            tr.appendChild(createCell(accountantOf(item)));

            const td = document.createElement('td');
            td.className = 'actions-cell noprint';   // زر التسديد لا يُطبع
            const box = document.createElement('div');
            box.className = 'row-actions';
            box.appendChild(createButton('تسديد', 'btn btn-small', () => startPayment(item)));
            td.appendChild(box);
            tr.appendChild(td);
            itemsBody.appendChild(tr);
        });
        if (!items.length) emptyRow(itemsBody, 'لا توجد صرفيات بها متبقي لهذه الجهة', 9);
        $('debt-items-total').textContent = formatMoney(total);

        itemsExport = {
            title,
            subtitle: todayText(),
            fileName: `debts-${name.replace(/[\\/:*?"<>|]/g, '_')}-${toISO(new Date())}.xlsx`,
            columns: [
                { header: 'رقم الوصل', width: 14 }, { header: 'المبلغ الكلي', width: 16 },
                { header: 'المدفوع نقداً', width: 16 }, { header: 'المتبقي', width: 16 },
                { header: 'التاريخ', width: 14 }, { header: 'التفاصيل', width: 50 },
                { header: 'الجهة القائمة بالصرف', width: 24 }, { header: 'المحاسب', width: 18 },
            ],
            rows: items.map(i => [
                i.receipt_no || '', i.amount, i.paid, i.remaining, formatDate(i.date),
                i.details, i.spender || '—', accountantOf(i),
            ]),
            total: ['المجموع', '', '', total, '', '', '', ''],
            mergeTotal: false,
        };
        itemsExcelBtn.disabled = !items.length;
        itemsCard.classList.remove('hidden');
    }

    creditorSelect.addEventListener('change', () => { cancelPayment(); quiet(loadItems); });
    payForm.addEventListener('input', e => e.target.classList.remove('invalid'));
    $('debt-pay-cancel').addEventListener('click', cancelPayment);

    payForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!paying) return;

        const amount = parseAmount(payAmount.value);
        let message = '';
        if (!(amount > 0)) message = 'أدخل مبلغ التسديد';
        else if (amount > paying.remaining) message = `مبلغ التسديد أكبر من المتبقي (${formatMoney(paying.remaining)})`;
        else if (!payDate.value) message = 'اختر تاريخ التسديد';

        if (message) {
            payAmount.classList.add('invalid');
            payError.textContent = message;
            payError.classList.remove('hidden');
            showProblem(message);
            return;
        }

        try {
            await window.api.settleDebt({ expenseId: paying.id, amount, date: payDate.value });
            cancelPayment();
            await App.refreshAll({ silent: true });   // يظهر التسديد في المصروفات وتتحدث القاصة
        } catch (err) {
            console.error(err);
            payError.textContent = cleanError(err);
            payError.classList.remove('hidden');
            showProblem(cleanError(err));
        }
    });

    /* ---------- الطباعة والتصدير ---------- */
    $('debts-print').addEventListener('click', printReport);
    $('debt-items-print').addEventListener('click', printReport);
    $('debts-report-print').addEventListener('click', printReport);
    summaryExcelBtn.addEventListener('click', () => exportReport(summaryExport));
    itemsExcelBtn.addEventListener('click', () => exportReport(itemsExport));
    reportExcelBtn.addEventListener('click', () => exportReport(reportExport));

    async function load() {
        creditors = await window.api.getDebtsSummary();
        renderSummary();
        await loadItems();
        if (!reportResult.classList.contains('hidden')) await runReport();
    }

    App.registerPage('debts', { refresh: load });
})();