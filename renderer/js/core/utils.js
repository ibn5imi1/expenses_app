// أدوات عامة مشتركة
const $ = id => document.getElementById(id);
const round2 = n => Math.round(n * 100) / 100;
const pad2 = n => String(n).padStart(2, '0');
const formatMoney = n => round2(n).toLocaleString('en-US');

// تشغيل دالة غير متزامنة دون إسقاط التطبيق إن فشلت
const quiet = fn => fn().catch(err => console.error(err));

// رسالة الخطأ الأصلية بدون مقدمة Electron
const cleanError = err => String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function showNote(el, text) { el.textContent = text; el.className = 'form-error noprint'; }
function hideNote(el) { el.className = 'hidden'; }

/* ---------- رسالة التنبيه (تظهر وتختفي وحدها) ---------- */
const toastEl = $('toast');
let toastTimer = null;
const LONG_TOAST = 6000;   // مدة تنبيه المشكلة (6 ثوان)

function showToast(message, isError = false, duration = 3000) {
    toastEl.textContent = message;
    toastEl.classList.toggle('toast-error', isError);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}
const showProblem = message => showToast(message, true, LONG_TOAST);

async function exportReport(report) {
    if (!report) return;
    try {
        const result = await window.api.exportReport(report);
        if (result.saved) showToast(`تم تصدير ملف Excel: ${result.fileName}`);
    } catch (err) {
        console.error(err);
        showProblem('تعذر حفظ الملف، تأكد أنه غير مفتوح في Excel');
    }
}

async function printReport() {
    try {
        const result = await window.api.printPage();
        if (result.success) showToast('تمت الطباعة');
        else if (!result.cancelled) showProblem('تعذرت الطباعة');
    } catch (err) {
        console.error(err);
        showProblem('تعذرت الطباعة');
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

// حقل التفاصيل يكبر مع الكتابة
function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

/* ---------- لودر العمليات الطويلة (جارٍ التصدير / جارٍ الاستيراد) ---------- */
const loaderEl = $('loader');
const loaderText = $('loader-text');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function showLoader(text) {
    loaderText.textContent = text;
    loaderEl.classList.remove('hidden');
}

function hideLoader() {
    loaderEl.classList.add('hidden');
}

// يشغّل عملية مع لودر، ويبقيه ظاهراً 0.7 ثانية على الأقل حتى يُرى حتى لو كانت العملية سريعة
async function withLoader(text, task) {
    showLoader(text);
    await nextFrame();   // ننتظر أن يُرسم اللودر قبل بدء العمل
    try {
        const [result] = await Promise.all([task(), sleep(700)]);
        return result;
    } finally {
        hideLoader();
    }
}