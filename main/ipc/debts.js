const db = require('../database');
const { handle, getSession } = require('../session');

function register() {
    handle('getDebtsSummary', () => db.getDebtsSummary());
    handle('getDebtItems', (e, destinationId) => db.getDebtItems(destinationId));
    handle('getDebtsReport', (e, ids) => db.getDebtsReport(ids));
    handle('settleDebt', (e, data) => db.settleDebt(data, getSession().displayName));
}

module.exports = { register };