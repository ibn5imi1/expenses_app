const { app, ipcMain } = require('electron');
const connectivity = require('../connectivity');

function register() {
    ipcMain.handle('getConnectivity', () => ({ online: connectivity.isOnline() }));

    ipcMain.handle('recheckConnectivity', async () => {
        await connectivity.checkNow({ fast: true });
        return { online: connectivity.isOnline() };
    });

    // الخروج متاح دائماً، حتى أثناء الانقطاع
    ipcMain.handle('quitApp', () => { app.quit(); });
}

module.exports = { register };