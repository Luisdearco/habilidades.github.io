if (!document.querySelector('meta[name=description]')) {
  var md = document.createElement('meta');
  md.name = 'description';
  md.content = 'Plataforma educativa de habilidades blandas para adolescentes de la Fundación Luz de Esperanza: cursos, tareas, foros y evaluaciones en línea.';
  document.head.appendChild(md);
}
// Imágenes opcionales (logo): prueba varias extensiones
document.querySelectorAll('img[data-img]').forEach(function (img) {
  var exts = ['png', 'jpg', 'jpeg', 'webp', 'svg'], i = 0, base = img.dataset.img;
  function siguiente() { if (i >= exts.length) { img.remove(); return; } img.src = base + '.' + exts[i++]; }
  img.addEventListener('error', siguiente);
  img.addEventListener('load', function () { img.classList.add('ok'); if (img.parentElement) img.parentElement.classList.add('con-imagen'); });
  siguiente();
});

// Menú desplegable (teléfonos y tabletas)
(function () {
  var btn = document.querySelector('.menu-btn'), nav = document.querySelector('.top nav');
  if (!btn || !nav) return;
  function estado(abierto) {
    nav.classList.toggle('open', abierto); btn.setAttribute('aria-expanded', abierto);
    btn.textContent = abierto ? '✕' : '☰'; btn.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  }
  btn.addEventListener('click', function (e) { estado(!nav.classList.contains('open')); e.stopPropagation(); });
  document.addEventListener('click', function (e) { if (!nav.contains(e.target)) estado(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') estado(false); });
})();

// Tablas: etiquetas para mostrarlas como tarjetas en pantallas pequeñas
function etiquetarTablas() {
  document.querySelectorAll('table.tabla:not([data-ok])').forEach(function (t) {
    var filas = t.rows; if (!filas.length) return;
    var cab = Array.prototype.map.call(filas[0].cells, function (c) { return c.textContent.trim(); });
    var conTh = !!filas[0].querySelector('th');
    Array.prototype.forEach.call(filas, function (f, i) {
      if (i === 0 && conTh) { f.classList.add('cab'); return; }
      Array.prototype.forEach.call(f.cells, function (c, j) { if (cab[j]) c.setAttribute('data-label', cab[j]); });
    });
    if (!t.hasAttribute('data-ancha')) t.classList.add('apilar');
    t.setAttribute('data-ok', '1');
  });
}
etiquetarTablas();
new MutationObserver(function () { requestAnimationFrame(etiquetarTablas); }).observe(document.body, { childList: true, subtree: true });

function mensajeError(e) {
  var m = e && e.message;
  var t = {
    credenciales: 'Usuario o contraseña incorrectos.',
    inseguro: 'Abre el sitio con Live Server o desde GitHub Pages (conexión segura).',
    permiso: 'No tienes permiso para esta acción.',
    sin_matricula: 'No estás matriculado en este curso.',
    no_visible: 'Esta actividad no está disponible.',
    no_disponible: 'Esta actividad ya no está disponible.',
    solo_pdf: 'Solo se aceptan archivos PDF.',
    tipo_archivo: 'Tipo de archivo no permitido (usa PDF, Word, PowerPoint, Excel, imagen o texto).',
    archivo_grande: 'El archivo es demasiado grande (máximo ' + (window.HB ? HB.maxMB : 5) + ' MB).',
    archivo_invalido: 'No se pudo leer el archivo.',
    ya_calificada: 'Esta tarea ya fue calificada y no se puede reemplazar.',
    pregunta_invalida: 'Revisa las preguntas: cada una necesita enunciado, al menos 2 opciones y una respuesta correcta.',
    titulo: 'Escribe un nombre o título.',
    texto_invalido: 'Escribe un mensaje (máximo 2000 caracteres).',
    nota_invalida: 'La nota debe estar entre 0,0 y 5,0.',
    clave_corta: 'La contraseña debe tener al menos 4 caracteres.',
    no_existe: 'No se encontró lo que buscas (quizás ya fue eliminado).'
  };
  return t[m] || 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.';
}
window.mensajeError = mensajeError;

HB.listo.then(function () {
  var u = HB.yo, ruta = location.pathname;
  var zona = ruta.indexOf('/profesor/') > -1 ? 'profesor' : ruta.indexOf('/estudiante/') > -1 ? 'estudiante' : null;
  // El logo siempre lleva al inicio de quien tiene la sesión abierta
  var casa = u ? (u.rol === 'profesor' ? '../../profesor/html/principal.html' : '../../estudiante/html/principal.html') : '../../auth/html/login.html';
  document.querySelectorAll('a.logo').forEach(function (a) { a.setAttribute('href', casa); });
  // El profesor puede abrir los cursos como vista previa
  var previa = !!(u && u.rol === 'profesor' && zona === 'estudiante' && document.body.hasAttribute('data-preview'));
  if (zona && !(u && (u.rol === zona || previa))) { location.replace(casa); return; }
  document.body.classList.remove('guarda');
  if (previa) {
    var nav = document.querySelector('.top nav');
    var items = [['Panel', 'principal.html', '📋'], ['Cursos', 'cursos.html', '🗂️'], ['Estudiantes', 'estudiantes.html', '👥'], ['Matrículas', 'matriculas.html', '🎓'], ['Evaluaciones', 'evaluaciones.html', '📝'], ['Calificaciones', 'calificaciones.html', '📊'], ['Descargas', 'descargas.html', '⬇️']];
    nav.querySelectorAll('a:not(.btn-sm)').forEach(function (a) { a.remove(); });
    items.slice().reverse().forEach(function (it) { var a = document.createElement('a'); a.href = '../../profesor/html/' + it[1]; a.innerHTML = '<span class="mi" aria-hidden="true">' + it[2] + '</span>' + it[0]; nav.insertBefore(a, nav.firstChild); });
  }

  document.querySelectorAll('[data-usuario]').forEach(function (s) {
    if (!u) return;
    s.textContent = '';
    [['av', u.nombre.trim().charAt(0).toUpperCase(), 'span'], ['nm', u.nombre, 'span'], ['rl', u.rol === 'profesor' ? 'Profesor' : 'Estudiante', 'small']].forEach(function (p) {
      var el = document.createElement(p[2]); el.className = p[0]; el.textContent = p[1]; s.appendChild(el);
    });
  });
  document.querySelectorAll('[data-logout]').forEach(function (a) { a.addEventListener('click', function () { HB.salir(); }); });

  // ---- Inicio de sesión
  var login = document.querySelector('form[data-login]');
  if (login) {
    login.addEventListener('submit', function (e) {
      e.preventDefault();
      var aviso = login.querySelector('.aviso'), btn = login.querySelector('button');
      var us = login.querySelector('[name=usuario]').value, cl = login.querySelector('[name=clave]').value;
      if (!us.trim() || !cl) { aviso.textContent = 'Escribe tu usuario y tu contraseña.'; return; }
      btn.disabled = true; aviso.textContent = '';
      HB.entrar(us, cl).then(function (usr) {
        var req = login.dataset.rol;
        if (req && usr.rol !== req) {
          HB.salir(); btn.disabled = false;
          aviso.textContent = 'Esta cuenta es de ' + (usr.rol === 'profesor' ? 'profesor' : 'estudiante') + '. Usa el acceso correcto.'; return;
        }
        location.href = usr.rol === 'profesor' ? '../../profesor/html/principal.html' : '../../estudiante/html/principal.html';
      }).catch(function (err) { btn.disabled = false; aviso.textContent = mensajeError(err); });
    });
  }

  // ---- Solicitud de cuenta (por correo al profesor)
  var reg = document.querySelector('form[data-registro]');
  if (reg) {
    reg.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = function (n) { return reg.querySelector('[name=' + n + ']').value.trim(); };
      var para = HB.cfg.contacto || '';
      var cuerpo = 'Nombre: ' + f('nombre') + '\nCédula: ' + f('cedula') + '\nCorreo: ' + f('correo') +
        '\nCurso de interés: ' + f('curso') + '\n\nSolicito que me creen una cuenta en la plataforma.';
      reg.querySelector('.aviso').textContent = para ? '' : 'Tu profesor te creará la cuenta: entrégale estos datos.';
      if (para) location.href = 'mailto:' + para + '?subject=' + encodeURIComponent('Solicitud de cuenta - Habilidades Blandas') + '&body=' + encodeURIComponent(cuerpo);
    });
  }
});
