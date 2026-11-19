// نقطة البداية: قاعدة البيانات ثم القنوات ثم النافذة
const { app, dialog, session } = require('electron');
const db = require('./main/database');
const { registerIpc } = require('./main/ipc');
const { createWindow } = require('./main/window');
const { runAdminRecovery } = require('./main/admin-recovery');

app.whenReady().then(() => {
    try {
        db.init();
    } catch (err) {
        console.error(err);
        dialog.showErrorBox('تعذر فتح قاعدة البيانات', String(err.stack || err));
        app.quit();
        return;
    }

    const resetArg = process.argv.find(a => a.startsWith('--reset-admin='));
    if (resetArg) return runAdminRecovery(resetArg);

    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(false));
    registerIpc();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});