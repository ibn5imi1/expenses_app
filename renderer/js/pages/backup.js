// بطاقة «النسخ الاحتياطي ونقل البيانات» في صفحة الأدمن
(() => {
  const saveBtn = $("backup-save");
  const importBtn = $("backup-import");
  const infoEl = $("backup-info");

  const setBusy = (busy) => {
    saveBtn.disabled = busy;
    importBtn.disabled = busy;
  };

  async function load() {
    if (!App.user || App.user.role !== "admin") return;
    const info = await window.api.getBackupInfo();

    const parts = [
      `آخر نسخة احتياطية: ${info.lastBackup ? formatDateTime(info.lastBackup) : "لم تُؤخذ بعد"}`,
    ];
    if (info.lastImport)
      parts.push(`آخر استيراد: ${formatDateTime(info.lastImport)}`);
    infoEl.textContent = parts.join(" — ");

    // تنبيه بالأحمر إن مرّ على آخر نسخة أكثر من 7 أيام
    const old =
      !info.lastBackup ||
      Date.now() - new Date(info.lastBackup).getTime() >
        7 * 24 * 60 * 60 * 1000;
    infoEl.classList.toggle("backup-old", old);
  }
  App.loadBackupInfo = load;

  saveBtn.addEventListener("click", async () => {
    setBusy(true);
    try {
      const choice = await window.api.chooseBackupFolder(); // نافذة اختيار المجلد أو الفلاشة
      if (choice.cancelled) return;

      const result = await withLoader("جارٍ التصدير...", () =>
        window.api.runBackup(),
      );
      showToast(`تم حفظ النسخة الاحتياطية: ${result.fileName}`);
      await load();
    } catch (err) {
      console.error(err);
      showProblem(cleanError(err));
    } finally {
      setBusy(false);
    }
  });

  importBtn.addEventListener("click", async () => {
    setBusy(true);
    try {
      const choice = await window.api.chooseImportFile(); // اختيار الملف ثم طريقة الاستيراد
      if (choice.cancelled) return;

      const result = await withLoader("جارٍ الاستيراد...", () =>
        window.api.runImport(),
      );

      if (result.mode === "replace") {
        showToast(
          `تم الاستيراد: ${result.expenses} مصروف و${result.loans} مقبوض. سيُطلب تسجيل الدخول من جديد...`,
          false,
          4000,
        );
        setTimeout(() => location.reload(), 2500);
        return;
      }

      const e = result.expenses;
      const l = result.loans;
      const u = result.users;
      const lists = result.destinations + result.spenders + result.sources;
      const extra = [];
      if (lists) extra.push(`${lists} جهة أو مصدر جديد`);
      if (e.skipped + l.skipped + u.skipped)
        extra.push(`${e.skipped + l.skipped + u.skipped} موجود مسبقاً`);
      if (e.invalid + l.invalid)
        extra.push(`${e.invalid + l.invalid} غير صالح`);

      showToast(
        `تمت الإضافة: ${e.added} مصروف و${l.added} مقبوض و${u.added} محاسب${extra.length ? ` (${extra.join("، ")})` : ""}`,
        false,
        6000,
      );
      await App.refreshAll({ silent: true });
      await load();
    } catch (err) {
      console.error(err);
      showProblem(cleanError(err));
    } finally {
      setBusy(false);
    }
  });
})();
