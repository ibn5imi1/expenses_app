const modules = [
  require('./auth'), require('./accounts'), require('./lists'), require('./expenses'),
  require('./debts'), require('./loans'), require('./reports'), require('./files'),
  require('./backup'), require('./connectivity'),
];

function registerIpc() {
  modules.forEach(m => m.register());
}

module.exports = { registerIpc };