// start preload.js

const { contextBridge, ipcRenderer } = require('electron');

const call = channel => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
    // الجلسة
    login: call('login'),
    logout: call('logout'),
    getSession: call('getSession'),

    // الإعدادات والأدمن
    changePassword: call('changePassword'),
    getAccountants: call('getAccountants'),
    addAccountant: call('addAccountant'),
    updateAccountant: call('updateAccountant'),
    deleteAccountant: call('deleteAccountant'),

    // الجهات المستفيدة
    getDestinations: call('getDestinations'),
    addDestination: call('addDestination'),
    updateDestination: call('updateDestination'),
    deleteDestination: call('deleteDestination'),

    // الجهات القائمة بالصرف
    getSpenders: call('getSpenders'),
    addSpender: call('addSpender'),
    updateSpender: call('updateSpender'),
    deleteSpender: call('deleteSpender'),

    // الجهات الممولة
    getFundingParties: call('getFundingParties'),
    addFundingParty: call('addFundingParty'),

    // المصروفات
    getExpenses: call('getExpenses'),
    addExpense: call('addExpense'),
    updateExpense: call('updateExpense'),
    deleteExpense: call('deleteExpense'),

    // الديون
    getDebtsSummary: call('getDebtsSummary'),
    getDebtItems: call('getDebtItems'),
    settleDebt: call('settleDebt'),

    // المقبوضات
    getLoans: call('getLoans'),
    addLoan: call('addLoan'),
    updateLoan: call('updateLoan'),
    deleteLoan: call('deleteLoan'),

    // القاصة والخلاصة
    getMonthCashReport: call('getMonthCashReport'),
    getMonthSummary: call('getMonthSummary'),

    // الكشوفات
    getExpensesReport: call('getExpensesReport'),
    getLoansReport: call('getLoansReport'),

    // التصدير والطباعة
    exportReport: call('exportReport'),
    printPage: call('printPage'),
});

// end preload.js