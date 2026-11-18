const $=id=>document.getElementById(id);
const grid=$('productGrid'),drawer=$('cartDrawer'),overlay=$('cartOverlay'),checkoutModal=$('checkoutModal'),toastEl=$('toast');
let products=[],category='Все',sortMode='default',toastTimer;
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeImageURL(value){try{const url=new URL(String(value||''),location.href);return url.protocol==='https:'?url.href:'data:,'}catch{return'data:,'}}
document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement&&event.target.classList.contains('product-image'))event.target.classList.add('image-failed')},true);
function toast(t,ms=2600){toastEl.textContent=t;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),ms)}
const productModal=$('productModal');
const lockScroll=()=>document.body.classList.toggle('scroll-locked',drawer.classList.contains('open')||checkoutModal.classList.contains('show')||productModal.classList.contains('show'));
function orderErrorMessage(error){
  const detail=[error?.code,error?.message,error?.details,error?.hint].filter(Boolean).join(' — ');
  const text=detail.toLowerCase();
  if(/pgrst202|could not find the function|schema cache|relation .*orders.* does not exist|undefined_table/.test(text))return'В Supabase не настроено оформление заказов. Выполните supabase-setup.sql в SQL Editor проекта.';
  if(/42501|permission denied|row-level security/.test(text))return'У Supabase недостаточно прав для оформления заказа. Повторно выполните supabase-setup.sql в SQL Editor проекта.';
  if(/корзина пуста|cart is empty/.test(text))return'В корзине больше нет доступных товаров. Обновите каталог и попробуйте снова.';
  if(/does not exist|undefined_column/.test(text))return'Настройки базы не совпадают с сайтом. Выполните supabase-admin-setup.sql и supabase-setup.sql в SQL Editor проекта.';
  return`Не удалось отправить заказ. Корзина оставлена без изменений. Код ошибки: ${error?.code||'без кода'}.`;
}

async function loadProducts(){
  grid.innerHTML='<div class="empty">Загружаем каталог…</div>';
  try{
    const{data,error}=await db.from('products').select('*').order('id');
    if(error)throw error;
    products=(data||[]).map(p=>({...p,id:String(p.id),oldPrice:p.old_price}));
    const orderableIds=new Set(products.filter(p=>p.availability!=='Нет в наличии').map(p=>p.id));
    saveCart(getCart().filter(item=>orderableIds.has(String(item.id))));
    renderFilters();renderProducts();renderCart();
  }catch(error){
    console.error('Не удалось загрузить каталог:',error);
    grid.innerHTML='<div class="empty">Не удалось загрузить каталог. Проверьте подключение к Supabase и настройки таблицы товаров.<br><button class="outline-btn retry-button" id="retry">Повторить</button></div>';
    $('retry').onclick=loadProducts;
  }
}
function populateFacet(id,values,label){
  const select=$(id),current=select.value,unique=[...new Set(values.map(value=>String(value||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  select.innerHTML=`<option value="">${label}</option>`+unique.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
  if(unique.includes(current))select.value=current;
  renderDropdown(select);
}
function renderDropdown(select){
  const wrapper=select.closest('.dropdown-control');if(!wrapper)return;
  const current=select.selectedOptions[0];
  wrapper.querySelector('.dropdown-current').textContent=current?.textContent||'';
  wrapper.querySelector('.dropdown-menu').innerHTML=[...select.options].map(option=>`<button type="button" class="dropdown-option${option.selected?' selected':''}" role="option" aria-selected="${option.selected}" data-dropdown-value="${esc(option.value)}" ${option.disabled?'disabled':''}>${esc(option.textContent)}</button>`).join('');
}
function enhanceDropdown(id,labelId=''){
  const select=$(id),wrapper=document.createElement('div');wrapper.className=`dropdown-control${id==='sortSelect'?' sort-dropdown':''}`;wrapper.dataset.dropdownFor=id;
  select.parentNode.insertBefore(wrapper,select);wrapper.append(select);select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const trigger=document.createElement('button');trigger.type='button';trigger.className='dropdown-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label',select.getAttribute('aria-label')||'Выбрать значение');
  const label=document.createElement('span');label.className='dropdown-current';label.id=`${id}Current`;
  const arrow=document.createElement('span');arrow.className='dropdown-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='';
  trigger.setAttribute('aria-controls',`${id}Menu`);if(labelId)trigger.setAttribute('aria-labelledby',`${labelId} ${label.id}`);
  trigger.append(label,arrow);
  const menu=document.createElement('div');menu.id=`${id}Menu`;menu.className='dropdown-menu';menu.setAttribute('role','listbox');if(labelId)menu.setAttribute('aria-labelledby',labelId);
  wrapper.append(trigger,menu);select.addEventListener('change',()=>renderDropdown(select));renderDropdown(select);
}
function closeDropdowns(except=null){document.querySelectorAll('.dropdown-control.open').forEach(wrapper=>{if(wrapper===except)return;wrapper.classList.remove('open');wrapper.querySelector('.dropdown-trigger').setAttribute('aria-expanded','false')})}
document.addEventListener('click',event=>{
  const option=event.target.closest('[data-dropdown-value]');
  if(option){const wrapper=option.closest('.dropdown-control'),select=$(wrapper.dataset.dropdownFor);select.value=option.dataset.dropdownValue;select.dispatchEvent(new Event('change',{bubbles:true}));closeDropdowns();wrapper.querySelector('.dropdown-trigger').focus();return}
  const trigger=event.target.closest('.dropdown-trigger');
  if(trigger){const wrapper=trigger.closest('.dropdown-control'),open=!wrapper.classList.contains('open');closeDropdowns(wrapper);wrapper.classList.toggle('open',open);trigger.setAttribute('aria-expanded',String(open));if(open){const selected=wrapper.querySelector('.dropdown-option.selected')||wrapper.querySelector('.dropdown-option');selected?.focus()}return}
  if(!event.target.closest('.dropdown-control'))closeDropdowns();
});
document.addEventListener('keydown',event=>{
  const wrapper=event.target.closest('.dropdown-control');if(!wrapper)return;
  const trigger=event.target.closest('.dropdown-trigger'),options=[...wrapper.querySelectorAll('.dropdown-option')],index=options.indexOf(event.target);
  if(trigger&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();closeDropdowns(wrapper);wrapper.classList.add('open');trigger.setAttribute('aria-expanded','true');(wrapper.querySelector('.dropdown-option.selected')||options[0])?.focus();return}
  if(index<0)return;
  let next=index;if(event.key==='ArrowDown')next=Math.min(options.length-1,index+1);else if(event.key==='ArrowUp')next=Math.max(0,index-1);else if(event.key==='Home')next=0;else if(event.key==='End')next=options.length-1;else return;
  event.preventDefault();options[next]?.focus();
});
function renderFilters(){
  const cats=['Все',...new Set(products.map(p=>p.category).filter(Boolean))];
  if(!cats.includes(category))category='Все';
  $('filters').innerHTML=cats.map(c=>`<button class="filter${c===category?' active':''}" data-category="${esc(c)}">${c==='Все'?'Все товары':esc(c)}</button>`).join('');
  populateFacet('materialFilter',products.map(p=>p.material),'Любой материал');
  populateFacet('colorFilter',products.map(p=>p.color),'Любой цвет');
  populateFacet('availabilityFilter',products.map(p=>p.availability||'Уточнить'),'Любое наличие');
}
function normalizedSize(value){return String(value||'').toLowerCase().replace(/[×*]/g,'x').replace(/\s+/g,'')}
function normalizeSearchText(value){return String(value??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\w\s\u0400-\u04ff]+/gi,' ').trim().replace(/\s+/g,' ')}
function productUnit(p){const type=String(p.category||'').toLowerCase();return type.includes('стул')?'за стул':type.includes('стол')?'за стол':'за товар'}
function availabilityLabel(p){return !p.availability||p.availability==='Уточнить'?'Уточним перед заказом':p.availability}
function productPhotos(p){return[p.image,...(Array.isArray(p.gallery)?p.gallery:[])].map(safeImageURL).filter(url=>url!=='data:,')}
function renderProducts(){
  const queryTokens=normalizeSearchText($('searchInput').value).split(' ').filter(Boolean),material=$('materialFilter').value,color=$('colorFilter').value,availability=$('availabilityFilter').value,size=normalizedSize($('sizeFilter').value);
  let list=products.filter(p=>{
    const searchable=normalizeSearchText([p.name,p.category,p.description,p.material,p.color,p.dimensions,p.availability,p.badge,money(p.price),p.price,p.oldPrice?money(p.oldPrice):'',p.oldPrice].filter(value=>value!==null&&value!==undefined).join(' '));
    const matchesQuery=queryTokens.every(token=>searchable.includes(token));
    return(category==='Все'||p.category===category)&&(!material||p.material===material)&&(!color||p.color===color)&&(!availability||(p.availability||'Уточнить')===availability)&&(!size||normalizedSize(p.dimensions).includes(size))&&matchesQuery;
  });
  if(sortMode==='asc')list.sort((a,b)=>a.price-b.price);if(sortMode==='desc')list.sort((a,b)=>b.price-a.price);
  grid.innerHTML=list.length?list.map(p=>{
    const sale=p.oldPrice>p.price?`<span class="product-badge sale-badge">−${Math.round(100-p.price/p.oldPrice*100)}%</span>`:'';
    const state=availabilityLabel(p);
    const unavailable=state==='Нет в наличии';
    const specs=[p.material,p.color,p.dimensions].filter(Boolean).map(esc).join(' · ');
    return`<article class="product-card"><button type="button" class="product-photo product-open" data-detail="${esc(p.id)}" aria-label="Подробнее о товаре: ${esc(p.name)}"><img class="product-image" src="${esc(safeImageURL(p.image))}" alt="${esc(p.name)}" width="800" height="1000" loading="lazy">${p.badge?`<span class="product-badge">${esc(p.badge)}</span>`:sale}</button><div class="product-meta"><div class="product-title-row"><h3>${esc(p.name)}</h3><span class="price">${money(p.price)}</span></div><p class="price-unit">${productUnit(p)}</p><p class="product-specs">${specs||'Характеристики уточняются'}</p><p class="product-availability">${esc(state)}</p><p class="product-delivery">Доставка: уточнить по городу</p><div class="product-card-actions"><button type="button" class="outline-btn" data-detail="${esc(p.id)}">Подробнее</button><button type="button" class="primary-btn" data-add="${esc(p.id)}" ${unavailable?'disabled':''}>${unavailable?'Нет в наличии':'В корзину'}</button></div></div></article>`}).join(''):'<div class="empty">Подходящих товаров нет. Измените параметры фильтра.</div>';
}
function openProduct(id){
  const p=products.find(item=>item.id===String(id));if(!p)return;
  const photos=productPhotos(p),image=$('productDetailImage');image.src=photos[0]||'data:,';image.alt=p.name;
  $('productDetailCategory').textContent=p.category||'Товар';$('productDetailName').textContent=p.name;$('productDetailPrice').textContent=`${money(p.price)} ${productUnit(p)}`;
  $('productDetailDescription').textContent=p.description||'Описание товара уточните при оформлении заявки.';
  const specs=[['Материал',p.material],['Цвет',p.color],['Размер',p.dimensions],['Наличие',availabilityLabel(p)]].filter(([,value])=>value);
  $('productDetailSpecs').innerHTML=specs.map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('');
  $('productThumbnails').innerHTML=photos.map((src,index)=>`<button type="button" class="product-thumbnail${index===0?' active':''}" data-photo-index="${index}" aria-label="Фото ${index+1} товара ${esc(p.name)}"><img src="${esc(src)}" alt=""></button>`).join('');
  const addButton=$('productDetailAdd');addButton.dataset.add=p.id;addButton.disabled=(p.availability||'')==='Нет в наличии';addButton.textContent=addButton.disabled?'Нет в наличии':'В корзину +';
  productModal.classList.add('show');lockScroll();$('closeProduct').focus();
}
function cartItems(){return getCart().map(c=>({...products.find(p=>p.id===String(c.id)),qty:Math.min(20,Math.max(1,c.qty))})).filter(p=>p.id)}
function renderCart(){
  const items=cartItems(),total=items.reduce((s,p)=>s+p.price*p.qty,0);
  $('cartCount').textContent=items.reduce((s,p)=>s+p.qty,0);$('cartTotal').textContent=$('checkoutTotal').textContent=money(total);$('checkoutBtn').disabled=!items.length;
  $('cartItems').innerHTML=items.length?items.map(p=>`<div class="cart-row"><img src="${esc(safeImageURL(p.image))}" alt=""><div><h4>${esc(p.name)}</h4><p>${money(p.price)} × ${p.qty} = <b>${money(p.price*p.qty)}</b></p><div class="quantity"><button data-qty="${esc(p.id)}" data-delta="-1" aria-label="Меньше">−</button><span>${p.qty}</span><button data-qty="${esc(p.id)}" data-delta="1" aria-label="Больше">+</button></div></div><button class="remove" data-remove="${esc(p.id)}">Удалить</button></div>`).join(''):'<div class="empty">Корзина пока пуста.<br>Добавьте понравившуюся мебель.</div>';
}
function setQty(id,delta){const c=getCart(),i=c.find(x=>String(x.id)===id);if(i)i.qty=Math.min(20,i.qty+delta);saveCart(c.filter(x=>x.qty>0));renderCart()}
function add(id){const product=products.find(item=>item.id===id);if(!product||product.availability==='Нет в наличии')return;const c=getCart(),i=c.find(x=>String(x.id)===id);i?i.qty=Math.min(20,i.qty+1):c.push({id,qty:1});saveCart(c);renderCart();toast('Добавлено в корзину')}
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-add]'),q=e.target.closest('[data-qty]'),r=e.target.closest('[data-remove]'),f=e.target.closest('[data-category]'),detail=e.target.closest('[data-detail]'),photo=e.target.closest('[data-photo-index]');
  if(a)add(a.dataset.add);if(q)setQty(q.dataset.qty,+q.dataset.delta);
  if(r){saveCart(getCart().filter(x=>String(x.id)!==r.dataset.remove));renderCart()}
  if(f){category=f.dataset.category;renderFilters();renderProducts()}
  if(detail)openProduct(detail.dataset.detail);
  if(photo){$('productDetailImage').src=photo.querySelector('img').src;document.querySelectorAll('.product-thumbnail').forEach(button=>button.classList.toggle('active',button===photo))}
});
$('searchInput').addEventListener('input',renderProducts);
$('materialFilter').addEventListener('change',renderProducts);$('colorFilter').addEventListener('change',renderProducts);$('availabilityFilter').addEventListener('change',renderProducts);$('sizeFilter').addEventListener('input',renderProducts);
$('sortSelect').addEventListener('change',e=>{sortMode=e.target.value;renderProducts()});
function openCart(){drawer.classList.add('open');overlay.classList.add('show');lockScroll()}
function closeCart(){drawer.classList.remove('open');overlay.classList.remove('show');lockScroll()}
function closeCheckout(){checkoutModal.classList.remove('show');lockScroll()}
function closeProduct(){productModal.classList.remove('show');lockScroll()}
$('openCart').onclick=openCart;$('closeCart').onclick=closeCart;overlay.onclick=closeCart;
$('closeCheckout').onclick=closeCheckout;$('closeProduct').onclick=closeProduct;checkoutModal.addEventListener('click',e=>{if(e.target===checkoutModal)closeCheckout()});productModal.addEventListener('click',e=>{if(e.target===productModal)closeProduct()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCart();closeCheckout();closeProduct();closeMobileMenu();closeDropdowns()}});
$('checkoutBtn').onclick=()=>{if(cartItems().length){closeCart();checkoutModal.classList.add('show');lockScroll()}};
$('checkoutBtn').addEventListener('click',()=>{
  $('checkoutFields').hidden=false;
  $('checkoutSuccess').hidden=true;
  $('formError').textContent='';
});
$('successClose').onclick=closeCheckout;
$('checkoutForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget,err=$('formError'),btn=form.querySelector('[type=submit]'),d=Object.fromEntries(new FormData(form)),items=cartItems();
  err.textContent='';if(!items.length)return;
  const phoneDigits=d.phone.replace(/\D/g,'').length;
  if(phoneDigits<10||phoneDigits>15){err.textContent='Укажите телефон полностью, например +7 700 123 45 67.';return}
  btn.disabled=true;
  try{
    const{data,error}=await db.rpc('create_order',{p_customer:{name:d.name.trim(),phone:d.phone.trim(),address:d.address.trim(),comment:(d.comment||'').trim()},p_items:items.map(p=>({id:p.id,qty:p.qty}))});
    if(error)throw error;
    const orderNumber=String(data||'').trim();
    saveCart([]);renderCart();form.reset();
    $('checkoutFields').hidden=true;
    $('checkoutSuccess').hidden=false;
    $('successOrderNumber').textContent=orderNumber?`Номер заказа: ${orderNumber}`:'Заказ сохранён.';
    const whatsappNumber=String(WHATSAPP_ORDER_NUMBER||'').replace(/\D/g,'');
    const whatsappLink=$('whatsAppOrderLink'),whatsappHint=$('whatsAppHint');
    if(/^\d{10,15}$/.test(whatsappNumber)){
      const now=new Date();
      const orderDate=`${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(now)}, ${new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now)}`;
      const total=items.reduce((sum,item)=>sum+item.price*item.qty,0);
      const lines=[
        'Здравствуйте! 👋 Хотел(а) бы оформить заказ в интернет-магазине NURROOM.',
        '',
        'Ниже направляю детали моего заказа:',
        '',
        '📦 *Детали заказа:*',
        `• Номер заказа: *${orderNumber||'не указан'}*`,
        `• Дата: ${orderDate}`,
        '',
        '🛒 *Состав заказа:*',
        ...items.map((item,index)=>`${index+1}. ${item.name} — ${item.qty} шт. | ${money(item.price*item.qty)}`),
        '',
        `🔹 *Итого к оплате:* ${money(total)}`,
        '',
        '📍 *Данные для доставки:*',
        `• Имя: ${d.name.trim()}`,
        `• Телефон: ${d.phone.trim()}`,
        `• Адрес: ${d.address.trim()}`,
        d.comment?.trim()?`• Комментарий: ${d.comment.trim()}`:null
      ].filter(line=>line!==null).join('\n');
      whatsappLink.href=`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(lines)}`;
      whatsappHint.textContent='Откроется чат WhatsApp с магазином и готовым сообщением. Проверьте заказ и нажмите «Отправить»; заказ уже сохранён на сайте.';
      whatsappLink.hidden=false;whatsappHint.hidden=false;
    }else{
      whatsappLink.hidden=true;whatsappLink.removeAttribute('href');
      whatsappHint.textContent='Заказ уже сохранён. Для подтверждения деталей магазин свяжется с вами по указанному телефону.';
      whatsappHint.hidden=false;
    }
  }catch(error){
    console.error('Не удалось отправить заказ:',error);
    err.textContent=orderErrorMessage(error);
  }finally{btn.disabled=false}
});
function closeMobileMenu(){$('siteNav').classList.remove('is-open');$('mobileMenu').setAttribute('aria-expanded','false');$('mobileMenu').setAttribute('aria-label','Открыть меню');$('mobileMenu').textContent='☰'}
$('mobileMenu').addEventListener('click',()=>{const open=$('mobileMenu').getAttribute('aria-expanded')!=='true';$('mobileMenu').setAttribute('aria-expanded',String(open));$('mobileMenu').setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');$('mobileMenu').textContent=open?'×':'☰';$('siteNav').classList.toggle('is-open',open)});
$('siteNav').addEventListener('click',event=>{if(event.target.closest('a'))closeMobileMenu()});
const publicWhatsApp=String(WHATSAPP_ORDER_NUMBER||'').replace(/\D/g,'');
if(/^\d{10,15}$/.test(publicWhatsApp)){for(const id of ['headerWhatsapp','footerWhatsapp','menuWhatsapp']){$(id).href=`https://wa.me/${publicWhatsApp}`;$(id).hidden=false}}
enhanceDropdown('materialFilter','materialFilterLabel');enhanceDropdown('colorFilter','colorFilterLabel');enhanceDropdown('availabilityFilter','availabilityFilterLabel');enhanceDropdown('sortSelect');
const themeButton=$('themeToggle');
function applyTheme(t){document.documentElement.dataset.theme=t;localStorage.setItem('forma_theme',t);themeButton.innerHTML=(t==='dark'?'☀':'☾')+'<span>Тема</span>';themeButton.setAttribute('aria-label',t==='dark'?'Включить светлую тему':'Включить тёмную тему')}
applyTheme(localStorage.getItem('forma_theme')||'light');
themeButton.addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
loadProducts();
