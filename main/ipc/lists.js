const db = require('../database');
const { handle } = require('../session');

function register() {
    // الجهات المستفيدة
    handle('getDestinations', () => db.getDestinations());
    handle('addDestination', (e, name) => db.addDestination(name));
    handle('updateDestination', (e, id, name) => db.updateDestination(id, name));
    handle('deleteDestination', (e, id) => db.deleteDestination(id));

    // الجهات القائمة بالصرف
    handle('getSpenders', () => db.getSpenders());
    handle('addSpender', (e, name) => db.addSpender(name));

    // المصادر
    handle('getSources', () => db.getSources());
    handle('addSource', (e, name) => db.addSource(name));
}

module.exports = { register };