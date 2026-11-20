const { contextBridge, ipcRenderer } = require('electron');

const call = channel => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
    login: call('login'), logout: call('logout'), getSession: call('getSession'),

    changePassword: call('changePassword'),
    getAccountants: call('getAccountants'), addAccountant: call('addAccountant'),
    updateAccountant: call('updateAccountant'), deleteAccountant: call('deleteAccountant'),

    getDestinations: call('getDestinations'), addDestination: call('addDestination'),
    updateDestination: call('updateDestination'), deleteDestination: call('deleteDestination'),

    getSpenders: call('getSpenders'), addSpender: call('addSpender'),
    deleteSpender: call('deleteSpender'), getSpendersReport: call('getSpendersReport'),
    getSources: call('getSources'), addSource: call('addSource'), deleteSource: call('deleteSource'),

    getExpenses: call('getExpenses'), addExpense: call('addExpense'),
    updateExpense: call('updateExpense'), deleteExpense: call('deleteExpense'),

    getDebtsSummary: call('getDebtsSummary'), getDebtItems: call('getDebtItems'),
    getDebtsReport: call('getDebtsReport'), settleDebt: call('settleDebt'),

    getLoans: call('getLoans'), addLoan: call('addLoan'),
    updateLoan: call('updateLoan'), deleteLoan: call('deleteLoan'),

    getMonthCashReport: call('getMonthCashReport'), getMonthSummary: call('getMonthSummary'),
    getExpensesReport: call('getExpensesReport'), getLoansReport: call('getLoansReport'),

    exportReport: call('exportReport'), printPage: call('printPage'),
});