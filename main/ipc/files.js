const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const { handle } = require('../session');
const { saveReport } = require('../export/excel');

function register() {
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

    // الطباعة بالعرض لتتسع الأعمدة، ونعرف هل تمت أم أُلغيت
    handle('printPage', e => new Promise(resolve => {
        e.sender.print(
            { silent: false, printBackground: true, landscape: true },
            (success, reason) => resolve({ success, cancelled: !success && /cancel/i.test(String(reason)) }),
        );
    }));
}

module.exports = { register };