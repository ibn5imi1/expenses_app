// الإعدادات: تغيير كلمة المرور
(() => {
    const MIN_PASSWORD = 6;
    const form = $('password-form');
    const oldInput = $('old-password');
    const newInput = $('new-password');
    const confirmInput = $('confirm-password');
    const errorEl = $('password-error');

    form.addEventListener('submit', async e => {
        e.preventDefault();
        hideNote(errorEl);

        const oldPassword = oldInput.value;
        const newPassword = newInput.value;
        let message = '';

        if (!oldPassword || !newPassword || !confirmInput.value) message = 'املأ جميع الحقول';
        else if (newPassword.length < MIN_PASSWORD) message = `كلمة المرور الجديدة يجب ألا تقل عن ${MIN_PASSWORD} أحرف`;
        else if (newPassword !== confirmInput.value) message = 'كلمة المرور الجديدة وتأكيدها غير متطابقتين';
        else if (newPassword === oldPassword) message = 'كلمة المرور الجديدة يجب أن تختلف عن الحالية';

        if (message) return showNote(errorEl, message);

        try {
            await window.api.changePassword(oldPassword, newPassword);
            form.reset();
            showToast('تم تغيير كلمة المرور');
        } catch (err) {
            console.error(err);
            showNote(errorEl, cleanError(err));
        }
    });

    App.registerPage('settings', {});
})();