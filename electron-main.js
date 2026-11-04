const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const db = require("./db");

// مؤقتاً حتى نبني صفحة تسجيل الدخول
// المستخدم يحمله الجزء الخلفي، فلا تستطيع الواجهة انتحال اسم غيرها
let currentUser = "mus";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  db.init();

  ipcMain.handle("getDestinations", () => db.getDestinations());
  ipcMain.handle("getExpenses", () => db.getExpenses());
  ipcMain.handle("addExpense", (e, data) => db.addExpense(data, currentUser));
  ipcMain.handle("updateExpense", (e, id, data) =>
    db.updateExpense(id, data, currentUser),
  );
  ipcMain.handle("deleteExpense", (e, id) => db.deleteExpense(id));

  ipcMain.handle("getLoanTypes", () => db.getLoanTypes());
  ipcMain.handle("addLoanType", (e, name) => db.addLoanType(name));
  ipcMain.handle('updateLoanType', (e, id, name) => db.updateLoanType(id, name));
ipcMain.handle('deleteLoanType', (e, id) => db.deleteLoanType(id));
  ipcMain.handle("getLoans", () => db.getLoans());
  ipcMain.handle("addLoan", (e, data) => db.addLoan(data, currentUser));
  ipcMain.handle("updateLoan", (e, id, data) =>
    db.updateLoan(id, data, currentUser),
  );
  ipcMain.handle("deleteLoan", (e, id) => db.deleteLoan(id));

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
