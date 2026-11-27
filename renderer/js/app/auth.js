// start auth.js
// تسجيل الدخول والخروج وأيقونة إظهار كلمة المرور
(() => {
    const EYE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const EYE_OFF_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    function addPasswordToggle(input) {
        const wrap = document.createElement('div');
        wrap.className = 'password-wrap';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'password-toggle';
        btn.setAttribute('aria-label', 'إظهار كلمة المرور');
        btn.innerHTML = EYE_ICON;
        btn.addEventListener('click', () => {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.innerHTML = show ? EYE_OFF_ICON : EYE_ICON;
            btn.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
        });
        wrap.appendChild(btn);
    }
    document.querySelectorAll('input[type="password"]').forEach(addPasswordToggle);

    const loginScreen = $('login-screen');
    const appShell = $('app');
    const usernameInput = $('login-username');
    const passwordInput = $('login-password');
    const errorEl = $('login-error');
    const submitBtn = $('login-submit');
    const adminLink = document.querySelector('.admin-only');

    function showLogin() {
        appShell.classList.add('hidden');
        loginScreen.classList.remove('hidden');
        usernameInput.focus();
    }

    function enterApp(user) {
        App.user = user;
        $('current-user').textContent = user.displayName || user.username;
        adminLink.classList.toggle('hidden', user.role !== 'admin');

        loginScreen.classList.add('hidden');
        appShell.classList.remove('hidden');
        App.showPage('expenses');

        // شاشة البداية: تبقى حتى يضغط المستخدم على صفحة في شريط التنقل
        if (window.playSplash) playSplash();
    }

    $('login-form').addEventListener('submit', async e => {
        e.preventDefault();
        hideNote(errorEl);

        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        if (!username || !password) return showNote(errorEl, 'أدخل اسم المستخدم وكلمة المرور');

        submitBtn.disabled = true;
        try {
            const user = await window.api.login(username, password);
            passwordInput.value = '';
            enterApp(user);
        } catch (err) {
            console.error(err);
            showNote(errorEl, cleanError(err));
            passwordInput.select();
        } finally {
            submitBtn.disabled = false;
        }
    });

    // الخروج: نعيد تحميل الصفحة لتنظيف كل شيء، فتظهر شاشة الدخول
    $('logout-btn').addEventListener('click', async () => {
        await window.api.logout();
        location.reload();
    });

    App.enterApp = enterApp;
    App.showLogin = showLogin;
})();
// end auth.js