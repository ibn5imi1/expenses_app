const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getDestinations: () => ipcRenderer.invoke("getDestinations"),
  getExpenses: () => ipcRenderer.invoke("getExpenses"),
  addExpense: (data) => ipcRenderer.invoke("addExpense", data),
  updateExpense: (id, data) => ipcRenderer.invoke("updateExpense", id, data),
  deleteExpense: (id) => ipcRenderer.invoke("deleteExpense", id),

  getLoanTypes: () => ipcRenderer.invoke("getLoanTypes"),
  addLoanType: (name) => ipcRenderer.invoke("addLoanType", name),
  getLoans: () => ipcRenderer.invoke("getLoans"),
  addLoan: (data) => ipcRenderer.invoke("addLoan", data),
  updateLoan: (id, data) => ipcRenderer.invoke("updateLoan", id, data),
  deleteLoan: (id) => ipcRenderer.invoke("deleteLoan", id),
  updateLoanType: (id, name) => ipcRenderer.invoke("updateLoanType", id, name),
deleteLoanType: (id) => ipcRenderer.invoke("deleteLoanType", id),
});
