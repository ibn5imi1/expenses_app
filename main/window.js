const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1366,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, '..', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: !app.isPackaged,   // أدوات المطوّر تُعطَّل في النسخة المبنية
        },
    });

    win.setMenu(null);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e, url) => {
        if (url !== win.webContents.getURL()) e.preventDefault();
    });
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

module.exports = { createWindow };