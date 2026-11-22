const path = require('path');
const { app } = require('electron');
const { open } = require('./connection');
const { createTables, seed, migrate } = require('./schema');
const { syncCash } = require('./cash-sync');

function init() {
    open(path.join(app.getPath('userData'), 'college.db'));
    createTables();
    seed();
    migrate();
    syncCash();
}

// كل ما تحتاجه بقية البرنامج يُؤخذ من هنا: require('../database')
module.exports = {
    init,
    ...require('./lists'),
    ...require('./expenses'),
    ...require('./debts'),
    ...require('./loans'),
    ...require('./reports'),
    ...require('./users'),
    ...require('./backup'),
};