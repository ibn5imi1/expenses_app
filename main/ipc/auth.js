const { ipcMain } = require('electron');
const db = require('../database');
const connectivity = require('../connectivity');
const { getSession, setSession } = require('../session');

// قفل مؤقت بعد محاولات دخول خاطئة
const failedLogins = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30 * 1000;

function register() {
    ipcMain.handle('login', (e, username, password) => {
        if (!connectivity.isOnline()) throw new Error('لا يوجد اتصال بالإنترنت');

        const key = String(username || '').trim().toLowerCase();
        const record = failedLogins.get(key) || { count: 0, lockedUntil: 0 };

        if (record.lockedUntil > Date.now()) {
            throw new Error('محاولات كثيرة، انتظر نصف دقيقة ثم حاول مرة أخرى');
        }

        const user = db.login(username, password);
        if (!user) {
            record.count += 1;
            if (record.count >= MAX_ATTEMPTS) {
                record.count = 0;
                record.lockedUntil = Date.now() + LOCK_MS;
            }
            failedLogins.set(key, record);
            throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
        }

        failedLogins.delete(key);
        setSession(user);
        return user;
    });

    ipcMain.handle('logout', () => { setSession(null); });
    ipcMain.handle('getSession', () => getSession());
}

module.exports = { register };