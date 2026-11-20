const bcrypt = require('bcryptjs');
const { conn } = require('./connection');
const { isConstraintError } = require('./helpers');

const MIN_PASSWORD = 6;

function assertPassword(password) {
    if (String(password || '').length < MIN_PASSWORD) {
        throw new Error(`كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD} أحرف`);
    }
}

function cleanUsername(name) {
    const clean = String(name || '').trim();
    if (clean.length < 3) throw new Error('اسم المستخدم يجب ألا يقل عن 3 أحرف');
    if (clean.length > 30 || !/^[\p{L}\p{N}._-]+$/u.test(clean)) throw new Error('اسم المستخدم: حروف وأرقام و . _ - فقط');
    return clean;
}

function cleanDisplayName(name) {
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    if (clean.length < 2) throw new Error('الاسم مطلوب');
    if (clean.length > 40 || !/^[\p{L}\p{N} ._-]+$/u.test(clean)) throw new Error('الاسم: حروف وأرقام ومسافات فقط');
    return clean;
}

// يرجع بيانات المستخدم عند النجاح، أو null عند الفشل
function login(username, password) {
    const user = conn.db.prepare(
        'SELECT id, username, display_name, password_hash, role FROM users WHERE username = ?',
    ).get(String(username || '').trim());

    if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) return null;
    return { id: user.id, username: user.username, displayName: user.display_name || user.username, role: user.role };
}

function changePassword(userId, oldPassword, newPassword) {
    assertPassword(newPassword);
    const user = conn.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    if (!user || !bcrypt.compareSync(String(oldPassword || ''), user.password_hash)) {
        throw new Error('كلمة المرور الحالية غير صحيحة');
    }
    conn.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(bcrypt.hashSync(String(newPassword), 10), userId);
}

// كل المستخدمين (الأدمن أولاً) مع الصلاحية
const getAccountants = () => conn.db.prepare(
    "SELECT id, username, display_name, role FROM users ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, id",
).all();

function addAccountant(displayName, username, password) {
    const name = cleanDisplayName(displayName);
    const clean = cleanUsername(username);
    assertPassword(password);

    if (conn.db.prepare('SELECT 1 FROM users WHERE display_name = ?').get(name)) {
        throw new Error('هذا الاسم مستخدم لمستخدم آخر');
    }
    try {
        return conn.db.prepare(
            `INSERT INTO users (username, display_name, password_hash, role, created_at)
             VALUES (?, ?, ?, 'accountant', ?)`,
        ).run(clean, name, bcrypt.hashSync(String(password), 10), new Date().toISOString()).lastInsertRowid;
    } catch (err) {
        if (isConstraintError(err)) throw new Error('اسم المستخدم موجود مسبقاً');
        throw err;
    }
}

// تعديل الاسم واسم المستخدم لأي مستخدم (محاسب أو أدمن). كلمة مرور المحاسب اختيارية،
// أما الأدمن فكلمة مروره تُغيَّر من صفحة الإعدادات فقط.
function updateAccountant(id, displayName, username, newPassword) {
    const name = cleanDisplayName(displayName);
    const clean = cleanUsername(username);
    const hasPassword = String(newPassword || '').length > 0;

    const user = conn.db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
    if (!user) throw new Error('المستخدم غير موجود');
    if (user.role === 'admin' && hasPassword) throw new Error('كلمة مرور الأدمن تُغيَّر من صفحة «الاعدادات»');
    if (hasPassword) assertPassword(newPassword);

    if (conn.db.prepare('SELECT 1 FROM users WHERE display_name = ? AND id <> ?').get(name, id)) {
        throw new Error('هذا الاسم مستخدم لمستخدم آخر');
    }

    try {
        conn.db.transaction(() => {
            conn.db.prepare('UPDATE users SET display_name = ?, username = ? WHERE id = ?').run(name, clean, id);
            if (hasPassword) {
                conn.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                    .run(bcrypt.hashSync(String(newPassword), 10), id);
            }
        })();
    } catch (err) {
        if (isConstraintError(err)) throw new Error('اسم المستخدم موجود مسبقاً');
        throw err;
    }
    return { displayName: name, username: clean };
}

function deleteAccountant(id) {
    const user = conn.db.prepare('SELECT role FROM users WHERE id = ?').get(id);
    if (!user) throw new Error('المحاسب غير موجود');
    if (user.role === 'admin') throw new Error('لا يمكن حذف حساب الأدمن');
    conn.db.prepare("DELETE FROM users WHERE id = ? AND role = 'accountant'").run(id);
}

// استرجاع كلمة مرور الأدمن: يتطلب مفتاحاً يطابق البصمة المحفوظة في recovery.js
function recoverAdmin(key, newPassword, keyHash) {
    if (!keyHash) throw new Error('الاسترجاع غير مفعّل');
    if (!bcrypt.compareSync(String(key || ''), keyHash)) throw new Error('مفتاح الاسترجاع غير صحيح');
    assertPassword(newPassword);

    const result = conn.db.prepare("UPDATE users SET password_hash = ? WHERE role = 'admin'")
        .run(bcrypt.hashSync(String(newPassword), 10));
    if (result.changes === 0) throw new Error('لا يوجد حساب أدمن');
}

module.exports = {
    login, changePassword, getAccountants, addAccountant, updateAccountant, deleteAccountant, recoverAdmin,
};