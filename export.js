const ExcelJS = require('exceljs');

const GREEN = 'FF1F5C4D';
const LIGHT = 'FFF4F7F5';
const EDGE = { style: 'thin', color: { argb: 'FFD9E0DB' } };
const BORDERS = { top: EDGE, left: EDGE, bottom: EDGE, right: EDGE };

// ورقة واحدة: spec = { name, columns: [{header, width}], rows: [[...]], total: [...], mergeTotal, extraRows }
function writeSheet(wb, spec, title, subtitle) {
    // الرأس مثبّت عند التمرير، والورقة من اليمين لليسار
    const ws = wb.addWorksheet(spec.name || 'الكشف', {
        views: [{ rightToLeft: true, state: 'frozen', ySplit: 4 }],
    });
    const colCount = spec.columns.length;

    spec.columns.forEach((c, i) => {
        ws.getColumn(i + 1).width = c.width;
    });
    const totalWidth = spec.columns.reduce((s, c) => s + c.width, 0);
    const titleLines = Math.max(1, Math.ceil(title.length / (totalWidth * 0.7)));

    // العنوان والفترة
    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getRow(1).height = 24 * titleLines;

    ws.mergeCells(2, 1, 2, colCount);
    const subCell = ws.getCell(2, 1);
    subCell.value = subtitle;
    subCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getRow(2).height = 32;

    // رأس الجدول
    const headerRow = ws.getRow(4);
    spec.columns.forEach((c, i) => {
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

    spec.rows.forEach((values, i) => writeRow(5 + i, values, false));

    // سهم الفلترة على رأس كل عمود (يشمل الصفوف فقط، وليس صف الإجمالي)
    ws.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4 + Math.max(spec.rows.length, 1), column: colCount },
    };

    // صف فارغ يفصل الإجمالي عن البيانات، حتى لا يدخل في الفلترة والترتيب
    const totalRowNumber = 5 + spec.rows.length + 1;
    writeRow(totalRowNumber, spec.total, true);
    if (spec.mergeTotal !== false && colCount > 2) {
        ws.mergeCells(totalRowNumber, 2, totalRowNumber, colCount);
    }

    // أسطر إضافية تحت الإجمالي (مثل مجموع المقبوضات في الخلاصة)
    (spec.extraRows || []).forEach((values, i) => writeRow(totalRowNumber + 1 + i, values, true));

    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

// report = { title, subtitle, columns, rows, total, mergeTotal, extraRows }
// أو report = { title, subtitle, sheets: [spec, spec] } لملف بأكثر من ورقة
async function saveReport(report, filePath) {
    const wb = new ExcelJS.Workbook();

    const sheets = report.sheets || [{
        name: 'الكشف',
        columns: report.columns,
        rows: report.rows,
        total: report.total,
        mergeTotal: report.mergeTotal,
        extraRows: report.extraRows,
    }];

    sheets.forEach(spec => writeSheet(wb, spec, report.title, report.subtitle));

    await wb.xlsx.writeFile(filePath);
}

module.exports = { saveReport };