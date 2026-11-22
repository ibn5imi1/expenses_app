const { app, dialog } = require('electron');
const db = require('./database');
const { RECOVERY_KEY_HASH } = require('../recovery');

// قيمة وسيط من سطر الأوامر: --name=value
const argValue = name => {
    const found = process.argv.find(a => a.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : '';
};

// npm start -- --reset-admin=NewPass123 --recovery-key=المفتاح [--admin-username=admin]
function runAdminRecovery(resetArg) {
    const newPassword = resetArg.slice('--reset-admin='.length);

    let message;
    try {
        const result = db.recoverAdmin(
            argValue('recovery-key'),
            newPassword,
            RECOVERY_KEY_HASH,
            argValue('admin-username'),
        );
        message =
            'تم تعيين كلمة مرور جديدة للأدمن.\n\n' +
            `اسم المستخدم: ${result.usernames.join(' ، ')}\n` +
            'شغّل البرنامج وادخل باسم المستخدم هذا وكلمة المرور الجديدة.';
    } catch (err) {
        message = err.message;
    }

    dialog.showMessageBoxSync({ type: 'info', title: 'استرجاع كلمة مرور الأدمن', message });
    app.quit();
}

module.exports = { runAdminRecovery };