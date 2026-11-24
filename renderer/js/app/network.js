// مراقبة الاتصال بالإنترنت: عند الانقطاع تظهر نافذة انتظار تمنع استخدام البرنامج،
// وتختفي تلقائياً عند عودته دون إعادة تحميل (فلا تضيع النماذج المفتوحة)
(() => {
    const overlay = $('net-overlay');
    const appShell = $('app');
    const loginScreen = $('login-screen');

    function apply(online) {
        overlay.classList.toggle('hidden', online);
        // inert يمنع التنقل والكتابة بلوحة المفاتيح خلف النافذة
        appShell.inert = !online;
        loginScreen.inert = !online;
    }

    window.api.onConnectivity(state => apply(state.online));
    window.api.getConnectivity().then(state => apply(state.online)).catch(() => { });

    // أحداث المتصفح تُسرّع الفحص فقط، والقرار النهائي من الفحص الحقيقي في الجزء الخلفي
    window.addEventListener('online', () => window.api.recheckConnectivity());
    window.addEventListener('offline', () => window.api.recheckConnectivity());

    $('net-quit').addEventListener('click', () => window.api.quitApp());
})();