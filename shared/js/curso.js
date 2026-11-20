// Reproductor de cursos: actividades en orden (lineal) para el estudiante y vista previa para el profesor
HB.listo.then(function () {
  var main = document.getElementById('curso-main');
  if (!main || !HB.yo) return;
  var esc = HB.esc, qs = new URLSearchParams(location.search), cid = qs.get('c'), iid = qs.get('i');
  var esProf = HB.yo.rol === 'profesor';
  var casa = esProf ? '../../profesor/html/principal.html' : 'principal.html';
  var side = document.getElementById('curso-side');
  function aviso(t) { return '<p class="aviso-info">' + t + '</p>'; }
  if (!cid) { main.innerHTML = '<h1>Curso</h1>' + aviso('Elige un curso desde el inicio.') + '<div class="acciones"><a class="btn" href="' + casa + '">Ir al inicio</a></div>'; return; }

  var base = 'curso.html?c=' + encodeURIComponent(cid), area, items, curso, actual, idx;

  HB.llamar('curso', { id: cid }).then(function (r) {
    curso = r.curso; items = r.items;
    document.title = curso.nombre + ' · Habilidades Blandas';
    var sb = document.querySelector('.subbar span'); if (sb) sb.textContent = 'Cursos / ' + curso.nombre;
    var editar = '../../profesor/html/editar-curso.html?c=' + encodeURIComponent(cid);
    var cab = (esProf ? '<p class="aviso-info"><b>Vista del profesor.</b> Así ve este curso un estudiante matriculado. <a class="btn btn-sm2" href="' + editar + '">✏️ Editar curso</a></p>' : '') +
      '<h1>' + esc(curso.emoji) + ' ' + esc(curso.nombre) + '</h1>';
    if (!items.length) {
      if (side) side.innerHTML = '<h2>Contenido del curso</h2><a href="' + casa + '"><span class="dot">⌂</span>Volver a mis cursos</a>';
      main.innerHTML = cab + aviso('Este curso todavía no tiene actividades.') + (esProf ? '<div class="acciones"><a class="btn" href="' + editar + '">Agregar actividades</a></div>' : '');
      return;
    }
    idx = Math.max(0, items.map(function (i) { return i.id; }).indexOf(iid)); actual = items[idx];

    // Menú lateral
    if (side) side.innerHTML = '<h2>Contenido del curso</h2>' + items.map(function (i, k) {
      return '<a href="' + base + '&i=' + i.id + '"' + (k === idx ? ' aria-current="page"' : '') + '><span class="dot">' + (k + 1) + '</span><span>' + HB.tipos[i.tipo][0] + ' ' + esc(i.titulo) + (i.visible ? '' : ' <small>(oculta)</small>') + '</span></a>';
    }).join('') + '<a href="' + casa + '"><span class="dot">⌂</span>Volver a mis cursos</a>';

    // Pasos (lineal)
    var pasos = items.length <= 10
      ? '<ol class="pasos">' + items.map(function (i, k) { return '<li><a href="' + base + '&i=' + i.id + '"' + (k === idx ? ' aria-current="step"' : '') + ' title="' + esc(i.titulo) + '"><span class="num">' + (k + 1) + '</span><span class="lbl">' + esc(i.titulo) + '</span></a></li>'; }).join('') + '</ol>'
      : '<label class="sr" for="saltar">Ir a la actividad</label><select id="saltar">' + items.map(function (i, k) { return '<option value="' + i.id + '"' + (k === idx ? ' selected' : '') + '>' + (k + 1) + '. ' + esc(i.titulo) + '</option>'; }).join('') + '</select>';
    // Anterior / siguiente
    var ant = idx > 0 ? '<a class="btn btn-claro" href="' + base + '&i=' + items[idx - 1].id + '">← Anterior: ' + esc(items[idx - 1].titulo) + '</a>' : '<a class="btn btn-claro" href="' + casa + '">← Volver a mis cursos</a>';
    var finHref = esProf ? '../../profesor/html/calificaciones.html' : 'calificaciones.html?curso=' + encodeURIComponent(cid);
    var sig = idx < items.length - 1 ? '<a class="btn" href="' + base + '&i=' + items[idx + 1].id + '">Siguiente: ' + esc(items[idx + 1].titulo) + ' →</a>' : '<a class="btn" href="' + finHref + '">Terminar: ver calificaciones →</a>';

    main.innerHTML = cab + '<nav aria-label="Actividades del curso">' + pasos + '<p class="paso-txt">Actividad ' + (idx + 1) + ' de ' + items.length + '</p></nav><div id="item-area">Cargando…</div><div class="acciones nav-lineal">' + ant + sig + '</div>';
    var sel = document.getElementById('saltar');
    if (sel) sel.addEventListener('change', function () { location.href = base + '&i=' + sel.value; });
    area = document.getElementById('item-area');
    cargarItem();
  }).catch(function (e) { main.innerHTML = '<h1>Curso</h1>' + aviso(e.message === 'sin_matricula' ? 'No estás matriculado en este curso. Tu profesor es quien te matricula.' : mensajeError(e)) + '<div class="acciones"><a class="btn" href="' + casa + '">Volver al inicio</a></div>'; });

  function cargarItem() {
    HB.llamar('item', { id: actual.id }).then(pintar).catch(function (e) { area.innerHTML = aviso(mensajeError(e)); });
  }

  function pintar(d) {
    var it = d.item, c = it.contenido || {}, t = '<h2>' + HB.tipos[it.tipo][0] + ' ' + esc(it.titulo) + '</h2>';
    if (it.tipo === 'texto') area.innerHTML = t + '<div class="cuerpo-texto">' + HB.md(c.cuerpo) + '</div>';
    else if (it.tipo === 'video') {
      var v = HB.videoHtml(c.url, it.titulo);
      area.innerHTML = t + (v || aviso('No se pudo mostrar el video con este enlace.' + (c.url ? ' <a href="' + esc(c.url) + '" target="_blank" rel="noopener">Abrir enlace</a>' : ''))) + (c.descripcion ? '<div class="cuerpo-texto">' + HB.md(c.descripcion) + '</div>' : '');
    }
    else if (it.tipo === 'pdf') pdf(it, c, t);
    else if (it.tipo === 'tarea') tarea(d, it, c, t);
    else if (it.tipo === 'foro') foro(d, it, c, t);
    else if (it.tipo === 'examen') examen(d, it, c, t);
    else if (it.tipo === 'tarjetas') tarjetas(it, c, t);
  }

  // ---------------------------------------------------------------- Documento (PDF u otro)
  function botonesArchivo(c, registrar, itemId) {
    if (c.archivo) return '<button class="btn btn-claro" type="button" data-a="abrir">Abrir</button><button class="btn" type="button" data-a="bajar">Descargar</button>';
    var ruta = esc(HB.rutaArchivo(c.url));
    return '<a class="btn btn-claro" href="' + ruta + '" target="_blank" rel="noopener">Abrir</a><a class="btn" href="' + ruta + '" download data-a="bajar-url">Descargar</a>';
  }
  function pdf(it, c, t) {
    var h = t + (c.descripcion ? '<div class="cuerpo-texto">' + HB.md(c.descripcion) + '</div>' : '') +
      '<div class="recurso"><span class="ico">📄</span><div><b>' + esc(c.nombre_archivo || it.titulo) + '</b><br><small>Documento · <span id="estado-desc" class="estado no">' + (esProf ? 'Vista del profesor' : 'Cargando…') + '</span></small></div>' + botonesArchivo(c) + '</div>';
    area.innerHTML = h;
    function registrar() {
      if (esProf) return;
      HB.llamar('registrar_descarga', { item: it.id }).then(function () { var s = document.getElementById('estado-desc'); s.textContent = 'Descargado el ' + HB.fecha(new Date().toISOString()); s.className = 'estado si'; });
    }
    area.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.a === 'abrir') HB.abrirArchivo(c.archivo, false).catch(function (e) { alert(mensajeError(e)); });
        if (b.dataset.a === 'bajar') HB.abrirArchivo(c.archivo, true).then(registrar).catch(function (e) { alert(mensajeError(e)); });
        if (b.dataset.a === 'bajar-url') registrar();
      });
    });
    if (!esProf) HB.llamar('mis_descargas').then(function (r) {
      var f = r.descargas.filter(function (x) { return x.item === it.id; })[0], s = document.getElementById('estado-desc');
      if (s && !/Descargado el/.test(s.textContent)) { s.textContent = f ? 'Descargado el ' + HB.fecha(f.fecha) : 'Aún no descargado'; s.className = 'estado ' + (f ? 'si' : 'no'); }
    });
  }

  // ---------------------------------------------------------------- Tarea (entrega de PDF)
  function tarea(d, it, c, t) {
    var fechas = it.estado === 'programado' ? 'Se abre el <b>' + HB.fecha(it.apertura) + '</b>.' : it.estado === 'cerrado' ? 'El plazo terminó el <b>' + HB.fecha(it.cierre) + '</b>.' : it.cierre ? 'Fecha límite: <b>' + HB.fecha(it.cierre) + '</b>.' : 'Sin fecha límite.';
    var h = t + '<p class="meta">' + HB.badge(it.estado) + ' ' + fechas + '</p><div class="cuerpo-texto">' + HB.md(c.instrucciones) + '</div>';
    if (c.archivo || c.url) h += '<div class="recurso"><span class="ico">📎</span><div><b>' + esc(c.nombre_archivo || 'Material de la tarea') + '</b></div>' + botonesArchivo(c) + '</div>';
    if (esProf) {
      h += aviso('Vista del profesor: aquí el estudiante sube su PDF. <a href="../../profesor/html/entregas.html?i=' + it.id + '">Ver entregas y calificar</a>');
      area.innerHTML = h; enlazarArchivo(c); return;
    }
    var e = d.entrega;
    if (e) {
      h += '<div class="entrega-card"><b>Tu entrega</b><br>📄 ' + esc(e.nombre) + ' · ' + HB.fecha(e.fecha) + ' <button class="btn btn-sm2 btn-claro" type="button" id="mi-pdf">Descargar mi PDF</button>' +
        (e.calificada ? '<p class="nota-grande">Calificación: <b>' + HB.nota(e.nota) + '</b> / 5,0</p>' + (e.comentario ? '<p><b>Comentario del profesor:</b> ' + esc(e.comentario) + '</p>' : '') : '<p><span class="estado prog">En revisión</span> Tu profesor aún no la califica.</p>') + '</div>';
    }
    var puede = it.estado === 'abierto' && !(e && e.calificada);
    if (puede) h += '<form id="form-entrega" class="tarjeta"><h3>' + (e ? 'Reemplazar entrega' : 'Subir tu entrega') + '</h3><label for="pdf-tarea">Archivo PDF (máximo ' + HB.maxMB + ' MB)</label><input id="pdf-tarea" type="file" accept="application/pdf,.pdf" required><p class="aviso" role="alert" id="aviso-entrega"></p><button class="btn" type="submit">' + (e ? 'Reemplazar PDF' : 'Entregar PDF') + '</button></form>';
    else if (!e) h += aviso(it.estado === 'programado' ? 'La entrega se habilitará en la fecha indicada.' : 'El plazo terminó y no hay una entrega registrada.');
    area.innerHTML = h; enlazarArchivo(c);
    var mi = document.getElementById('mi-pdf'); if (mi) mi.addEventListener('click', function () { HB.abrirArchivo(e.archivo, true).catch(function (x) { alert(mensajeError(x)); }); });
    var f = document.getElementById('form-entrega');
    if (f) f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var av = document.getElementById('aviso-entrega'), bt = f.querySelector('button'); av.textContent = ''; bt.disabled = true;
      HB.leerArchivo(document.getElementById('pdf-tarea').files[0], HB.PDF_RE, 'solo_pdf')
        .then(function (a) { return HB.llamar('entregar_tarea', { item: it.id, nombre: a.nombre, datos: a.datos }); })
        .then(cargarItem).catch(function (x) { bt.disabled = false; av.textContent = mensajeError(x); });
    });
  }
  function enlazarArchivo(c) {
    area.querySelectorAll('[data-a]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.a === 'abrir') HB.abrirArchivo(c.archivo, false).catch(function (e) { alert(mensajeError(e)); });
        if (b.dataset.a === 'bajar') HB.abrirArchivo(c.archivo, true).catch(function (e) { alert(mensajeError(e)); });
      });
    });
  }

  // ---------------------------------------------------------------- Foro
  function foro(d, it, c, t) {
    var h = t + '<div class="cuerpo-texto">' + HB.md(c.planteamiento) + '</div><h3>Participaciones (' + d.mensajes.length + ')</h3><div id="foro-lista">' +
      (d.mensajes.length ? d.mensajes.map(function (m) {
        return '<article class="foro-msg' + (m.rol === 'profesor' ? ' prof' : '') + '"><header><b>' + esc(m.nombre) + '</b>' + (m.rol === 'profesor' ? ' <span class="insignia">Profesor</span>' : '') + ' <small>' + HB.fecha(m.fecha) + '</small>' +
          (esProf ? ' <button class="btn btn-sm2 btn-peligro" type="button" data-del="' + m.id + '">Borrar</button>' : '') + '</header><p>' + esc(m.texto).replace(/\n/g, '<br>') + '</p></article>'; }).join('')
        : '<p class="aviso-info">Aún no hay participaciones. ¡Sé la primera persona en escribir!</p>') + '</div>' +
      '<form id="form-foro" class="tarjeta"><label for="msg">Tu participación</label><textarea id="msg" rows="4" maxlength="2000" required></textarea><p class="aviso" role="alert" id="aviso-foro"></p><div class="acciones"><button class="btn" type="submit">Publicar</button><button class="btn btn-claro" type="button" id="foro-act">Actualizar</button></div></form>';
    area.innerHTML = h;
    document.getElementById('foro-act').addEventListener('click', cargarItem);
    document.getElementById('form-foro').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var bt = ev.target.querySelector('button[type=submit]'); bt.disabled = true;
      HB.llamar('foro_publicar', { item: it.id, texto: document.getElementById('msg').value }).then(cargarItem).catch(function (x) { bt.disabled = false; document.getElementById('aviso-foro').textContent = mensajeError(x); });
    });
    area.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { if (confirm('¿Borrar este mensaje?')) HB.llamar('foro_borrar', { id: b.dataset.del }).then(cargarItem); });
    });
  }

  // ---------------------------------------------------------------- Examen de única respuesta
  function examen(d, it, c, t) {
    var h = t + (c.descripcion ? '<div class="cuerpo-texto">' + HB.md(c.descripcion) + '</div>' : '');
    var resumen = '<p class="meta">' + HB.badge(it.estado) + ' Intentos usados: <b>' + d.usados + ' de ' + it.intentosMax + '</b> · Mejor nota: <b>' + HB.nota(d.mejor) + '</b> (escala 0,0 a 5,0)' +
      (it.cierre ? ' · Cierra: <b>' + HB.fecha(it.cierre) + '</b>' : '') + '</p>';
    if (esProf) { area.innerHTML = h + aviso('Vista del profesor: este examen tiene <b>' + d.total + '</b> pregunta(s) de única respuesta y ' + it.intentosMax + ' intento(s). Edítalo desde «Editar curso» y revisa las notas en <a href="../../profesor/html/calificaciones.html">Calificaciones</a>.'); return; }
    var msg = { oculto: 'Esta evaluación no está disponible.', programado: 'Esta evaluación se abrirá el <b>' + HB.fecha(it.apertura) + '</b>.', cerrado: 'Esta evaluación cerró el <b>' + HB.fecha(it.cierre) + '</b>.' }[it.estado];
    if (msg) { area.innerHTML = h + aviso(msg) + (d.usados ? resumen : ''); return; }
    if (!d.preguntas) { area.innerHTML = h + aviso(d.total ? 'Ya usaste todos tus intentos.' : 'Este examen todavía no tiene preguntas.') + resumen; return; }
    h += resumen + '<form id="form-ev">';
    d.preguntas.forEach(function (p, i) {
      h += '<fieldset class="pregunta"><legend>Pregunta ' + (i + 1) + '</legend><p>' + esc(p.q) + '</p>';
      p.o.forEach(function (o, j) { h += '<label><input type="radio" name="p' + i + '" value="' + j + '" required> ' + esc(o) + '</label>'; });
      h += '<p class="retro"></p></fieldset>';
    });
    area.innerHTML = h + '<button class="btn" type="submit">Enviar evaluación</button><p id="resultado" class="resultado" role="status"></p></form>';
    var form = document.getElementById('form-ev');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!confirm('¿Enviar la evaluación? Se registrará tu calificación.')) return;
      var resp = d.preguntas.map(function (p, i) { var m = form.querySelector('input[name=p' + i + ']:checked'); return m ? Number(m.value) : -1; });
      var btn = form.querySelector('button'); btn.disabled = true;
      HB.llamar('enviar_examen', { item: it.id, respuestas: resp }).then(function (r) {
        form.querySelectorAll('.pregunta').forEach(function (box, i) {
          box.classList.toggle('bien', !!r.detalle[i]); box.classList.toggle('mal', !r.detalle[i]);
          box.querySelector('.retro').textContent = r.detalle[i] ? 'Correcta.' : 'Incorrecta.';
          box.querySelectorAll('input').forEach(function (x) { x.disabled = true; });
        });
        btn.remove();
        document.getElementById('resultado').innerHTML = 'Tu calificación: <b>' + HB.nota(r.nota) + ' / 5,0</b> (' + r.correctas + ' de ' + r.total + ' correctas). Quedó registrada y tu profesor ya la puede ver.';
      }).catch(function (x) { btn.disabled = false; document.getElementById('resultado').textContent = mensajeError(x); });
    });
  }

  // ---------------------------------------------------------------- Tarjetas de repaso
  function tarjetas(it, c, t) {
    var lista = c.tarjetas || [], e = function (s) { return esc(s || ''); };
    if (!lista.length) { area.innerHTML = t + aviso('Esta actividad todavía no tiene tarjetas.'); return; }
    area.innerHTML = t + '<section class="repaso" aria-label="Tarjetas de repaso"><p class="meta">Haz clic en cada tarjeta para ver la respuesta.</p><div class="repaso-grid"><div class="tarjetas">' +
      lista.map(function (k) {
        return '<button type="button" class="flip" aria-pressed="false" data-q="' + e(k.q) + '" data-a="' + e(k.a) + '" data-titulo="' + e(k.t) + '" data-texto="' + e(k.x) + '" aria-label="' + e(k.q) + ' Pulsa para ver la respuesta.">' +
          '<span class="cara frente">' + e(k.q) + '</span><span class="cara dorso">' + e(k.a) + '</span></button>'; }).join('') +
      '</div><aside class="sabias" aria-live="polite"><b>💡 ¿SABÍAS QUE…?</b><p>' + e(c.intro || 'Voltea una tarjeta para ver su respuesta.') + '</p></aside></div></section>';
    HB.iniciarRepaso(area);
  }
});
