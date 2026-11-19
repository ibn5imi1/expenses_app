const db = require('../database');
const { handle, getSession } = require('../session');

function register() {
    handle('getExpenses', () => db.getExpenses());
    handle('addExpense', (e, data) => db.addExpense(data, getSession().displayName));
    handle('updateExpense', (e, id, data) => db.updateExpense(id, data, getSession().displayName));
    handle('deleteExpense', (e, id) => db.deleteExpense(id));
}

module.exports = { register };