// التشغيل الأولي (يجب أن يكون آخر ملف يُحمَّل)
(async () => {
    try {
        const user = await window.api.getSession();   // بقاء الجلسة عند إعادة تحميل النافذة
        if (user) App.enterApp(user);
        else App.showLogin();
    } catch (err) {
        console.error(err);
        App.showLogin();
    }
})();