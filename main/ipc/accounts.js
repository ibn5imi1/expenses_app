const db = require('../database');
const { handle, getSession } = require('../session');

function register() {
    handle('changePassword', (e, oldPassword, newPassword) =>
        db.changePassword(getSession().id, oldPassword, newPassword));

    handle('getAccountants', () => db.getAccountants(), { admin: true });
    handle('addAccountant', (e, displayName, username, password) =>
        db.addAccountant(displayName, username, password), { admin: true });
    handle('updateAccountant', (e, id, displayName, username, password) =>
        db.updateAccountant(id, displayName, username, password), { admin: true });
    handle('deleteAccountant', (e, id) => db.deleteAccountant(id), { admin: true });
}

module.exports = { register };