const db = require('../database');
const { handle } = require('../session');

function register() {
    handle('getMonthCashReport', (e, f) => db.getMonthCashReport(f));
    handle('getMonthSummary', (e, f) => db.getMonthSummary(f));
    handle('getSpendersReport', (e, f) => db.getSpendersReport(f));
    handle('getExpensesReport', (e, f) => db.getExpensesReport(f));
    handle('getLoansReport', (e, f) => db.getLoansReport(f));
}

module.exports = { register };