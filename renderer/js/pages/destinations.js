// صفحة الجهات المستفيدة: إضافة وتعديل وحذف
(() => {
    const form = $('ben-form');
    const nameInput = $('ben-name');
    const submitBtn = $('ben-submit');
    const cancelBtn = $('ben-cancel');
    const body = $('ben-body');
    const totalCount = $('ben-total-count');
    const totalSum = $('ben-total-sum');

    let editingId = null;

    function reset() {
        form.reset();
        editingId = null;
        submitBtn.textContent = 'إضافة الجهة';
        cancelBtn.classList.add('hidden');
        nameInput.classList.remove('invalid');
    }

    function startEdit(item) {
        editingId = item.id;
        nameInput.value = item.name;
        submitBtn.textContent = 'تحديث الجهة';
        cancelBtn.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        nameInput.focus();
    }

    async function remove(item) {
        if (!confirm(`هل تريد حذف الجهة «${item.name}»؟`)) return;
        try {
            await window.api.deleteDestination(item.id);
            if (editingId === item.id) reset();
            await App.refreshAll({ silent: true });
        } catch (err) {
            console.error(err);
            showProblem(cleanError(err));   // مثلاً: لا يمكن حذف جهة لديها مصروفات
        }
    }

    function render() {
        body.innerHTML = '';
        let count = 0;
        let sum = 0;

        App.lists.destinations.forEach(item => {
            count += item.expenses_count;
            sum += item.expenses_total;

            const tr = document.createElement('tr');
            tr.appendChild(createCell(item.name));
            tr.appendChild(createCell(String(item.expenses_count)));
            tr.appendChild(createCell(formatMoney(item.expenses_total)));
            tr.appendChild(item.is_fixed
                ? createBadgeCell('ثابتة')
                : createActionsCell(() => startEdit(item), () => remove(item)));
            body.appendChild(tr);
        });

        totalCount.textContent = String(count);
        totalSum.textContent = formatMoney(sum);
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const name = nameInput.value.replace(/\s+/g, ' ').trim();
        let message = '';

        if (!name) message = 'اكتب اسم الجهة';
        else if (App.lists.destinations.some(d => d.name === name && d.id !== editingId)) message = 'هذه الجهة موجودة مسبقاً';

        if (message) {
            nameInput.classList.add('invalid');
            showProblem(message);
            nameInput.focus();
            return;
        }

        try {
            if (editingId) await window.api.updateDestination(editingId, name);
            else await window.api.addDestination(name);
            reset();
            await App.refreshAll({ silent: true });
        } catch (err) {
            console.error(err);
            showProblem(cleanError(err));
        }
    });

    cancelBtn.addEventListener('click', reset);
    nameInput.addEventListener('input', () => nameInput.classList.remove('invalid'));

    App.registerPage('destinations', { fillLists: render });
})();