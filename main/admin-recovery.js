const { app, dialog } = require('electron');
const db = require('./database');
const { RECOVERY_KEY_HASH } = require('../recovery');

// npm start -- --reset-admin=NewPass123 --recovery-key=المفتاح
function runAdminRecovery(resetArg) {
    const newPassword = resetArg.slice('--reset-admin='.length);
    const keyArg = process.argv.find(a => a.startsWith('--recovery-key='));
    const key = keyArg ? keyArg.slice('--recovery-key='.length) : '';

    let message;
    try {
        db.recoverAdmin(key, newPassword, RECOVERY_KEY_HASH);
        message = 'تم تعيين كلمة مرور جديدة للأدمن. شغّل البرنامج وادخل بها.';
    } catch (err) {
        message = err.message;
    }
    dialog.showMessageBoxSync({ type: 'info', title: 'استرجاع كلمة مرور الأدمن', message });
    app.quit();
}

module.exports = { runAdminRecovery };