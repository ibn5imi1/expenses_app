# College Expenses Manager

[English](#english) · [العربية](#arabic)

---

<a id="english"></a>

## English

A Windows desktop application for managing the finances of a university college: expenses, receipts by funding source, debts, cash balances and monthly reports. It was designed and built for real use at University College of Architecture, Al-Amarah, Iraq.

### Features

- **Role-based access**: an administrator and any number of accountants, each with their own login. Passwords are stored as bcrypt hashes.
- **Expenses**: record spending by date, spender, beneficiary and funding source, with receipt numbers.
- **Receipts and funding sources**: record money received from each source and track what remains.
- **Month-end cash balancing**: unspent cash is zeroed per funding source at the end of each month and deducted from the latest receipts of that source.
- **Debts**: record debts and their settlements.
- **Reports**: expenses report, receipts report, cash report by year and month, and a monthly summary. All reports can be printed or exported to Excel with filter arrows on the headers.
- **Lists management**: beneficiaries, spenders and funding sources. Entries that already have records are archived rather than deleted.
- **Backup and import**: save all data to a single password-encrypted backup file, and import it on another computer by merging with existing data or replacing it. A safety copy is made automatically before every import.
- **Admin recovery**: a command-line recovery option resets the administrator password with a private recovery key.
- **Local-first**: all data is stored in a local SQLite database. No server is required.
- **Internet check**: the application can require an active internet connection and shows a blocking screen when the connection is lost.
- **Interface**: Arabic, right-to-left layout, custom application icon and an animated start screen shown after login.

### Tech stack

| Area | Technology |
| --- | --- |
| Desktop shell | Electron |
| Runtime | Node.js |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| Passwords | `bcryptjs` |
| Excel export | `exceljs` |
| Date picker | `flatpickr` |
| Interface | HTML, CSS, JavaScript |
| Packaging | `electron-builder` (NSIS installer) |

### For users: install

1. Download `CollegeExpenses Setup 1.0.0.exe` from the **Releases** page.
2. Run the installer. Windows may show an "unknown publisher" warning because the installer is not code-signed. Choose **More info**, then **Run anyway**.
3. Launch **CollegeExpenses** from the desktop shortcut.
4. A default administrator account is created on first launch. **Change its password immediately** from the Settings page.

### For developers: run from source

Requirements: Node.js, and on Windows the Visual Studio Build Tools with the **Desktop development with C++** workload (needed to build `better-sqlite3`).

```bash
npm install
npm start
```

Create your recovery key hash before first use:

```bash
cp recovery.example.js recovery.js
node -e "console.log(require('bcryptjs').hashSync('YOUR_PRIVATE_KEY', 10))"
# paste the printed hash into recovery.js
```

### Build the installer

```bash
npm run dist
```

The installer is created in `dist/`. Test `dist/win-unpacked/CollegeExpenses.exe` before distributing it.

### Where data is stored

| Item | Location |
| --- | --- |
| Database | `%APPDATA%\expenses_app\college.db` |
| Automatic safety copies | `%APPDATA%\expenses_app\backups` |

Uninstalling the application does not delete this data. To move data to another computer, use **Backup** on the source and **Import** on the target.

### Recover the administrator password

Close the application, then run it from a terminal with the recovery arguments:

```bash
CollegeExpenses.exe --reset-admin=NEW_PASSWORD --recovery-key=YOUR_PRIVATE_KEY --admin-username=admin
```

During development use `npm start -- --reset-admin=... --recovery-key=...`. Keep the recovery key private and stored outside the computer: it cannot be recovered if lost.

### Project structure

```
expenses_app/
├── electron-main.js     entry point
├── preload.js           secure bridge exposing window.api
├── recovery.js          recovery key hash (not committed)
├── main/                backend: window, session, connectivity, recovery
│   ├── export/          Excel export
│   ├── ipc/             IPC handlers (auth, expenses, loans, debts, reports, backup, ...)
│   └── database/        SQLite schema, queries, cash sync, backup
└── renderer/            user interface
    ├── css/             stylesheets
    ├── js/core/         shared utilities
    ├── js/pages/        one file per page
    ├── js/app/          navigation, login, network gate, splash screen
    └── lib/             third-party libraries
```

### Security notes

- The renderer runs with `contextIsolation` enabled and no Node integration; it reaches the system only through the whitelisted `window.api` bridge.
- Every backend operation requires a valid session, and administrator-only operations are checked in the main process, not only in the interface.
- The database file is not encrypted at rest. For stronger protection, enable BitLocker on the computer and keep regular backups outside it.
- Developer tools are disabled in the packaged application.

### Author

**Mohammed Ahmed Kadhim**
Email: mohammedahmedkadhim@gmail.com

---

<a id="arabic"></a>

<div dir="rtl" lang="ar">

## العربية

# برنامج إدارة مصروفات الكلية

تطبيق سطح مكتب لنظام Windows لإدارة الشؤون المالية للكلية: المصروفات، والقبوضات حسب مصدر التمويل، والديون، وأرصدة الصندوق، والتقارير الشهرية. صُمّم وبُني للاستخدام الفعلي في كلية العمارة الجامعية في العمارة (ميسان)، العراق.

### المزايا

- **صلاحيات المستخدمين**: مدير (أدمن) وأي عدد من المحاسبين، ولكل منهم حساب دخول خاص. تُخزَّن كلمات السر بصيغة مشفّرة (bcrypt).
- **المصروفات**: تسجيل الصرف بالتاريخ والمنفق والجهة المستفيدة ومصدر التمويل مع رقم الوصل.
- **القبوضات ومصادر التمويل**: تسجيل المبالغ المستلمة من كل مصدر ومتابعة المتبقي.
- **تصفير الصندوق آخر الشهر**: يُصفَّر المبلغ غير المصروف لكل مصدر تمويل في نهاية الشهر ويُخصم من آخر قبوضات ذلك المصدر.
- **الديون**: تسجيل الديون وتسديدها.
- **التقارير**: تقرير المصروفات، وتقرير القبوضات، وتقرير الصندوق حسب السنة والشهر، وملخص شهري. يمكن طباعتها أو تصديرها إلى Excel مع أسهم التصفية في العناوين.
- **إدارة القوائم**: الجهات المستفيدة والمنفقون ومصادر التمويل. ما كان له سجلات يُؤرشف ولا يُحذف نهائياً.
- **النسخ الاحتياطي والاستيراد**: حفظ كل البيانات في ملف واحد مشفّر بكلمة مرور، واستيراده على حاسوب آخر بالدمج مع البيانات الحالية أو باستبدالها. وتُؤخذ نسخة أمان تلقائياً قبل كل استيراد.
- **استرجاع حساب الأدمن**: خيار من سطر الأوامر لإعادة تعيين كلمة سر الأدمن بمفتاح استرجاع خاص.
- **محلي بالكامل**: تُحفظ البيانات في قاعدة SQLite على الجهاز نفسه، ولا يحتاج البرنامج إلى سيرفر.
- **فحص الإنترنت**: يمكن اشتراط وجود اتصال بالإنترنت، وتظهر شاشة تمنع الاستخدام عند انقطاعه.
- **الواجهة**: عربية من اليمين إلى اليسار، مع أيقونة خاصة للتطبيق وشاشة بداية متحركة تظهر بعد تسجيل الدخول.

### التقنيات المستخدمة

| المجال | التقنية |
| --- | --- |
| غلاف سطح المكتب | Electron |
| بيئة التشغيل | Node.js |
| قاعدة البيانات | SQLite عبر `better-sqlite3` (وضع WAL) |
| كلمات السر | `bcryptjs` |
| تصدير Excel | `exceljs` |
| اختيار التاريخ | `flatpickr` |
| الواجهة | HTML وCSS وJavaScript |
| التجميع | `electron-builder` (مثبّت NSIS) |

### للمستخدمين: التثبيت

1. حمّل الملف `CollegeExpenses Setup 1.0.0.exe` من صفحة **Releases**.
2. شغّل المثبّت. قد يعرض Windows تحذير "ناشر غير معروف" لأن المثبّت غير موقّع رقمياً. اختر **More info** ثم **Run anyway**.
3. افتح **CollegeExpenses** من اختصار سطح المكتب.
4. يُنشأ حساب أدمن افتراضي عند أول تشغيل. **غيّر كلمة سره فوراً** من صفحة الإعدادات.

### للمطورين: التشغيل من الشيفرة

المتطلبات: Node.js، وعلى Windows أدوات Visual Studio Build Tools مع حزمة **Desktop development with C++** (لازمة لبناء `better-sqlite3`).

```bash
npm install
npm start
```

أنشئ هاش مفتاح الاسترجاع قبل أول استخدام:

```bash
cp recovery.example.js recovery.js
node -e "console.log(require('bcryptjs').hashSync('مفتاحك_الخاص', 10))"
# الصق الهاش الناتج داخل recovery.js
```

### بناء المثبّت

```bash
npm run dist
```

يُنشأ المثبّت داخل مجلد `dist/`. جرّب `dist/win-unpacked/CollegeExpenses.exe` قبل توزيعه.

### أين تُحفظ البيانات

| العنصر | المكان |
| --- | --- |
| قاعدة البيانات | `%APPDATA%\expenses_app\college.db` |
| نسخ الأمان التلقائية | `%APPDATA%\expenses_app\backups` |

إلغاء تثبيت البرنامج لا يحذف هذه البيانات. ولنقل البيانات إلى حاسوب آخر استخدم **النسخ الاحتياطي** على الجهاز المصدر و**الاستيراد** على الجهاز الهدف.

### استرجاع كلمة سر الأدمن

أغلق البرنامج ثم شغّله من الطرفية مع وسائط الاسترجاع:

```bash
CollegeExpenses.exe --reset-admin=كلمة_السر_الجديدة --recovery-key=مفتاحك_الخاص --admin-username=admin
```

وأثناء التطوير استخدم `npm start -- --reset-admin=... --recovery-key=...`. احتفظ بمفتاح الاسترجاع سراً وفي مكان خارج الحاسوب، فلا يمكن استعادته إذا ضاع.

### هيكل المشروع

```
expenses_app/
├── electron-main.js     نقطة البداية
├── preload.js           الجسر الآمن الذي يعرّف window.api
├── recovery.js          هاش مفتاح الاسترجاع (لا يُرفع)
├── main/                الجزء الخلفي: النافذة والجلسة والاتصال والاسترجاع
│   ├── export/          تصدير Excel
│   ├── ipc/             أوامر الاتصال (دخول، مصروفات، قبوضات، ديون، تقارير، نسخ احتياطي...)
│   └── database/        جداول SQLite والاستعلامات وحساب الصندوق والنسخ الاحتياطي
└── renderer/            الواجهة
    ├── css/             ملفات التنسيق
    ├── js/core/         أدوات مشتركة
    ├── js/pages/        ملف لكل صفحة
    ├── js/app/          التنقل والدخول وفحص الإنترنت وشاشة البداية
    └── lib/             مكتبات خارجية
```

### ملاحظات أمنية

- تعمل الواجهة مع تفعيل `contextIsolation` وبدون تكامل Node، ولا تصل إلى النظام إلا عبر الجسر المحدد `window.api`.
- تتطلب كل عملية في الجزء الخلفي جلسة صالحة، وتُفحص صلاحيات الأدمن في العملية الرئيسية وليس في الواجهة فقط.
- ملف قاعدة البيانات غير مشفّر على القرص. لحماية أقوى فعّل BitLocker على الحاسوب واحتفظ بنسخ احتياطية دورية خارجه.
- أدوات المطور معطّلة في النسخة المثبّتة.

### المطوّر

**محمد أحمد كاظم**
البريد الإلكتروني: mohammedahmedkadhim@gmail.com

</div>
