const { app, BrowserWindow, net } = require('electron');

// عناوين فحص الاتصال (ترد بـ 204 بدون محتوى)، ويكفي أن يرد أحدها
const PROBES = [
    'https://www.gstatic.com/generate_204',
    'https://cp.cloudflare.com/generate_204',
];
const PROBE_TIMEOUT_MS = 4000;
const ONLINE_EVERY_MS = 10000;     // فحص دوري أثناء وجود الاتصال
const OFFLINE_EVERY_MS = 3000;     // فحص أسرع أثناء الانقطاع أو الشك
const FAILS_TO_GO_OFFLINE = 2;     // لا نعتبره منقطعاً إلا بعد فحصين فاشلين متتاليين

// يُطبَّق دائماً في النسخة المبنية. وفي التطوير يُطبَّق أيضاً إلا إذا ضبطت SKIP_ONLINE_CHECK=1
const enforced = () => app.isPackaged || String(process.env.SKIP_ONLINE_CHECK || '').trim() !== '1';

let online = true;
let failures = 0;
let running = null;

async function probeOne(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
        const doFetch = net.fetch ? net.fetch.bind(net) : fetch;   // net.fetch يحترم إعدادات البروكسي في ويندوز
        const res = await doFetch(url, { method: 'GET', cache: 'no-store', signal: ctrl.signal });
        return res.status === 204;
    } catch (err) {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

// أول عنوان يرد يكفي، فلا ننتظر العنوان البطيء
function probe() {
    return Promise.any(PROBES.map(async url => {
        if (!(await probeOne(url))) throw new Error('unreachable');
        return true;
    })).then(() => true, () => false);
}

function broadcast() {
    BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('connectivity', { online });
    });
}

function setOnline(value) {
    if (online === value) return;
    online = value;
    broadcast();
}

async function check() {
    if (!enforced()) return setOnline(true);

    if (await probe()) {
        failures = 0;
        setOnline(true);
    } else {
        failures += 1;
        if (failures >= FAILS_TO_GO_OFFLINE) setOnline(false);
    }
}

// fast: فشل واحد يكفي (عند وصول إشارة انقطاع من المتصفح)
function checkNow({ fast = false } = {}) {
    if (fast) failures = Math.max(failures, FAILS_TO_GO_OFFLINE - 1);
    if (!running) running = check().finally(() => { running = null; });
    return running;
}

function schedule() {
    const delay = online && failures === 0 ? ONLINE_EVERY_MS : OFFLINE_EVERY_MS;
    setTimeout(async () => {
        await checkNow();
        schedule();
    }, delay);
}

// أول فحص قبل فتح النافذة: إن كان الاتصال مقطوعاً تظهر نافذة الانتظار فوراً
async function start() {
    if (enforced()) await checkNow({ fast: true });
    schedule();
}

const isOnline = () => online;

module.exports = { start, checkNow, isOnline };