const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const db = require('./db');
const { saveReport } = require('./export');
const { RECOVERY_KEY_HASH } = require('./recovery');
// المستخدم المسجل دخوله: { id, username, role } أو null
// يحمله الجزء الخلفي فقط، فلا تستطيع الواجهة انتحال اسم أو صلاحية
let session = null;

// قفل مؤقت بعد محاولات دخول خاطئة
const failedLogins = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30 * 1000;

// كل العمليات تتطلب تسجيل الدخول، وعمليات الأدمن تتطلب صلاحية أدمن
function handle(channel, fn, { admin = false } = {}) {
    ipcMain.handle(channel, (event, ...args) => {
        if (!session) throw new Error('يجب تسجيل الدخول أولاً');
        if (admin && session.role !== 'admin') throw new Error('هذه العملية للأدمن فقط');
        return fn(event, ...args);
    });
}

// استرجاع كلمة مرور الأدمن من سطر الأوامر، بمفتاح يعرفه المبرمج فقط
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

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
    db.init();

        const resetArg = process.argv.find(a => a.startsWith('--reset-admin='));
    if (resetArg) {
        runAdminRecovery(resetArg);
        return;
    }

    /* ---------- الجلسة ---------- */
    ipcMain.handle('login', (e, username, password) => {
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
        session = user;
        return user;
    });

    ipcMain.handle('logout', () => {
        session = null;
    });

    ipcMain.handle('getSession', () => session);

    /* ---------- الإعدادات (لكل مستخدم) ---------- */
    handle('changePassword', (e, oldPassword, newPassword) =>
        db.changePassword(session.id, oldPassword, newPassword));

    /* ---------- الأدمن فقط ---------- */
    handle('getAccountants', () => db.getAccountants(), { admin: true });
        handle('addAccountant', (e, displayName, username, password) =>
        db.addAccountant(displayName, username, password), { admin: true });
    handle('resetPassword', (e, userId, password) => db.resetPassword(userId, password), { admin: true });
        handle('updateAccountant', (e, id, displayName, username, password) =>
        db.updateAccountant(id, displayName, username, password), { admin: true });
    handle('deleteAccountant', (e, id) => db.deleteAccountant(id), { admin: true });

    /* ---------- جهات الصرف ---------- */
    handle('getDestinations', () => db.getDestinations());
    handle('addDestination', (e, name) => db.addDestination(name));
    handle('updateDestination', (e, id, name) => db.updateDestination(id, name));
    handle('deleteDestination', (e, id) => db.deleteDestination(id));

    /* ---------- المصروفات ---------- */
    handle('getExpenses', () => db.getExpenses());
        handle('addExpense', (e, data) => db.addExpense(data, session.displayName));
    handle('updateExpense', (e, id, data) => db.updateExpense(id, data, session.displayName));
    handle('deleteExpense', (e, id) => db.deleteExpense(id));

    /* ---------- أنواع السلف ---------- */
    handle('getLoanTypes', () => db.getLoanTypes());
    handle('addLoanType', (e, name) => db.addLoanType(name));
    handle('updateLoanType', (e, id, name) => db.updateLoanType(id, name));
    handle('deleteLoanType', (e, id) => db.deleteLoanType(id));

    /* ---------- السلف ---------- */
    handle('getLoans', () => db.getLoans());
     handle('addLoan', (e, data) => db.addLoan(data, session.displayName));
    handle('updateLoan', (e, id, data) => db.updateLoan(id, data, session.displayName));
    handle('deleteLoan', (e, id) => db.deleteLoan(id));

    /* ---------- القاصة ---------- */
    handle('getCash', () => db.getCash());

    /* ---------- الكشوفات ---------- */
    handle('getExpensesReport', (e, filters) => db.getExpensesReport(filters));
    handle('getLoansReport', (e, filters) => db.getLoansReport(filters));

    handle('exportReport', async (e, report) => {
        const win = BrowserWindow.fromWebContents(e.sender);
        const result = await dialog.showSaveDialog(win, {
            title: 'حفظ الكشف',
            defaultPath: report.fileName,
            filters: [{ name: 'Excel', extensions: ['xlsx'] }],
        });
        if (result.canceled || !result.filePath) return { saved: false };

        await saveReport(report, result.filePath);
        return { saved: true, fileName: path.basename(result.filePath) };
    });

    // الطباعة عبر نافذة الطباعة، ونعرف منها هل تمت أم أُلغيت
    handle('printPage', e => new Promise(resolve => {
        e.sender.print({ silent: false, printBackground: true }, (success, reason) => {
            resolve({ success, cancelled: !success && /cancel/i.test(String(reason)) });
        });
    }));

    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});