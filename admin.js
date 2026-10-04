const cfg=window.SUPABASE_CONFIG||{};
const client=(cfg.url&&cfg.anonKey&&window.supabase?.createClient)?window.supabase.createClient(cfg.url,cfg.anonKey):null;
let products=[];let settings={};let images={};
const $=id=>document.getElementById(id);
const msg=(id,text)=>{const el=$(id);if(el)el.textContent=text||''};
function needConfig(){if(!client){msg('loginMsg','Isi supabase-config.js terlebih dahulu dengan Project URL dan anon/publishable key Supabase.');return false}return true}
async function verifyAdmin(){
  const {data:{session}}=await client.auth.getSession();
  if(!session) return false;
  const {data,isAdmin,error}=await client.rpc('is_admin');
  if(error || data!==true) return false;
  return true;
}
async function loadAll(){
 const [{data:s,error:se},{data:p,error:pe}]=await Promise.all([client.from('site_settings').select('key,value'),client.from('products').select('*').order('category').order('sort_order')]);
 if(se||pe)throw se||pe; settings=(s?.find(x=>x.key==='site')?.value)||{};images=(s?.find(x=>x.key==='images')?.value)||{};products=p||[];fillSettings();renderImages();renderProducts('followers', $('followersTable'));renderProducts('account',$('accountsTable'));
}
function fillSettings(){['followerTitle','followerSubtitle','followerEyebrow','followerDiscount','accountTitle','accountEyebrow','accountDescription','contactEyebrow','contactTitle','contactWhatsapp'].forEach(id=>$(id).value=settings[id]||'')}
const imageLabels={logo:'Logo',header:'Header',followersBanner:'Banner Followers',accountBanner:'Banner Akun Premium',footer:'Footer'};
function renderImages(){const box=$('imageSettings');box.innerHTML=Object.entries(imageLabels).map(([key,label])=>`<div class="image-item"><img src="${images[key]||''}" alt="${label}"><strong>${label}</strong><input type="file" accept="image/*" data-image="${key}"></div>`).join('');box.querySelectorAll('input[type=file]').forEach(i=>i.onchange=()=>uploadSiteImage(i.dataset.image,i.files[0]));}
async function uploadSiteImage(key,file){if(!file)return;msg('imageMsg','Mengunggah '+imageLabels[key]+'...');const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`site/${key}-${Date.now()}.${ext}`;const {error}=await client.storage.from('site-assets').upload(path,file,{upsert:false,contentType:file.type});if(error){msg('imageMsg',error.message);return}const url=client.storage.from('site-assets').getPublicUrl(path).data.publicUrl;images[key]=url;await saveSetting('images',images);renderImages();msg('imageMsg',imageLabels[key]+' berhasil diubah.');}
async function saveSetting(key,value){const {error}=await client.from('site_settings').upsert({key,value,updated_at:new Date().toISOString()});if(error)throw error}
$('loginForm').onsubmit=async e=>{e.preventDefault();if(!needConfig())return;msg('loginMsg','Login...');const {error}=await client.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});if(error){msg('loginMsg',error.message);return}showPanel()};
$('logoutBtn').onclick=async()=>{await client.auth.signOut();location.reload()};
async function showPanel(){
  if(!(await verifyAdmin())){
    await client.auth.signOut();
    $('loginView').hidden=false;$('panelView').hidden=true;$('logoutBtn').hidden=true;
    msg('loginMsg','Akun berhasil login, tetapi belum terdaftar sebagai admin. Tambahkan UUID akun ke tabel public.admins di Supabase.');
    return;
  }
  $('loginView').hidden=true;$('panelView').hidden=false;$('logoutBtn').hidden=false;
  loadAll().catch(e=>msg('siteMsg',e.message));
}
$('saveSite').onclick=async()=>{const v={followerTitle:$('followerTitle').value,followerSubtitle:$('followerSubtitle').value,followerEyebrow:$('followerEyebrow').value,followerDiscount:$('followerDiscount').value,accountTitle:$('accountTitle').value,accountEyebrow:$('accountEyebrow').value,accountDescription:$('accountDescription').value,contactEyebrow:$('contactEyebrow').value,contactTitle:$('contactTitle').value,contactWhatsapp:$('contactWhatsapp').value};try{await saveSetting('site',v);settings=v;msg('siteMsg','Tulisan berhasil disimpan.')}catch(e){msg('siteMsg',e.message)}};
function renderProducts(category,box){const rows=products.filter(p=>p.category===category);box.innerHTML=rows.map(p=>`<div class="product-row" data-id="${p.id}"><img src="${p.image_url||''}" alt=""><label>Jumlah<input class="f-qty" type="number" value="${p.qty}"></label><label>Harga asli<input class="f-original" type="number" value="${p.original}"></label><label>Harga promo<input class="f-price" type="number" value="${p.price}"></label><label>Terjual/bln<input class="f-sold" value="${p.sold||''}"></label><div class="actions"><button class="btn btn-primary save-product">Simpan</button><button class="btn btn-danger delete-product">Hapus</button><input class="file-input product-file" type="file" accept="image/*"></div></div>`).join('')||'<p>Belum ada produk.</p>';box.querySelectorAll('.save-product').forEach(b=>b.onclick=()=>saveProduct(b.closest('.product-row')));box.querySelectorAll('.delete-product').forEach(b=>b.onclick=()=>deleteProduct(b.closest('.product-row')));box.querySelectorAll('.product-file').forEach(i=>i.onchange=()=>uploadProductImage(i.closest('.product-row'),i.files[0]));}
async function saveProduct(row){const id=row.dataset.id;const current=products.find(p=>p.id===id);const payload={category:current.category,qty:Number(row.querySelector('.f-qty').value),original:Number(row.querySelector('.f-original').value),price:Number(row.querySelector('.f-price').value),sold:row.querySelector('.f-sold').value,sort_order:current.sort_order,updated_at:new Date().toISOString()};const {error}=await client.from('products').update(payload).eq('id',id);if(error){alert(error.message);return}await loadAll();}
async function uploadProductImage(row,file){if(!file)return;const id=row.dataset.id;const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`products/${id}-${Date.now()}.${ext}`;const {error}=await client.storage.from('site-assets').upload(path,file,{upsert:false,contentType:file.type});if(error){alert(error.message);return}const url=client.storage.from('site-assets').getPublicUrl(path).data.publicUrl;const {error:e}=await client.from('products').update({image_url:url,updated_at:new Date().toISOString()}).eq('id',id);if(e){alert(e.message);return}await loadAll()}
async function deleteProduct(row){if(!confirm('Hapus produk ini?'))return;const {error}=await client.from('products').delete().eq('id',row.dataset.id);if(error){alert(error.message);return}await loadAll()}
async function addProduct(category){const count=products.filter(p=>p.category===category).length;const {error}=await client.from('products').insert({category,qty:100,original:0,price:0,sold:'',image_url:category==='account'?'assets/akun-premium-product.webp':'assets/100.webp',sort_order:count+1});if(error){alert(error.message);return}await loadAll()}
$('addFollower').onclick=()=>addProduct('followers');$('addAccount').onclick=()=>addProduct('account');
(async()=>{if(!needConfig())return;const {data}=await client.auth.getSession();if(data.session)await showPanel()})();
client?.auth.onAuthStateChange((_event,session)=>{if(!session){$('loginView').hidden=false;$('panelView').hidden=true;$('logoutBtn').hidden=true}});
