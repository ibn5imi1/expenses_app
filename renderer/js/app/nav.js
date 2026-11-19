// التنقل بين الصفحات وتحديث البيانات
(() => {
    const navLinks = document.querySelectorAll('.nav-link[data-page]');
    const pages = document.querySelectorAll('.page');

    // اسم الصفحة في القائمة -> اسمها المسجّل في App.pages
    const PAGE_KEYS = { 'expenses-report': 'expensesReport', 'loans-report': 'loansReport' };

    function showPage(name) {
        if (name === 'admin' && (!App.user || App.user.role !== 'admin')) return;

        pages.forEach(page => page.classList.toggle('hidden', page.id !== `page-${name}`));
        navLinks.forEach(link => link.classList.toggle('active', link.dataset.page === name));

        // تحديث القوائم وبيانات الصفحة عند فتحها
        quiet(async () => {
            await loadLists();
            const page = App.pages[PAGE_KEYS[name] || name];
            if (page && page.refresh) await page.refresh();
        });
    }

    navLinks.forEach(link => link.addEventListener('click', () => showPage(link.dataset.page)));

    // التحديثات تُنفَّذ بالتتابع حتى لا تتداخل (مهم عند استخدام البرنامج من أكثر من حاسبة)
    let refreshQueue = Promise.resolve();

    async function doRefresh(silent) {
        try {
            await loadLists();
            await Promise.all(Object.values(App.pages).map(p => (p.refresh ? p.refresh() : null)));
            if (!silent) showToast('تم تحديث البيانات');
        } catch (err) {
            console.error(err);
            showProblem('تعذر تحديث البيانات');
        }
    }

    // silent: true بعد الإضافة والتعديل والحذف (تحديث بدون رسالة)
    function refreshAll({ silent = false } = {}) {
        refreshQueue = refreshQueue.then(() => doRefresh(silent));
        return refreshQueue;
    }

    $('refresh-btn').addEventListener('click', () => refreshAll());

    App.showPage = showPage;
    App.refreshAll = refreshAll;
})();