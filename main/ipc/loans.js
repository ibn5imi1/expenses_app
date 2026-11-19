const db = require('../database');
const { handle, getSession } = require('../session');

function register() {
    handle('getLoans', () => db.getLoans());
    handle('addLoan', (e, data) => db.addLoan(data, getSession().displayName));
    handle('updateLoan', (e, id, data) => db.updateLoan(id, data, getSession().displayName));
    handle('deleteLoan', (e, id) => db.deleteLoan(id));
}

module.exports = { register };