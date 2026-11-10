const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // الجلسة
    login: (username, password) => ipcRenderer.invoke('login', username, password),
    logout: () => ipcRenderer.invoke('logout'),
    getSession: () => ipcRenderer.invoke('getSession'),

    // الإعدادات والأدمن
    changePassword: (oldPassword, newPassword) =>
        ipcRenderer.invoke('changePassword', oldPassword, newPassword),
    getAccountants: () => ipcRenderer.invoke('getAccountants'),
    addAccountant: (displayName, username, password) =>
        ipcRenderer.invoke('addAccountant', displayName, username, password),
    updateAccountant: (id, displayName, username, password) =>
        ipcRenderer.invoke('updateAccountant', id, displayName, username, password),
    deleteAccountant: id => ipcRenderer.invoke('deleteAccountant', id),

    // جهات الصرف
    getDestinations: () => ipcRenderer.invoke('getDestinations'),
    addDestination: name => ipcRenderer.invoke('addDestination', name),
    updateDestination: (id, name) => ipcRenderer.invoke('updateDestination', id, name),
    deleteDestination: id => ipcRenderer.invoke('deleteDestination', id),

    // المصروفات
    getExpenses: () => ipcRenderer.invoke('getExpenses'),
    addExpense: data => ipcRenderer.invoke('addExpense', data),
    updateExpense: (id, data) => ipcRenderer.invoke('updateExpense', id, data),
    deleteExpense: id => ipcRenderer.invoke('deleteExpense', id),

    // أنواع السلف
    getLoanTypes: () => ipcRenderer.invoke('getLoanTypes'),
    addLoanType: name => ipcRenderer.invoke('addLoanType', name),
    updateLoanType: (id, name) => ipcRenderer.invoke('updateLoanType', id, name),
    deleteLoanType: id => ipcRenderer.invoke('deleteLoanType', id),

    // السلف
    getLoans: () => ipcRenderer.invoke('getLoans'),
    addLoan: data => ipcRenderer.invoke('addLoan', data),
    updateLoan: (id, data) => ipcRenderer.invoke('updateLoan', id, data),
    deleteLoan: id => ipcRenderer.invoke('deleteLoan', id),

    // القاصة والخلاصة (شهرية)
    getMonthCashReport: filters => ipcRenderer.invoke('getMonthCashReport', filters),
    getMonthSummary: filters => ipcRenderer.invoke('getMonthSummary', filters),

    // كشف المصروفات والسلف
    getExpensesReport: filters => ipcRenderer.invoke('getExpensesReport', filters),
    getLoansReport: filters => ipcRenderer.invoke('getLoansReport', filters),

    // التصدير والطباعة
    exportReport: report => ipcRenderer.invoke('exportReport', report),
    printPage: () => ipcRenderer.invoke('printPage'),
});