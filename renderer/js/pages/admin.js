// صفحة الأدمن: إدارة المحاسبين
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

    let accountants = [];
    let editingId = null;

    function reset() {
        form.reset();
        editingId = null;
        titleEl.textContent = 'إضافة محاسب';
        passwordLabel.textContent = 'كلمة المرور';
        submitBtn.textContent = 'إضافة المحاسب';
        cancelBtn.classList.add('hidden');
        hideNote(errorEl);
    }

    function startEdit(a) {
        editingId = a.id;
        nameInput.value = a.display_name || a.username;
        usernameInput.value = a.username;
        passwordInput.value = '';
        titleEl.textContent = 'تعديل المحاسب';
        passwordLabel.textContent = 'كلمة مرور جديدة (اتركها فارغة بدون تغيير)';
        submitBtn.textContent = 'حفظ التعديل';
        cancelBtn.classList.remove('hidden');
        hideNote(errorEl);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        nameInput.focus();
    }

    async function remove(a) {
        const name = a.display_name || a.username;
        if (!confirm(`هل تريد حذف المحاسب «${name}»؟ لن يستطيع الدخول بعد الآن، وتبقى سجلاته كما هي.`)) return;
        try {
            await window.api.deleteAccountant(a.id);
            if (editingId === a.id) reset();
            await load();
            showToast(`تم حذف المحاسب: ${name}`);
        } catch (err) {
            console.error(err);
            showProblem(cleanError(err));
        }
    }

    function render() {
        body.innerHTML = '';
        if (!accountants.length) return emptyRow(body, 'لا يوجد محاسبون بعد', 3);

        accountants.forEach(a => {
            const tr = document.createElement('tr');
            tr.appendChild(createCell(a.display_name || a.username));
            tr.appendChild(createCell(a.username));
            tr.appendChild(createActionsCell(() => startEdit(a), () => remove(a)));
            body.appendChild(tr);
        });
    }

    async function load() {
        accountants = await window.api.getAccountants();
        render();
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        hideNote(errorEl);

        const displayName = nameInput.value.replace(/\s+/g, ' ').trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const editing = editingId !== null;
        let message = '';

        if (!displayName || !username) message = 'أدخل اسم المحاسب واسم المستخدم';
        else if (!editing && !password) message = 'أدخل كلمة المرور';
        else if (password && password.length < MIN_PASSWORD) message = `كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD} أحرف`;

        if (message) return showNote(errorEl, message);

        try {
            if (editing) {
                await window.api.updateAccountant(editingId, displayName, username, password);
                showToast(`تم تعديل بيانات المحاسب: ${displayName}`);
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