/* global firebase, firebaseConfig, CORREOS_PROPIETARIOS, WHATSAPP_NUMERO */

const STORAGE_CARRITO = 'caroBoutique_carrito';
const STORAGE_FAVORITOS = 'caroBoutique_favoritos';
const STORAGE_CLIENTE = 'caroBoutique_cliente';
const DIAS_NUEVO = 14;

const TAMANIO_LABELS = { pequeno: 'Pequeño', mediano: 'Mediano', grande: 'Grande' };
const COLOR_LABELS = {
  rosa: 'Rosa', rojo: 'Rojo', negro: 'Negro', blanco: 'Blanco', dorado: 'Dorado',
  azul: 'Azul', verde: 'Verde', violeta: 'Violeta', nude: 'Nude', multicolor: 'Multicolor'
};

const VISTAS = {
  inicio: 'vista-inicio',
  catalogo: 'vista-catalogo',
  personalizacion: 'vista-personalizacion',
  accesos: 'vista-accesos',
  carrito: 'vista-carrito',
  admin: 'vista-admin'
};

let productos = [];
let carrito = cargarJSON(STORAGE_CARRITO, []);
let favoritos = cargarJSON(STORAGE_FAVORITOS, []);
let usuarioActual = null;
let esPropietaria = false;
let imagenFinal = null;
let imagenOriginalData = null;
let db = null;
let firebaseListo = false;

// ─── Utilidades ───

function cargarJSON(key, fallback) {
  try {
    const d = localStorage.getItem(key);
    return d ? JSON.parse(d) : fallback;
  } catch { return fallback; }
}

function guardarCarrito() { localStorage.setItem(STORAGE_CARRITO, JSON.stringify(carrito)); }
function guardarFavoritos() { localStorage.setItem(STORAGE_FAVORITOS, JSON.stringify(favoritos)); }

function formatearPrecio(n) {
  return '$' + Number(n).toLocaleString('es-AR');
}

function mostrarToast(msg) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function esNuevo(fecha) {
  return Date.now() - new Date(fecha).getTime() < DIAS_NUEVO * 86400000;
}

function obtenerColorHex(sel) {
  return sel.options[sel.selectedIndex].dataset.hex || '#d87093';
}

function cargarImagen(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function firebaseConfigurado() {
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('TU_API');
}

// ─── Firebase ───

function initFirebase() {
  if (!firebaseConfigurado()) {
    mostrarAvisoFirebase();
    productos = cargarJSON('caroBoutique_productos_backup', []);
    actualizarCatalogo();
    return;
  }

  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    firebaseListo = true;

    firebase.auth().onAuthStateChanged(user => {
      usuarioActual = user;
      esPropietaria = user && CORREOS_PROPIETARIOS.includes(user.email.toLowerCase());
      actualizarUIPropietaria();
    });

    db.collection('productos').orderBy('fecha', 'desc').onSnapshot(snap => {
      productos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      actualizarCatalogo();
      if (esPropietaria) renderAdminLista();
    }, err => {
      console.error(err);
      mostrarToast('Error al cargar productos. Revisá la configuración de Firebase.');
    });
  } catch (e) {
    console.error(e);
    mostrarAvisoFirebase();
  }
}

function mostrarAvisoFirebase() {
  if (document.getElementById('firebase-aviso')) return;
  const aviso = document.createElement('div');
  aviso.id = 'firebase-aviso';
  aviso.className = 'firebase-aviso';
  aviso.innerHTML = '⚠️ Configurá Firebase en <strong>firebase-config.js</strong> para que todos vean los mismos productos.';
  document.body.prepend(aviso);
}

// ─── Navegación ───

function irAVista(nombre) {
  const id = VISTAS[nombre];
  if (!id) return;

  if (nombre === 'admin' && !esPropietaria) {
    mostrarToast('Ingresá como propietaria en Accesos.');
    irAVista('accesos');
    return;
  }

  document.querySelectorAll('.vista').forEach(v => v.classList.remove('activa'));
  document.getElementById(id).classList.add('activa');

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('activo', l.dataset.nav === nombre);
  });

  document.getElementById('site-nav').classList.remove('abierto');

  if (nombre === 'carrito') renderCarritoPagina();
  if (nombre === 'admin' && esPropietaria) {
    document.getElementById('admin-contenido').style.display = 'block';
    document.getElementById('admin-sin-sesion').style.display = 'none';
    renderAdminLista();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initNavegacion() {
  function manejarHash() {
    const hash = (location.hash || '#inicio').slice(1);
    irAVista(VISTAS[hash] ? hash : 'inicio');
  }

  window.addEventListener('hashchange', manejarHash);
  manejarHash();

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const dest = el.dataset.nav;
      location.hash = dest;
    });
  });

  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('site-nav').classList.toggle('abierto');
  });
}

// ─── Propietaria / Auth ───

function actualizarUIPropietaria() {
  const navAdmin = document.getElementById('nav-admin');
  const panelLogin = document.getElementById('panel-login-propietaria');
  const panelLogueada = document.getElementById('panel-owner-logueada');
  const adminContenido = document.getElementById('admin-contenido');
  const adminSinSesion = document.getElementById('admin-sin-sesion');

  if (esPropietaria) {
    navAdmin.style.display = '';
    panelLogin.style.display = 'none';
    panelLogueada.style.display = 'block';
    document.getElementById('owner-email-activo').textContent = usuarioActual.email;
    adminContenido.style.display = 'block';
    adminSinSesion.style.display = 'none';
    renderAdminLista();
  } else {
    navAdmin.style.display = 'none';
    panelLogin.style.display = 'block';
    panelLogueada.style.display = 'none';
    adminContenido.style.display = 'none';
    adminSinSesion.style.display = 'block';
  }
}

async function loginPropietaria() {
  if (!firebaseListo) {
    mostrarToast('Configurá Firebase primero.');
    return;
  }
  const email = document.getElementById('owner-email').value.trim().toLowerCase();
  const pass = document.getElementById('owner-password').value;
  if (!email || !pass) {
    mostrarToast('Completá email y contraseña.');
    return;
  }
  if (!CORREOS_PROPIETARIOS.includes(email)) {
    mostrarToast('Este email no está autorizado.');
    return;
  }
  try {
    await firebase.auth().signInWithEmailAndPassword(email, pass);
    mostrarToast('Bienvenida, modo propietaria activado.');
    location.hash = 'admin';
  } catch (e) {
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      mostrarToast('Credenciales incorrectas. ¿Primera vez? Creá tu cuenta.');
    } else {
      mostrarToast('Error al ingresar: ' + e.message);
    }
  }
}

async function registroPropietaria() {
  if (!firebaseListo) return;
  const email = document.getElementById('owner-email').value.trim().toLowerCase();
  const pass = document.getElementById('owner-password').value;
  if (!CORREOS_PROPIETARIOS.includes(email)) {
    mostrarToast('Solo emails autorizados pueden registrarse.');
    return;
  }
  if (pass.length < 6) {
    mostrarToast('La contraseña debe tener al menos 6 caracteres.');
    return;
  }
  try {
    await firebase.auth().createUserWithEmailAndPassword(email, pass);
    mostrarToast('Cuenta creada. Ya podés publicar moños.');
    location.hash = 'admin';
  } catch (e) {
    mostrarToast(e.message);
  }
}

function logoutPropietaria() {
  if (firebaseListo) firebase.auth().signOut();
  mostrarToast('Sesión cerrada.');
  location.hash = 'inicio';
}

function guardarCliente() {
  const nombre = document.getElementById('cliente-nombre').value.trim();
  const email = document.getElementById('cliente-email').value.trim();
  if (!nombre || !email) {
    mostrarToast('Completá nombre y email.');
    return;
  }
  localStorage.setItem(STORAGE_CLIENTE, JSON.stringify({ nombre, email }));
  document.getElementById('cliente-guardado-msg').textContent = '✓ Datos guardados en este dispositivo.';
  document.getElementById('pedido-nombre').value = nombre;
  document.getElementById('pedido-contacto').value = email;
  mostrarToast('Datos guardados. Se usarán en tus pedidos.');
}

function cargarClienteGuardado() {
  const c = cargarJSON(STORAGE_CLIENTE, null);
  if (!c) return;
  document.getElementById('cliente-nombre').value = c.nombre || '';
  document.getElementById('cliente-email').value = c.email || '';
  document.getElementById('pedido-nombre').value = c.nombre || '';
  document.getElementById('pedido-contacto').value = c.email || '';
  document.getElementById('cliente-guardado-msg').textContent = '✓ Datos guardados en este dispositivo.';
}

// ─── Imágenes ───

async function comprimirImagen(dataUrl, maxAncho = 800) {
  const img = await cargarImagen(dataUrl);
  let w = img.width, h = img.height;
  if (w > maxAncho) { h = Math.round(h * (maxAncho / w)); w = maxAncho; }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function procesarFondoBlanco(dataUrl, tolerancia) {
  const img = await cargarImagen(dataUrl);
  let w = img.width, h = img.height;
  if (w > 1000) { h = Math.round(h * (1000 / w)); w = 1000; }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const puntos = [[0,0],[w-1,0],[0,h-1],[w-1,h-1],[Math.floor(w/2),0],[Math.floor(w/2),h-1],[0,Math.floor(h/2)],[w-1,Math.floor(h/2)]];
  const samples = puntos.map(([x,y]) => { const i = (y*w+x)*4; return [data[i],data[i+1],data[i+2]]; });
  const bgR = samples.reduce((s,p)=>s+p[0],0)/8;
  const bgG = samples.reduce((s,p)=>s+p[1],0)/8;
  const bgB = samples.reduce((s,p)=>s+p[2],0)/8;
  const umbral = tolerancia * 2.8, suav = umbral * 0.55;
  for (let i = 0; i < data.length; i += 4) {
    const dist = Math.sqrt((data[i]-bgR)**2+(data[i+1]-bgG)**2+(data[i+2]-bgB)**2);
    if (dist < umbral) {
      const m = dist < umbral - suav ? 0 : (dist - (umbral - suav)) / suav;
      data[i] = Math.round(255*(1-m)+data[i]*m);
      data[i+1] = Math.round(255*(1-m)+data[i+1]*m);
      data[i+2] = Math.round(255*(1-m)+data[i+2]*m);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const fin = document.createElement('canvas');
  fin.width = w; fin.height = h;
  const fctx = fin.getContext('2d');
  fctx.fillStyle = '#fff';
  fctx.fillRect(0,0,w,h);
  fctx.drawImage(canvas,0,0);
  return fin.toDataURL('image/jpeg', 0.8);
}

function leerArchivo(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function manejarImagen(file) {
  if (!file?.type.startsWith('image/')) { mostrarToast('Imagen no válida.'); return; }
  imagenOriginalData = await leerArchivo(file);
  imagenFinal = null;
  document.getElementById('preview-original').src = imagenOriginalData;
  document.getElementById('preview-procesada').src = '';
  document.getElementById('herramienta-fondo').style.display = 'block';
  document.getElementById('btn-publicar').disabled = true;
}

async function quitarFondoPremium() {
  if (!imagenOriginalData) return;
  try {
    const tol = parseInt(document.getElementById('sensibilidad-fondo').value, 10);
    imagenFinal = await procesarFondoBlanco(imagenOriginalData, tol);
    document.getElementById('preview-procesada').src = imagenFinal;
    document.getElementById('btn-publicar').disabled = false;
    mostrarToast('Fondo procesado. Revisá el resultado.');
  } catch { mostrarToast('Error al procesar. Usá la original.'); }
}

async function usarOriginal() {
  if (!imagenOriginalData) return;
  imagenFinal = await comprimirImagen(imagenOriginalData);
  document.getElementById('preview-procesada').src = imagenFinal;
  document.getElementById('btn-publicar').disabled = false;
}

// ─── Productos (Firestore) ───

async function publicarMono() {
  if (!esPropietaria || !firebaseListo) {
    mostrarToast('Ingresá como propietaria.');
    return;
  }
  const titulo = document.getElementById('nuevo-nombre').value.trim();
  const valor = parseFloat(document.getElementById('nuevo-precio').value);
  const descripcion = document.getElementById('nuevo-descripcion').value.trim();
  const tamanio = document.getElementById('nuevo-tamanio').value;
  const colorSel = document.getElementById('nuevo-color');
  const color = colorSel.value;
  const colorHex = obtenerColorHex(colorSel);
  const stock = parseInt(document.getElementById('nuevo-stock').value, 10) || 0;

  if (!titulo || isNaN(valor) || valor <= 0) { mostrarToast('Nombre y precio obligatorios.'); return; }
  if (!imagenFinal) { mostrarToast('Subí y procesá una imagen.'); return; }

  try {
    await db.collection('productos').add({
      titulo, valor, descripcion: descripcion || 'Moño artesanal de alta calidad.',
      imagen: imagenFinal, tamanio, color, colorHex, stock,
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
    limpiarFormularioAdmin();
    mostrarToast('Moño publicado. Ya lo ven todas las clientas.');
  } catch (e) {
    mostrarToast('Error al publicar: ' + e.message);
  }
}

async function actualizarProducto(id, valor, stock) {
  if (!esPropietaria || !firebaseListo) return;
  try {
    await db.collection('productos').doc(id).update({
      valor: parseFloat(valor),
      stock: parseInt(stock, 10)
    });
    mostrarToast('Producto actualizado.');
  } catch (e) { mostrarToast('Error: ' + e.message); }
}

async function eliminarProducto(id) {
  if (!confirm('¿Eliminar este moño del catálogo?')) return;
  try {
    await db.collection('productos').doc(id).delete();
    carrito = carrito.filter(i => i.productoId !== id);
    guardarCarrito();
    actualizarBadgeCarrito();
    mostrarToast('Producto eliminado.');
  } catch (e) { mostrarToast('Error: ' + e.message); }
}

function limpiarFormularioAdmin() {
  ['nuevo-nombre','nuevo-precio','nuevo-descripcion'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('nuevo-stock').value = '1';
  document.getElementById('herramienta-fondo').style.display = 'none';
  document.getElementById('preview-original').src = '';
  document.getElementById('preview-procesada').src = '';
  document.getElementById('btn-publicar').disabled = true;
  document.getElementById('input-imagen').value = '';
  imagenFinal = imagenOriginalData = null;
}

function renderAdminLista() {
  const cont = document.getElementById('contenedor-admin-productos');
  if (!productos.length) {
    cont.innerHTML = '<p class="hint">Sin productos publicados.</p>';
    return;
  }
  cont.innerHTML = productos.map(p => `
    <div class="item-admin" data-id="${p.id}">
      <img src="${p.imagen}" alt="">
      <div class="item-admin-info"><strong>${p.titulo}</strong><br>${COLOR_LABELS[p.color]} · ${TAMANIO_LABELS[p.tamanio]}</div>
      <div class="item-admin-edit">
        <div><label class="campo-label">Precio</label><input type="number" class="edit-precio" value="${p.valor}" min="0"></div>
        <div><label class="campo-label">Stock</label><input type="number" class="edit-stock" value="${p.stock}" min="0"></div>
        <button class="btn-guardar-edit" data-guardar="${p.id}">Guardar</button>
        <button class="btn-eliminar" data-eliminar="${p.id}">Eliminar</button>
      </div>
    </div>
  `).join('');
}

// ─── Catálogo ───

function obtenerProductosFiltrados() {
  const busq = document.getElementById('filtro-busqueda').value.toLowerCase().trim();
  const orden = document.getElementById('filtro-orden').value;
  const color = document.getElementById('filtro-color').value;
  const tamanio = document.getElementById('filtro-tamanio').value;
  const precioMax = parseFloat(document.getElementById('filtro-precio-max').value);

  let lista = productos.filter(p => {
    if (busq && !p.titulo.toLowerCase().includes(busq)) return false;
    if (color && p.color !== color) return false;
    if (tamanio && p.tamanio !== tamanio) return false;
    if (!isNaN(precioMax) && p.valor > precioMax) return false;
    return true;
  });

  switch (orden) {
    case 'precio-asc': lista.sort((a,b) => a.valor - b.valor); break;
    case 'precio-desc': lista.sort((a,b) => b.valor - a.valor); break;
    case 'nombre': lista.sort((a,b) => a.titulo.localeCompare(b.titulo)); break;
    default: break;
  }
  return lista;
}

function actualizarCatalogo() {
  const cont = document.getElementById('contenedor-productos');
  const lista = obtenerProductosFiltrados();
  const contador = document.getElementById('contador-resultados');

  if (contador) {
    contador.textContent = lista.length
      ? `${lista.length} moño${lista.length !== 1 ? 's' : ''} disponible${lista.length !== 1 ? 's' : ''}`
      : '';
  }

  if (!firebaseConfigurado() && !productos.length) {
    cont.innerHTML = '<div class="mensaje-vacio">Configurá Firebase para ver el catálogo compartido.</div>';
    return;
  }
  if (!lista.length) {
    cont.innerHTML = '<div class="mensaje-vacio">No hay moños que coincidan. ¡Volvé pronto!</div>';
    return;
  }

  cont.innerHTML = lista.map(p => {
    const fecha = p.fecha?.toDate ? p.fecha.toDate().toISOString() : (p.fecha || '');
    return `
    <article class="card-producto">
      ${fecha && esNuevo(fecha) ? '<span class="badge-nuevo">Nuevo</span>' : ''}
      <button class="btn-favorito ${favoritos.includes(p.id) ? 'activo' : ''}" data-fav="${p.id}">${favoritos.includes(p.id) ? '♥' : '♡'}</button>
      <div class="card-imagen-wrap" data-ver="${p.id}"><img src="${p.imagen}" alt="${p.titulo}" loading="lazy"></div>
      <div class="card-cuerpo">
        <h3>${p.titulo}</h3>
        <p class="card-desc">${p.descripcion}</p>
        <div class="card-meta">
          <span class="chip">${COLOR_LABELS[p.color]}</span>
          <span class="chip">${TAMANIO_LABELS[p.tamanio]}</span>
        </div>
        <div class="card-precio">${formatearPrecio(p.valor)}</div>
        <div class="card-acciones">
          <button class="btn-secundario" data-ver="${p.id}">Detalle</button>
          <button class="btn-principal" data-agregar="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Agotado' : 'Agregar'}</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function abrirModal(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  document.getElementById('modal-contenido').innerHTML = `
    <div class="modal-imagen"><img src="${p.imagen}" alt="${p.titulo}"></div>
    <div class="modal-info">
      <h3>${p.titulo}</h3>
      <div class="card-meta" style="justify-content:flex-start;">
        <span class="chip">${COLOR_LABELS[p.color]}</span>
        <span class="chip">${TAMANIO_LABELS[p.tamanio]}</span>
        <span class="chip">Stock: ${p.stock}</span>
      </div>
      <div class="precio-grande">${formatearPrecio(p.valor)}</div>
      <p class="desc-completa">${p.descripcion}</p>
      <button class="btn-principal" data-agregar-modal="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Agotado' : 'Agregar al carrito'}</button>
    </div>`;
  document.getElementById('overlay-modal').classList.add('activo');
  document.getElementById('modal-producto').classList.add('activo');
}

function cerrarModal() {
  document.getElementById('overlay-modal').classList.remove('activo');
  document.getElementById('modal-producto').classList.remove('activo');
}

function toggleFavorito(id) {
  if (favoritos.includes(id)) favoritos = favoritos.filter(f => f !== id);
  else favoritos.push(id);
  guardarFavoritos();
  actualizarCatalogo();
}

// ─── Carrito ───

function agregarAlCarrito(id) {
  const p = productos.find(x => x.id === id);
  if (!p || p.stock <= 0) { mostrarToast('No disponible.'); return; }
  const item = carrito.find(i => i.productoId === id);
  if (item) {
    if (item.cantidad >= p.stock) { mostrarToast('Stock máximo alcanzado.'); return; }
    item.cantidad++;
  } else {
    carrito.push({ productoId: id, cantidad: 1 });
  }
  guardarCarrito();
  actualizarBadgeCarrito();
  mostrarToast(`${p.titulo} agregado al carrito.`);
}

function actualizarBadgeCarrito() {
  const total = carrito.reduce((s, i) => s + i.cantidad, 0);
  const badge = document.getElementById('badge-carrito');
  badge.textContent = total;
  badge.classList.toggle('visible', total > 0);
}

function renderCarritoPagina() {
  const cont = document.getElementById('contenido-carrito-pagina');
  const resumen = document.getElementById('resumen-carrito');

  if (!carrito.length) {
    cont.innerHTML = '<div class="carrito-vacio">Tu carrito está vacío. <a href="#catalogo" data-nav="catalogo">Ver colección</a></div>';
    resumen.style.display = 'none';
    return;
  }

  let total = 0;
  cont.innerHTML = carrito.map(item => {
    const p = productos.find(x => x.id === item.productoId);
    if (!p) return '';
    const sub = p.valor * item.cantidad;
    total += sub;
    return `
      <div class="item-carrito">
        <img src="${p.imagen}" alt="">
        <div class="item-carrito-info">
          <h4>${p.titulo}</h4>
          <div class="card-precio" style="margin:0;font-size:15px;">${formatearPrecio(p.valor)}</div>
          <div class="cantidad-control">
            <button data-menos="${p.id}">−</button>
            <span>${item.cantidad}</span>
            <button data-mas="${p.id}">+</button>
            <button data-quitar="${p.id}" style="border:none;background:none;color:#c62828;cursor:pointer;font-size:12px;margin-left:8px;">Quitar</button>
          </div>
        </div>
        <div style="font-weight:700;color:var(--rosa-oscuro);">${formatearPrecio(sub)}</div>
      </div>`;
  }).join('');

  document.getElementById('total-carrito').textContent = formatearPrecio(total);
  resumen.style.display = 'block';
}

function cambiarCantidad(id, delta) {
  const item = carrito.find(i => i.productoId === id);
  const p = productos.find(x => x.id === id);
  if (!item || !p) return;
  item.cantidad += delta;
  if (item.cantidad <= 0) carrito = carrito.filter(i => i.productoId !== id);
  else if (item.cantidad > p.stock) { item.cantidad = p.stock; mostrarToast('Stock máximo.'); }
  guardarCarrito();
  actualizarBadgeCarrito();
  renderCarritoPagina();
}

function quitarDelCarrito(id) {
  carrito = carrito.filter(i => i.productoId !== id);
  guardarCarrito();
  actualizarBadgeCarrito();
  renderCarritoPagina();
}

function checkoutWhatsApp() {
  if (!carrito.length) return;
  let msg = 'Hola Caro! Quiero comprar estos moños:%0A%0A';
  let total = 0;
  carrito.forEach(item => {
    const p = productos.find(x => x.id === item.productoId);
    if (!p) return;
    const sub = p.valor * item.cantidad;
    total += sub;
    msg += `• ${p.titulo} x${item.cantidad} = ${formatearPrecio(sub)}%0A`;
  });
  msg += `%0ATotal: ${formatearPrecio(total)}%0A%0A¡Gracias!`;
  window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${msg}`, '_blank');
}

function enviarPedidoCustom() {
  const nombre = document.getElementById('pedido-nombre').value.trim();
  const contacto = document.getElementById('pedido-contacto').value.trim();
  if (!nombre || !contacto) { mostrarToast('Completá tus datos.'); return; }
  const tela = document.getElementById('pedido-tela').value;
  const color = document.getElementById('pedido-color').value;
  const desc = document.getElementById('pedido-descripcion').value.trim();
  const msg = `Hola Caro! Quiero un moño PERSONALIZADO (costo a presupuestar):%0A%0ANombre: ${encodeURIComponent(nombre)}%0AContacto: ${encodeURIComponent(contacto)}%0ATela: ${tela}%0AColor: ${color}%0ADetalle: ${encodeURIComponent(desc)}`;
  window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${msg}`, '_blank');
  mostrarToast('Pedido enviado por WhatsApp.');
}

// ─── Eventos ───

function initEventos() {
  document.getElementById('btn-guardar-cliente').addEventListener('click', guardarCliente);
  document.getElementById('btn-owner-login').addEventListener('click', loginPropietaria);
  document.getElementById('btn-owner-registro').addEventListener('click', registroPropietaria);
  document.getElementById('btn-owner-logout').addEventListener('click', logoutPropietaria);
  document.getElementById('btn-ir-admin').addEventListener('click', () => { location.hash = 'admin'; });

  const zona = document.getElementById('zona-upload');
  const inputImg = document.getElementById('input-imagen');
  zona.addEventListener('click', () => inputImg.click());
  inputImg.addEventListener('change', e => manejarImagen(e.target.files[0]));
  zona.addEventListener('dragover', e => { e.preventDefault(); });
  zona.addEventListener('drop', e => { e.preventDefault(); manejarImagen(e.dataTransfer.files[0]); });

  document.getElementById('btn-quitar-fondo').addEventListener('click', quitarFondoPremium);
  document.getElementById('btn-usar-original').addEventListener('click', usarOriginal);
  document.getElementById('btn-publicar').addEventListener('click', publicarMono);

  ['filtro-busqueda','filtro-orden','filtro-color','filtro-tamanio','filtro-precio-max'].forEach(id => {
    document.getElementById(id).addEventListener('input', actualizarCatalogo);
    document.getElementById(id).addEventListener('change', actualizarCatalogo);
  });
  document.getElementById('btn-limpiar-filtros').addEventListener('click', () => {
    document.getElementById('filtro-busqueda').value = '';
    document.getElementById('filtro-orden').value = 'reciente';
    document.getElementById('filtro-color').value = '';
    document.getElementById('filtro-tamanio').value = '';
    document.getElementById('filtro-precio-max').value = '';
    actualizarCatalogo();
  });

  document.getElementById('contenedor-productos').addEventListener('click', e => {
    if (e.target.closest('[data-agregar]')) agregarAlCarrito(e.target.closest('[data-agregar]').dataset.agregar);
    if (e.target.closest('[data-ver]')) abrirModal(e.target.closest('[data-ver]').dataset.ver);
    if (e.target.closest('[data-fav]')) toggleFavorito(e.target.closest('[data-fav]').dataset.fav);
  });

  document.getElementById('modal-contenido').addEventListener('click', e => {
    const btn = e.target.closest('[data-agregar-modal]');
    if (btn) { agregarAlCarrito(btn.dataset.agregarModal); cerrarModal(); location.hash = 'carrito'; }
  });

  document.getElementById('contenedor-admin-productos').addEventListener('click', e => {
    if (e.target.dataset.eliminar) eliminarProducto(e.target.dataset.eliminar);
    if (e.target.dataset.guardar) {
      const row = e.target.closest('.item-admin');
      const precio = row.querySelector('.edit-precio').value;
      const stock = row.querySelector('.edit-stock').value;
      actualizarProducto(e.target.dataset.guardar, precio, stock);
    }
  });

  document.getElementById('contenido-carrito-pagina').addEventListener('click', e => {
    if (e.target.dataset.menos) cambiarCantidad(e.target.dataset.menos, -1);
    if (e.target.dataset.mas) cambiarCantidad(e.target.dataset.mas, 1);
    if (e.target.dataset.quitar) quitarDelCarrito(e.target.dataset.quitar);
  });

  document.getElementById('btn-checkout').addEventListener('click', checkoutWhatsApp);
  document.getElementById('btn-enviar-pedido').addEventListener('click', enviarPedidoCustom);
  document.getElementById('btn-cerrar-modal').addEventListener('click', cerrarModal);
  document.getElementById('overlay-modal').addEventListener('click', cerrarModal);
}

// ─── Init ───
initNavegacion();
initEventos();
cargarClienteGuardado();
initFirebase();
actualizarBadgeCarrito();
