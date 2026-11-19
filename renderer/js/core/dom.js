// المحاسب: من أضاف، وعند التعديل من عدّل فقط
const accountantOf = row => row.updated_by || row.created_by;

// تلميح عند وقوف المؤشر: من أضاف ومن عدّل
function auditTitle(row) {
    const lines = [`تمت الإضافة بواسطة ${row.created_by} — ${formatDateTime(row.created_at)}`];
    if (row.updated_by) lines.push(`تم التعديل بواسطة ${row.updated_by} — ${formatDateTime(row.updated_at)}`);
    return lines.join('\n');
}

/* ---------- خلايا الجداول ---------- */
function createCell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;   // textContent يمنع تنفيذ أي HTML داخل النص
    if (className) td.className = className;
    return td;
}

function createDateCell(iso) {
    const td = document.createElement('td');
    td.className = 'date-cell';
    const bdi = document.createElement('bdi');   // يحمي ترتيب الأرقام في الصفحة العربية
    bdi.textContent = formatDate(iso);
    td.appendChild(bdi);
    return td;
}

function createMoneyCell(value) {
    const td = createCell(formatMoney(value), 'money-cell');
    if (value < 0) td.classList.add('negative');
    return td;
}

// شارة ملونة: kind = 'spender' (الجهة القائمة بالصرف) أو 'source' (المصدر)
function createTagCell(name, kind) {
    if (!name) return createCell('—', 'tag-cell');
    const td = document.createElement('td');
    td.className = 'tag-cell';
    const tag = document.createElement('span');
    tag.className = `tag tag-${kind}`;
    tag.textContent = name;
    td.appendChild(tag);
    return td;
}

function createBadgeCell(text) {
    const td = document.createElement('td');
    td.className = 'actions-cell';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = text;
    td.appendChild(badge);
    return td;
}

function createButton(text, className, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
}

// خلية أزرار التعديل والحذف (موحّدة في كل الجداول)
function createActionsCell(onEdit, onDelete, className = '') {
    const td = document.createElement('td');
    td.className = `actions-cell ${className}`.trim();
    const box = document.createElement('div');
    box.className = 'row-actions';
    box.appendChild(createButton('تعديل', 'btn btn-light btn-small', onEdit));
    box.appendChild(createButton('حذف', 'btn btn-danger btn-small', onDelete));
    td.appendChild(box);
    return td;
}

function emptyRow(body, text, columns) {
    const tr = document.createElement('tr');
    const td = createCell(text, 'empty-cell');
    td.colSpan = columns;
    tr.appendChild(td);
    body.appendChild(tr);
}

/* ---------- القوائم المنسدلة وقوائم الاختيار ---------- */
// يملأ قائمة منسدلة ويحافظ على الاختيار الحالي
function fillSelect(select, items, placeholder = null) {
    const current = select.value;
    select.innerHTML = '';

    if (placeholder) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = placeholder;
        select.appendChild(option);
    }
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
    });

    const exists = items.some(i => String(i.id) === current);
    select.value = exists ? current : (placeholder ? '' : (items[0] ? items[0].id : ''));
}

// قائمة اختيارات تحافظ على ما حدده المستخدم، والعناصر الجديدة تظهر محددة
function fillCheckList(container, items) {
    const known = new Set((container.dataset.known || '').split(',').filter(Boolean));
    const checked = new Set([...container.querySelectorAll('input:checked')].map(i => i.value));

    container.innerHTML = '';
    items.forEach(item => {
        const label = document.createElement('label');
        label.className = 'check-item';

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = item.id;
        box.checked = !known.has(String(item.id)) || checked.has(String(item.id));

        const text = document.createElement('span');
        text.textContent = item.name;

        label.append(box, text);
        container.appendChild(label);
    });
    container.dataset.known = items.map(i => i.id).join(',');
}

const getCheckedIds = container => [...container.querySelectorAll('input:checked')].map(i => Number(i.value));
const setAllChecked = (container, state) => container.querySelectorAll('input').forEach(i => { i.checked = state; });