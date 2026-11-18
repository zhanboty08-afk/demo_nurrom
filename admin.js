const $d = (id) => document.getElementById(id);
const productList = $d('productList');
const modal = $d('productModal');
const form = $d('productForm');
const notice = $d('adminToast');
const loginPanel = $d('loginPanel');
const dashboard = $d('dashboard');
const authMessage = $d('authMessage');
const statuses = ['Новый', 'Подтверждён', 'В доставке', 'Выполнен', 'Отменён'];
let products = [];
let orders = [];
let toastTimer;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));
const imageExtensions = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const maxImageBytes = 5 * 1024 * 1024;

function safeImageURL(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function say(message) {
  notice.textContent = message;
  notice.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => notice.classList.remove('show'), 3500);
}

function showLogin(message = '') {
  dashboard.hidden = true;
  loginPanel.hidden = false;
  authMessage.textContent = message;
  authMessage.hidden = !message;
  if (message) authMessage.classList.add('error');
  else authMessage.classList.remove('error');
}

function isAdmin(session) {
  return session?.user?.app_metadata?.role === 'admin';
}

function authErrorMessage(error) {
  const message = String(error?.message || error || 'Неизвестная ошибка');
  if (/email_not_confirmed|email not confirmed/i.test(message)) {
    return 'Сначала подтвердите адрес почты по ссылке из письма-приглашения.';
  }
  if (/invalid login credentials|invalid_credentials/i.test(message)) {
    return 'Почта или пароль не совпадают. Проверьте данные и раскладку клавиатуры.';
  }
  return `Не удалось войти: ${message}`;
}

async function openDashboard(session) {
  if (!isAdmin(session)) {
    try { await db.auth.signOut(); } catch { /* The database still rejects non-admin requests. */ }
    showLogin('Аккаунт найден, но ему не выдана роль администратора. Выполните инструкцию в README.txt, затем войдите снова.');
    return;
  }

  loginPanel.hidden = true;
  dashboard.hidden = false;
  await Promise.all([loadProducts(), loadOrders()]);
}

async function boot() {
  try {
    const { data, error } = await db.auth.getSession();
    if (error) return showLogin(`Не удалось проверить сессию: ${error.message}`);
    if (!data.session) return showLogin();
    await openDashboard(data.session);
  } catch (error) {
    showLogin(`Не удалось подключиться к Supabase: ${error.message || error}`);
  }
}

async function loadProducts() {
  productList.innerHTML = '<div class="empty-admin">Загружаем каталог…</div>';
  try {
    const { data, error } = await db.from('products').select('*').order('id');
    if (error) {
      productList.innerHTML = `<div class="empty-admin">Не удалось загрузить товары: ${esc(error.message)}<br>Проверьте, что выполнен supabase-admin-setup.sql.</div>`;
      return;
    }
    products = data || [];
    const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
    const filter = $d('categoryFilter');
    const selected = filter.value;
    filter.innerHTML = '<option value="">Все категории</option>' + categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('');
    filter.value = categories.includes(selected) ? selected : '';
    renderProducts();
  } catch (error) {
    productList.innerHTML = `<div class="empty-admin">Не удалось подключиться к каталогу: ${esc(error.message || error)}</div>`;
  }
}

function renderProducts() {
  const query = $d('productSearch').value.trim().toLowerCase();
  const category = $d('categoryFilter').value;
  const visible = products.filter((product) =>
    (!category || product.category === category)
    && `${product.name} ${product.category} ${product.material || ''} ${product.color || ''} ${product.dimensions || ''} ${product.availability || ''}`.toLowerCase().includes(query));

  $d('productCount').textContent = `Показано ${visible.length} из ${products.length}`;
  productList.innerHTML = visible.length
    ? visible.map((product) => `<article class="admin-product">
        <img src="${esc(safeImageURL(product.image) || 'data:,')}" alt="Фото ${esc(product.name)}">
        <div class="admin-product-info">
          <h3>${esc(product.name)}</h3>
          <p>${esc(product.category)}${product.material ? ` · ${esc(product.material)}` : ''}${product.color ? ` · ${esc(product.color)}` : ''}${product.dimensions ? ` · ${esc(product.dimensions)}` : ''} · ${esc(product.availability || 'Наличие уточнить')}</p>
          ${Array.isArray(product.gallery) && product.gallery.length ? `<p>Дополнительных фото: ${product.gallery.length}</p>` : ''}
          ${product.description ? `<p>${esc(product.description)}</p>` : ''}
          <strong>${money(product.price)}</strong>${product.old_price ? ` <del>${money(product.old_price)}</del>` : ''}
        </div>
        <div class="product-actions">
          <button class="small-btn" data-edit="${esc(product.id)}">Редактировать</button>
          <button class="small-btn delete" data-delete="${esc(product.id)}">Удалить</button>
        </div>
      </article>`).join('')
    : '<div class="empty-admin">Товары не найдены.</div>';
}

function openEditor(product = null) {
  form.reset();
  form.elements.id.value = product?.id ?? '';
  for (const name of ['name', 'category', 'price', 'old_price', 'material', 'color', 'dimensions', 'availability', 'description', 'badge']) {
    form.elements[name].value = product?.[name] ?? '';
  }
  form.elements.availability.value = product?.availability || 'Уточнить';
  form.elements.image_url.value = product?.image ?? '';
  form.elements.gallery_urls.value = Array.isArray(product?.gallery) ? product.gallery.join('\n') : '';
  const preview = $d('imagePreview');
  preview.hidden = !product?.image;
  preview.src = product?.image || '';
  $d('formTitle').textContent = product ? 'Редактировать товар' : 'Новый товар';
  modal.classList.add('show');
}

async function deleteProduct(id) {
  try {
    const { error } = await db.from('products').delete().eq('id', id);
    if (error) return say(`Не удалось удалить товар: ${error.message}`);
    say('Товар удалён');
    await loadProducts();
  } catch (error) {
    say(`Не удалось подключиться к каталогу: ${error.message || error}`);
  }
}

async function saveProduct(event) {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const values = new FormData(form);
    const id = values.get('id');
    const file = values.get('photo');
    const galleryFiles = values.getAll('gallery_files').filter((item) => item instanceof File && item.size);
    const price = Number(values.get('price'));
    const oldPriceInput = values.get('old_price');
    const oldPrice = oldPriceInput ? Number(oldPriceInput) : null;
    if (!Number.isSafeInteger(price) || price < 1 || (oldPrice !== null && (!Number.isSafeInteger(oldPrice) || oldPrice < 1))) {
      return say('Укажите корректную цену товара.');
    }
    let image = values.get('image_url').trim() || products.find((product) => String(product.id) === id)?.image || '';

    if (file?.size) {
      const extension = imageExtensions.get(file.type);
      if (!extension) return say('Загрузите фото в формате JPG, PNG или WebP.');
      if (file.size > maxImageBytes) return say('Размер фото не должен превышать 5 МБ.');
      const path = `${crypto.randomUUID()}.${extension}`;
      const { error } = await db.storage.from('product-images').upload(path, file, { upsert: false, contentType: file.type });
      if (error) return say(`Не удалось загрузить фото: ${error.message}`);
      image = db.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    image = safeImageURL(image);
    if (!image) return say('Добавьте безопасную HTTPS-ссылку на фото или выберите файл.');

    const rawGallery = String(values.get('gallery_urls') || '').split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    let gallery = rawGallery.map(safeImageURL);
    if (gallery.some((url) => !url)) return say('Дополнительные фото должны быть HTTPS-ссылками.');
    if (galleryFiles.length + gallery.length > 8) return say('Добавьте не больше 8 дополнительных фотографий.');
    for (const galleryFile of galleryFiles) {
      const extension = imageExtensions.get(galleryFile.type);
      if (!extension) return say('Загрузите фото в формате JPG, PNG или WebP.');
      if (galleryFile.size > maxImageBytes) return say('Размер каждого фото не должен превышать 5 МБ.');
      const path = `${crypto.randomUUID()}.${extension}`;
      const { error } = await db.storage.from('product-images').upload(path, galleryFile, { upsert: false, contentType: galleryFile.type });
      if (error) return say(`Не удалось загрузить фото: ${error.message}`);
      gallery.push(db.storage.from('product-images').getPublicUrl(path).data.publicUrl);
    }
    gallery = [...new Set(gallery)].filter((url) => url !== image);

    const row = {
      name: values.get('name').trim(),
      category: values.get('category').trim(),
      price,
      old_price: oldPrice,
      material: values.get('material').trim(),
      color: values.get('color').trim(),
      dimensions: values.get('dimensions').trim(),
      availability: values.get('availability'),
      gallery,
      description: values.get('description').trim(),
      badge: values.get('badge').trim(),
      image,
    };
    const result = id
      ? await db.from('products').update(row).eq('id', id)
      : await db.from('products').insert(row);
    if (result.error) return say(`Не удалось сохранить товар: ${result.error.message}`);
    modal.classList.remove('show');
    say(id ? 'Товар обновлён' : 'Товар добавлен');
    await loadProducts();
  } catch (error) {
    say(`Не удалось сохранить товар: ${error.message || error}`);
  } finally {
    submit.disabled = false;
  }
}

async function loadOrders() {
  const box = $d('orderList');
  box.innerHTML = '<div class="empty-admin">Загружаем заказы…</div>';
  try {
    const { data, error } = await db.from('orders').select('*').order('created_at', { ascending: false });
    if (error) {
      box.innerHTML = `<div class="empty-admin">Не удалось загрузить заказы: ${esc(error.message)}<br>Проверьте, что выполнен supabase-setup.sql.</div>`;
      return;
    }
    orders = data || [];
    box.innerHTML = orders.length
      ? orders.map((order) => `<article class="admin-product order">
          <div class="admin-product-info">
            <h3>${esc(order.order_number || order.number)} · ${money(order.total)}</h3>
            <p>${new Date(order.created_at).toLocaleString('ru-RU')}</p>
            <p><b>${esc(order.customer?.name)}</b> · <a href="tel:${esc(order.customer?.phone)}">${esc(order.customer?.phone)}</a> · ${esc(order.customer?.address)}</p>
            ${order.customer?.comment ? `<p>«${esc(order.customer.comment)}»</p>` : ''}
            <p>${(order.items || []).map((item) => `${esc(item.name)} × ${esc(item.qty)}`).join(', ')}</p>
          </div>
          <select data-order="${esc(order.id)}" aria-label="Статус заказа">${statuses.map((status) => `<option${status === order.status ? ' selected' : ''}>${status}</option>`).join('')}</select>
        </article>`).join('')
      : '<div class="empty-admin">Заказов пока нет.</div>';
  } catch (error) {
    box.innerHTML = `<div class="empty-admin">Не удалось подключиться к заказам: ${esc(error.message || error)}</div>`;
  }
}

async function updateOrderStatus(select) {
  try {
    const { error } = await db.from('orders').update({ status: select.value }).eq('id', select.dataset.order);
    if (error) return say(`Не удалось обновить статус: ${error.message}`);
    say('Статус заказа обновлён');
  } catch (error) {
    say(`Не удалось обновить статус: ${error.message || error}`);
  }
}

function exportOrders() {
  const quote = (value) => {
    let text = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [
    ['Номер', 'Дата', 'Имя', 'Телефон', 'Адрес', 'Комментарий', 'Товары', 'Сумма', 'Статус'],
    ...orders.map((order) => [
      order.order_number || order.number,
      order.created_at,
      order.customer?.name,
      order.customer?.phone,
      order.customer?.address,
      order.customer?.comment,
      (order.items || []).map((item) => `${item.name} x${item.qty}`).join('; '),
      order.total,
      order.status,
    ]),
  ];
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map((row) => row.map(quote).join(',')).join('\n')], { type: 'text/csv' }));
  link.download = 'nurroom-orders.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

$d('productSearch').addEventListener('input', renderProducts);
$d('categoryFilter').addEventListener('change', renderProducts);
$d('addProduct').addEventListener('click', () => openEditor());
$d('closeModal').addEventListener('click', () => modal.classList.remove('show'));
modal.addEventListener('click', (event) => {
  if (event.target === modal) modal.classList.remove('show');
});
productList.addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit]');
  const remove = event.target.closest('[data-delete]');
  if (edit) openEditor(products.find((product) => String(product.id) === edit.dataset.edit));
  if (remove && confirm('Удалить товар из каталога?')) deleteProduct(remove.dataset.delete);
});
form.addEventListener('submit', saveProduct);
form.elements.photo.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!imageExtensions.has(file.type) || file.size > maxImageBytes) {
    event.target.value = '';
    $d('imagePreview').hidden = true;
    say('Загрузите JPG, PNG или WebP размером до 5 МБ.');
    return;
  }
  const preview = $d('imagePreview');
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
});
form.elements.image_url.addEventListener('input', (event) => {
  const preview = $d('imagePreview');
  const image = safeImageURL(event.target.value.trim());
  preview.src = image || '';
  preview.hidden = !image;
});
$d('orderList').addEventListener('change', (event) => {
  const select = event.target.closest('[data-order]');
  if (select) updateOrderStatus(select);
});
$d('refreshOrders').addEventListener('click', loadOrders);
$d('exportOrders').addEventListener('click', exportOrders);
$d('logout').addEventListener('click', async () => {
  try {
    const { error } = await db.auth.signOut();
    if (error) return say(`Не удалось выйти: ${error.message}`);
    showLogin();
  } catch (error) {
    say(`Не удалось выйти: ${error.message || error}`);
  }
});

$d('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  const values = new FormData(event.currentTarget);
  button.disabled = true;
  authMessage.hidden = true;
  try {
    const { data, error } = await db.auth.signInWithPassword({
      email: values.get('email').trim(),
      password: values.get('password'),
    });
    if (error) return showLogin(authErrorMessage(error));
    await openDashboard(data.session);
  } catch (error) {
    showLogin(authErrorMessage(error));
  } finally {
    button.disabled = false;
  }
});

boot();
setInterval(() => {
  if (!dashboard.hidden) loadOrders();
}, 30000);
