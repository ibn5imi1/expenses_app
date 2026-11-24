const { ipcMain } = require('electron');
const connectivity = require('./connectivity');

// المستخدم المسجل دخوله { id, username, displayName, role } أو null (يحمله الجزء الخلفي فقط)
let session = null;

const getSession = () => session;
const setSession = user => { session = user; };

// كل العمليات تتطلب اتصالاً بالإنترنت وتسجيل الدخول، وعمليات الأدمن تتطلب صلاحية أدمن
function handle(channel, fn, { admin = false } = {}) {
    ipcMain.handle(channel, (event, ...args) => {
        if (!connectivity.isOnline()) throw new Error('لا يوجد اتصال بالإنترنت');
        if (!session) throw new Error('يجب تسجيل الدخول أولاً');
        if (admin && session.role !== 'admin') throw new Error('هذه العملية للأدمن فقط');
        return fn(event, ...args);
    });
}

module.exports = { getSession, setSession, handle };