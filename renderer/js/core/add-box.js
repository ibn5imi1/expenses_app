// صندوق «إضافة اسم» (حقل وزر): للمصادر وللجهات القائمة بالصرف
function createAddBox({ form, input, existing, emptyMessage, add, onAdded }) {
    input.addEventListener('input', () => input.classList.remove('invalid'));

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const name = input.value.replace(/\s+/g, ' ').trim();
        let message = '';

        if (!name) message = emptyMessage;
        else if (existing().some(i => i.name === name)) message = 'هذا الاسم موجود مسبقاً';

        if (message) {
            input.classList.add('invalid');
            showProblem(message);
            input.focus();
            return;
        }

        try {
            const id = await add(name);
            form.reset();
            await onAdded(id, name);
        } catch (err) {
            console.error(err);
            showProblem(cleanError(err));
        }
    });
}