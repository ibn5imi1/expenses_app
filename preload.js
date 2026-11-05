const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
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

  // القاصة
  getCash: () => ipcRenderer.invoke('getCash'),
});