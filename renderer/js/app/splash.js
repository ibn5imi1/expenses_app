// start splash.js
// شاشة البداية: تبقى ظاهرة حتى يضغط المستخدم على أي صفحة في شريط التنقل.
// الاستخدام بعد الدخول: playSplash();   (لا تنتظرها بـ await)
(function () {
    const FADE_MS = 500;

    function navbarHeight() {
        const nav = document.querySelector('.navbar');
        return nav ? nav.getBoundingClientRect().bottom : 0;
    }

    window.playSplash = function playSplash() {
        let el = document.getElementById('splash');
        if (!el) return;

        // إعادة تشغيل الحركة من البداية
        const clone = el.cloneNode(true);
        el.replaceWith(clone);
        el = clone;

        el.classList.remove('hidden', 'fade-out');
        el.style.top = navbarHeight() + 'px';

        const nav = document.querySelector('.navbar');
        const onResize = () => { el.style.top = navbarHeight() + 'px'; };
        window.addEventListener('resize', onResize);

        // أي ضغطة داخل شريط التنقل (صفحة أو خروج) تُنهي الشاشة، وتنفذ الصفحة طلبها بعدها
        const close = () => {
            if (nav) nav.removeEventListener('click', close, true);
            window.removeEventListener('resize', onResize);
            el.classList.add('fade-out');
            setTimeout(() => el.classList.add('hidden'), FADE_MS);
        };
        if (nav) nav.addEventListener('click', close, true);
    };
})();
// end splash.js
