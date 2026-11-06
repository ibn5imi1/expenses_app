const ExcelJS = require('exceljs');

const GREEN = 'FF1F5C4D';
const LIGHT = 'FFF4F7F5';
const EDGE = { style: 'thin', color: { argb: 'FFD9E0DB' } };
const BORDERS = { top: EDGE, left: EDGE, bottom: EDGE, right: EDGE };

// report = { title, subtitle, columns: [{header, width}], rows: [[...]], total: [...] }
async function saveReport(report, filePath) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الكشف', { views: [{ rightToLeft: true }] });
    const colCount = report.columns.length;

    report.columns.forEach((c, i) => {
        ws.getColumn(i + 1).width = c.width;
    });
    const totalWidth = report.columns.reduce((s, c) => s + c.width, 0);
    const titleLines = Math.max(1, Math.ceil(report.title.length / (totalWidth * 0.7)));

    // العنوان والفترة
    ws.mergeCells(1, 1, 1, colCount);
    const title = ws.getCell(1, 1);
    title.value = report.title;
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getRow(1).height = 24 * titleLines;

    ws.mergeCells(2, 1, 2, colCount);
    const sub = ws.getCell(2, 1);
    sub.value = report.subtitle;
    sub.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getRow(2).height = 32;

    // رأس الجدول
    const headerRow = ws.getRow(4);
    report.columns.forEach((c, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = c.header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = BORDERS;
    });

    const writeRow = (rowNumber, values, isTotal) => {
        const row = ws.getRow(rowNumber);
        values.forEach((v, i) => {
            const cell = row.getCell(i + 1);
            cell.value = v;
            cell.border = BORDERS;
            cell.alignment = {
                vertical: 'top',
                wrapText: true,                      // النص الطويل ينزل لسطر جديد
                horizontal: typeof v === 'number' ? 'center' : 'right',
            };
            if (typeof v === 'number') cell.numFmt = '#,##0';
            if (isTotal) {
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
            }
        });
    };

    report.rows.forEach((values, i) => writeRow(5 + i, values, false));
    const totalRowNumber = 5 + report.rows.length;
    writeRow(totalRowNumber, report.total, true);
    if (colCount > 2) ws.mergeCells(totalRowNumber, 2, totalRowNumber, colCount);

    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    await wb.xlsx.writeFile(filePath);
}

module.exports = { saveReport };