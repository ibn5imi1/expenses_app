const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const db = require('./db');
const { saveReport } = require('./export');

// مؤقتاً حتى نبني صفحة تسجيل الدخول
// المستخدم يحمله الجزء الخلفي، فلا تستطيع الواجهة انتحال اسم غيرها
let currentUser = 'mus';

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

  // جهات الصرف
  ipcMain.handle('getDestinations', () => db.getDestinations());
  ipcMain.handle('addDestination', (e, name) => db.addDestination(name));
  ipcMain.handle('updateDestination', (e, id, name) => db.updateDestination(id, name));
  ipcMain.handle('deleteDestination', (e, id) => db.deleteDestination(id));

  // المصروفات
  ipcMain.handle('getExpenses', () => db.getExpenses());
  ipcMain.handle('addExpense', (e, data) => db.addExpense(data, currentUser));
  ipcMain.handle('updateExpense', (e, id, data) => db.updateExpense(id, data, currentUser));
  ipcMain.handle('deleteExpense', (e, id) => db.deleteExpense(id));

  // أنواع السلف
  ipcMain.handle('getLoanTypes', () => db.getLoanTypes());
  ipcMain.handle('addLoanType', (e, name) => db.addLoanType(name));
  ipcMain.handle('updateLoanType', (e, id, name) => db.updateLoanType(id, name));
  ipcMain.handle('deleteLoanType', (e, id) => db.deleteLoanType(id));

  // السلف
  ipcMain.handle('getLoans', () => db.getLoans());
  ipcMain.handle('addLoan', (e, data) => db.addLoan(data, currentUser));
  ipcMain.handle('updateLoan', (e, id, data) => db.updateLoan(id, data, currentUser));
  ipcMain.handle('deleteLoan', (e, id) => db.deleteLoan(id));

  // القاصة
  ipcMain.handle('getCash', () => db.getCash());

  // الكشوفات
  ipcMain.handle('getExpensesReport', (e, filters) => db.getExpensesReport(filters));
  ipcMain.handle('getLoansReport', (e, filters) => db.getLoansReport(filters));

  ipcMain.handle('exportReport', async (e, report) => {
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
  ipcMain.handle('printPage', e => new Promise(resolve => {
    e.sender.print({ silent: false, printBackground: true }, (success, reason) => {
      resolve({ success, cancelled: !success && /cancel/i.test(String(reason)) });
    });
  }));

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});