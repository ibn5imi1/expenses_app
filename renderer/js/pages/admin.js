// صفحة الأدمن: إدارة المستخدمين (المحاسبون + تعديل اسم الأدمن واسم مستخدمه)
(() => {
    const MIN_PASSWORD = 6;
    const form = $('accountant-form');
    const titleEl = $('accountant-form-title');
    const nameInput = $('accountant-name');
    const usernameInput = $('accountant-username');
    const passwordInput = $('accountant-password');
    const passwordLabel = $('accountant-password-label');
    const errorEl = $('accountant-error');
    const submitBtn = $('accountant-submit');
    const cancelBtn = $('accountant-cancel');
    const body = $('accountants-body');

    const passwordField = () => passwordInput.closest('.field');

    let users = [];
    let editingId = null;
    let editingRole = null;

    function reset() {
        form.reset();
        editingId = null;
        editingRole = null;
        titleEl.textContent = 'إضافة محاسب';
        passwordLabel.textContent = 'كلمة المرور';
        passwordField().classList.remove('hidden');
        submitBtn.textContent = 'إضافة المحاسب';
        cancelBtn.classList.add('hidden');
        hideNote(errorEl);
    }

    function startEdit(u) {
        const isAdmin = u.role === 'admin';
        editingId = u.id;
        editingRole = u.role;

        nameInput.value = u.display_name || u.username;
        usernameInput.value = u.username;
        passwordInput.value = '';

        titleEl.textContent = isAdmin ? 'تعديل بيانات الأدمن (الاسم واسم المستخدم)' : 'تعديل المحاسب';
        passwordLabel.textContent = 'كلمة مرور جديدة (اتركها فارغة بدون تغيير)';
        passwordField().classList.toggle('hidden', isAdmin);   // كلمة مرور الأدمن تُغيَّر من صفحة الإعدادات
        submitBtn.textContent = 'حفظ التعديل';
        cancelBtn.classList.remove('hidden');
        hideNote(errorEl);

        window.scrollTo({ top: 0, behavior: 'smooth' });
        nameInput.focus();
    }

    async function remove(u) {
        const name = u.display_name || u.username;
        if (!confirm(`هل تريد حذف المحاسب «${name}»؟ لن يستطيع الدخول بعد الآن، وتبقى سجلاته كما هي.`)) return;
        try {
            await window.api.deleteAccountant(u.id);
            if (editingId === u.id) reset();
            await load();
            showToast(`تم حذف المحاسب: ${name}`);
        } catch (err) {
            console.error(err);
            showProblem(cleanError(err));
        }
    }

    // الأدمن: زر تعديل فقط (لا حذف)
    function createEditOnlyCell(onEdit) {
        const td = document.createElement('td');
        td.className = 'actions-cell';
        const box = document.createElement('div');
        box.className = 'row-actions';
        box.appendChild(createButton('تعديل', 'btn btn-light btn-small', onEdit));
        td.appendChild(box);
        return td;
    }

    function render() {
        body.innerHTML = '';
        if (!users.length) return emptyRow(body, 'لا يوجد مستخدمون', 4);

        users.forEach(u => {
            const isAdmin = u.role === 'admin';
            const tr = document.createElement('tr');
            tr.appendChild(createCell(u.display_name || u.username));
            tr.appendChild(createCell(u.username));
            tr.appendChild(createBadgeCell(isAdmin ? 'أدمن' : 'محاسب'));
            tr.appendChild(isAdmin
                ? createEditOnlyCell(() => startEdit(u))
                : createActionsCell(() => startEdit(u), () => remove(u)));
            body.appendChild(tr);
        });
    }

    async function load() {
        users = await window.api.getAccountants();
        render();
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        hideNote(errorEl);

        const displayName = nameInput.value.replace(/\s+/g, ' ').trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const editing = editingId !== null;
        const isAdmin = editingRole === 'admin';
        let message = '';

        if (!displayName || !username) message = 'أدخل الاسم واسم المستخدم';
        else if (!editing && !password) message = 'أدخل كلمة المرور';
        else if (!isAdmin && password && password.length < MIN_PASSWORD) message = `كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD} أحرف`;

        if (message) return showNote(errorEl, message);

        try {
            if (editing) {
                const editedId = editingId;
                await window.api.updateAccountant(editedId, displayName, username, isAdmin ? '' : password);

                // إن عدّل المستخدم بياناته هو: نحدّث اسمه في الشريط العلوي
                if (App.user && editedId === App.user.id) {
                    const me = await window.api.getSession();
                    if (me) {
                        App.user = me;
                        $('current-user').textContent = me.displayName || me.username;
                    }
                }
                showToast(isAdmin ? 'تم تعديل بيانات الأدمن' : `تم تعديل بيانات المحاسب: ${displayName}`);
            } else {
                await window.api.addAccountant(displayName, username, password);
                showToast(`تمت إضافة المحاسب: ${displayName}`);
            }
            reset();
            await load();
        } catch (err) {
            console.error(err);
            showNote(errorEl, cleanError(err));
        }
    });

    cancelBtn.addEventListener('click', reset);

    App.registerPage('admin', {
        refresh: async () => { if (App.user && App.user.role === 'admin') await load(); },
    });
})();