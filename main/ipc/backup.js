const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, dialog } = require("electron");
const db = require("../database");
const { handle, setSession } = require("../session");

// الاختيارات تبقى في الجزء الخلفي (لا تستطيع الواجهة تحديد مسارات من عندها)
let pendingFolder = null; // مجلد النسخة الاحتياطية
let pendingImport = null; // { file, mode: 'merge' | 'replace' }

const fmtDate = (d) => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

function register() {
  handle("getBackupInfo", () => db.getBackupInfo(), { admin: true });

  /* ---------- حفظ نسخة احتياطية ---------- */
  handle(
    "chooseBackupFolder",
    async (e) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      const r = await dialog.showOpenDialog(win, {
        title: "اختر المجلد أو الفلاشة لحفظ النسخة الاحتياطية",
        defaultPath: app.getPath("desktop"),
        properties: ["openDirectory", "createDirectory"],
      });
      if (r.canceled || !r.filePaths[0]) {
        pendingFolder = null;
        return { cancelled: true };
      }
      pendingFolder = r.filePaths[0];
      return { cancelled: false, folder: pendingFolder };
    },
    { admin: true },
  );

  handle(
    "runBackup",
    async () => {
      if (!pendingFolder) throw new Error("اختر مجلد الحفظ أولاً");
      const folder = pendingFolder;
      pendingFolder = null;
      const result = await db.createBackupFile(folder);
      return { ...result, folder };
    },
    { admin: true },
  );

  /* ---------- استيراد بيانات ---------- */
  handle(
    "chooseImportFile",
    async (e) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      pendingImport = null;

      const picked = await dialog.showOpenDialog(win, {
        title: "اختر ملف النسخة الاحتياطية",
        defaultPath: app.getPath("desktop"),
        properties: ["openFile"],
        filters: [{ name: "نسخة احتياطية", extensions: ["bak", "db"] }],
      });
      if (picked.canceled || !picked.filePaths[0]) return { cancelled: true };

      const file = picked.filePaths[0];
      const name = path.basename(file);
      const info = db.inspectBackupFile(file); // يرفض أي ملف غير صالح برسالة واضحة

      const choice = await dialog.showMessageBox(win, {
        type: "question",
        title: "استيراد بيانات",
        message: `استيراد بيانات من الملف: ${name}`,
        detail:
          `يحتوي الملف على: ${info.expenses} مصروف، ${info.loans} مقبوض، ${info.users} مستخدم ` +
          `(تاريخ الملف: ${fmtDate(fs.statSync(file).mtime)})\n\n` +
          "• إضافة فوق البيانات الحالية: تُضاف المصروفات والمقبوضات والجهات والمحاسبون الجدد فقط، ولا يُحذف شيء، " +
          "ولا يتكرر ما هو موجود. حساب الأدمن والمحاسبون الموجودون عندك لا يتغيرون.\n\n" +
          "• حذف القديم واستبداله: تُحذف كل البيانات الحالية (بما فيها حسابات المستخدمين) ويحل محلها محتوى الملف.\n\n" +
          "تُحفظ نسخة تلقائية من بياناتك الحالية قبل أي استيراد.",
        buttons: [
          "إضافة فوق البيانات الحالية",
          "حذف القديم واستبداله بالملف",
          "إلغاء",
        ],
        defaultId: 2,
        cancelId: 2,
        noLink: true,
      });
      if (choice.response === 2) return { cancelled: true };

      if (choice.response === 1) {
        const sure = await dialog.showMessageBox(win, {
          type: "warning",
          title: "تأكيد الحذف والاستبدال",
          message: "هل أنت متأكد من حذف كل البيانات الحالية واستبدالها بالملف؟",
          detail:
            "سيُطلب منك تسجيل الدخول من جديد بحساب الملف. تُحفظ نسخة من بياناتك الحالية تلقائياً قبل الحذف.",
          buttons: ["نعم، احذف واستبدل", "تراجع"],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });
        if (sure.response !== 0) return { cancelled: true };
      }

      pendingImport = {
        file,
        mode: choice.response === 0 ? "merge" : "replace",
      };
      return { cancelled: false, mode: pendingImport.mode, fileName: name };
    },
    { admin: true },
  );

  handle(
    "runImport",
    async () => {
      if (!pendingImport) throw new Error("اختر ملف الاستيراد أولاً");
      const { file, mode } = pendingImport;
      pendingImport = null;

      if (mode === "replace") {
        const info = await db.replaceWithBackup(file);
        setSession(null); // حسابات المستخدمين تغيّرت: يلزم تسجيل دخول جديد
        return { mode, ...info };
      }
      return { mode, ...(await db.mergeBackup(file)) };
    },
    { admin: true },
  );
}

module.exports = { register };
