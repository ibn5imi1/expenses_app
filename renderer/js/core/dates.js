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

    iconBtn.addEventListener('click', e => { e.stopPropagation(); picker.open(); });
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
const todayText = () => ` في تاريخ ${formatDate(toISO(new Date()))}`;

/* ---------- السنة والشهر ---------- */
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
    return { from: `${year}-${pad2(month)}-01`, to: `${year}-${pad2(month)}-${pad2(last)}` };
}