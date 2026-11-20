// Editor de cursos del profesor: actividades (lectura, video, PDF, tarea, foro, examen, tarjetas) y calificación de entregas
HB.listo.then(function () {
  if (!HB.yo || HB.yo.rol !== 'profesor') return;
  var vista = document.body.dataset.vista, cont = document.getElementById('vista');
  if (!cont) return;
  var esc = HB.esc, $ = function (id) { return document.getElementById(id); }, qs = new URLSearchParams(location.search);
  function aviso(t) { return '<p class="aviso-info">' + t + '</p>'; }
  var loc = function (iso) { if (!iso) return ''; var d = new Date(iso), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  var iso = function (v) { return v ? new Date(v).toISOString() : null; };
  var msgErr = function (x) { return x && x.msg ? x.msg : mensajeError(x); };

  if (vista === 'editor') editor();
  if (vista === 'entregas') entregas();

  // ================================================================ EDITOR DE CURSO
  function editor() {
    var cid = qs.get('c'), curso, items = [], contP = 0;
    if (!cid) { cont.innerHTML = aviso('Elige un curso en <a href="cursos.html">Cursos</a>.'); return; }
    cont.innerHTML = '<section class="tarjeta" id="sec-curso"></section><section class="tarjeta"><h2>Actividades del curso</h2><div id="lista-items"></div><h3>Agregar actividad</h3><div id="nuevo-botones" class="acciones"></div></section><section class="tarjeta" id="panel-item" hidden></section>';
    $('nuevo-botones').innerHTML = Object.keys(HB.tipos).map(function (t) { return '<button type="button" class="btn btn-claro" data-nuevo="' + t + '">' + HB.tipos[t][0] + ' ' + HB.tipos[t][1] + '</button>'; }).join('');

    function cargar() {
      return HB.llamar('curso', { id: cid }).then(function (r) { curso = r.curso; items = r.items; pintarCurso(); pintarLista(); }).catch(function (e) { cont.innerHTML = aviso(mensajeError(e)); });
    }
    function pintarCurso() {
      var pal = HB.paletas.map(function (p, i) { return '<option value="' + i + '"' + (p[1] === curso.color1 ? ' selected' : '') + '>' + p[0] + '</option>'; }).join('');
      $('sec-curso').innerHTML = '<h2>Datos del curso</h2><form id="form-curso" class="form-grid">' +
        '<div><label for="c-nombre">Nombre</label><input id="c-nombre" value="' + esc(curso.nombre) + '" required></div>' +
        '<div><label for="c-emoji">Icono (emoji)</label><input id="c-emoji" value="' + esc(curso.emoji) + '" maxlength="4"></div>' +
        '<div><label for="c-paleta">Color</label><select id="c-paleta">' + pal + '</select></div>' +
        '<div><label for="c-video">Video de portada (opcional, enlace de YouTube)</label><input id="c-video" value="' + esc(curso.video || '') + '"></div>' +
        '<div style="grid-column:1/-1"><label for="c-desc">Descripción</label><textarea id="c-desc" rows="2">' + esc(curso.descripcion) + '</textarea></div>' +
        '<div style="grid-column:1/-1" class="acciones"><button class="btn" type="submit">Guardar datos</button><a class="btn btn-claro" href="../../estudiante/html/curso.html?c=' + encodeURIComponent(cid) + '">Ver como estudiante</a><a class="btn btn-claro" href="matriculas.html">Matricular estudiantes</a>' +
        '<button class="btn btn-peligro" type="button" id="del-curso">Eliminar curso</button></div><p class="aviso" id="aviso-curso" role="status"></p></form>';
      document.querySelector('h1').textContent = 'Editar curso: ' + curso.nombre;
      $('form-curso').addEventListener('submit', function (e) {
        e.preventDefault(); var p = HB.paletas[Number($('c-paleta').value)];
        HB.llamar('guardar_curso', { id: cid, nombre: $('c-nombre').value, descripcion: $('c-desc').value, emoji: $('c-emoji').value, color1: p[1], color2: p[2], video: $('c-video').value })
          .then(function () { $('aviso-curso').textContent = 'Datos guardados.'; return HB.cargarCursos(); }).then(cargar).catch(function (x) { $('aviso-curso').textContent = mensajeError(x); });
      });
      $('del-curso').addEventListener('click', function () {
        if (confirm('¿Eliminar el curso «' + curso.nombre + '»? Se borrarán sus actividades, notas, entregas y matrículas. No se puede deshacer.'))
          HB.llamar('eliminar_curso', { id: cid }).then(function () { location.href = 'cursos.html'; }).catch(function (x) { alert(mensajeError(x)); });
      });
    }
    function pintarLista() {
      $('lista-items').innerHTML = items.length ? items.map(function (i, k) {
        var ev = (i.tipo === 'examen' || i.tipo === 'tarea') ? ' ' + HB.badge(i.estado) : '';
        return '<div class="item-fila" data-id="' + esc(i.id) + '"><span class="num">' + (k + 1) + '</span><div class="info"><b>' + HB.tipos[i.tipo][0] + ' ' + esc(i.titulo) + '</b><br><small>' + HB.tipos[i.tipo][1] + (i.visible ? '' : ' · <b>Oculta para estudiantes</b>') + '</small>' + ev + '</div>' +
          '<div class="acc"><button class="btn btn-sm2 btn-claro" data-mv="-1" aria-label="Subir" title="Subir">↑</button><button class="btn btn-sm2 btn-claro" data-mv="1" aria-label="Bajar" title="Bajar">↓</button>' +
          '<button class="btn btn-sm2" data-ed>Editar</button><a class="btn btn-sm2 btn-claro" href="../../estudiante/html/curso.html?c=' + encodeURIComponent(cid) + '&i=' + encodeURIComponent(i.id) + '">Ver</a>' +
          (i.tipo === 'tarea' ? '<a class="btn btn-sm2 btn-claro" href="entregas.html?i=' + encodeURIComponent(i.id) + '">Entregas</a>' : '') + '<button class="btn btn-sm2 btn-peligro" data-del>Eliminar</button></div></div>'; }).join('')
        : '<p class="aviso-info">Este curso todavía no tiene actividades. Agrega la primera con los botones de abajo.</p>';
    }
    $('lista-items').addEventListener('click', function (e) {
      var fila = e.target.closest('.item-fila'), b = e.target.closest('button'); if (!fila || !b) return;
      var id = fila.dataset.id;
      if (b.dataset.mv) HB.llamar('mover_item', { id: id, dir: Number(b.dataset.mv) }).then(cargar);
      if (b.hasAttribute('data-ed')) abrirItem(id);
      if (b.hasAttribute('data-del') && confirm('¿Eliminar esta actividad? También se borran sus notas, entregas y archivos.')) HB.llamar('eliminar_item', { id: id }).then(function () { cerrarForm(); return cargar(); }).catch(function (x) { alert(mensajeError(x)); });
    });
    $('nuevo-botones').addEventListener('click', function (e) { var b = e.target.closest('[data-nuevo]'); if (b) abrirForm(b.dataset.nuevo, null, []); });

    // ---------- formulario de actividad
    function cerrarForm() { var p = $('panel-item'); p.hidden = true; p.innerHTML = ''; }
    function abrirItem(id) { HB.llamar('item_edicion', { id: id }).then(function (r) { abrirForm(r.item.tipo, r.item, r.preguntas); }).catch(function (x) { alert(mensajeError(x)); }); }
    function opcionHtml(n, o, marcada) {
      return '<div class="opc"><input type="radio" name="ok-' + n + '" class="p-ok"' + (marcada ? ' checked' : '') + ' aria-label="Respuesta correcta"><input class="p-o" value="' + esc(o) + '" placeholder="Opción de respuesta"><button type="button" class="btn btn-sm2 btn-peligro" data-quitar-opc aria-label="Quitar opción">✕</button></div>';
    }
    function preguntaHtml(q) {
      var n = ++contP; q = q || { q: '', o: ['', ''], ok: 0 };
      return '<div class="preg" data-n="' + n + '"><label>Pregunta</label><textarea class="p-q" rows="2">' + esc(q.q) + '</textarea><p class="meta">Marca el círculo de la respuesta correcta (única respuesta).</p><div class="opciones">' +
        q.o.map(function (o, j) { return opcionHtml(n, o, j === q.ok); }).join('') + '</div><div class="acciones"><button type="button" class="btn btn-sm2 btn-claro" data-add-opc>+ Opción</button><button type="button" class="btn btn-sm2 btn-peligro" data-quitar-preg>Quitar pregunta</button></div></div>';
    }
    function tarjetaHtml(k) {
      k = k || {};
      return '<div class="tj-fila"><input class="tj-q" placeholder="Pregunta (frente)" value="' + esc(k.q) + '"><input class="tj-a" placeholder="Respuesta (dorso)" value="' + esc(k.a) + '"><input class="tj-x" placeholder="Principio para recordar (opcional)" value="' + esc(k.x) + '"><button type="button" class="btn btn-sm2 btn-peligro" data-quitar-tj aria-label="Quitar tarjeta">✕</button></div>';
    }
    function fechasHtml(it) {
      return '<div><label for="f-ap">Se abre (opcional)</label><input id="f-ap" type="datetime-local" value="' + loc(it && it.apertura) + '"></div><div><label for="f-ci">Se cierra (opcional)</label><input id="f-ci" type="datetime-local" value="' + loc(it && it.cierre) + '"></div>';
    }
    function abrirForm(tipo, it, preg) {
      var c = (it && it.contenido) || {}, v = function (k) { return esc(c[k] || ''); };
      var h = '<h2>' + (it ? 'Editar' : 'Nueva') + ' actividad · ' + HB.tipos[tipo][0] + ' ' + HB.tipos[tipo][1] + '</h2><form id="form-item"><div class="form-grid"><div style="grid-column:1/-1"><label for="f-titulo">Título</label><input id="f-titulo" value="' + esc(it ? it.titulo : '') + '" required></div></div>';
      if (tipo === 'texto') h += '<label for="f-cuerpo">Contenido</label><textarea id="f-cuerpo" rows="10">' + v('cuerpo') + '</textarea><p class="meta">Formato: una línea en blanco separa párrafos · «## Subtítulo» · «- » para listas · **negrita**.</p>';
      if (tipo === 'video') h += '<label for="f-url">Enlace del video (YouTube, Vimeo o archivo .mp4)</label><input id="f-url" value="' + v('url') + '" placeholder="https://www.youtube.com/watch?v=..."><p class="meta">Los videos se muestran dentro de la plataforma. Para videos propios, súbelos a YouTube (como «no listado») y pega el enlace.</p><label for="f-desc">Descripción (opcional)</label><textarea id="f-desc" rows="3">' + v('descripcion') + '</textarea>';
      if (tipo === 'pdf') h += '<label for="f-desc">Descripción (opcional)</label><textarea id="f-desc" rows="3">' + v('descripcion') + '</textarea><label for="f-archivo">Archivo (PDF, Word, PowerPoint, Excel, imagen o texto; máximo ' + HB.maxMB + ' MB)</label><input id="f-archivo" type="file">' +
        (c.archivo ? '<p class="meta">Archivo actual: <b>' + esc(c.nombre_archivo || 'documento') + '</b>. Si eliges otro, lo reemplaza.</p>' : '') + '<label for="f-url">…o pega un enlace al documento (opcional)</label><input id="f-url" value="' + v('url') + '" placeholder="https://...">';
      if (tipo === 'tarea') h += '<label for="f-instr">Instrucciones</label><textarea id="f-instr" rows="6">' + v('instrucciones') + '</textarea><label for="f-archivo">Material adjunto (opcional, máximo ' + HB.maxMB + ' MB)</label><input id="f-archivo" type="file">' +
        (c.archivo ? '<p class="meta">Adjunto actual: <b>' + esc(c.nombre_archivo || 'archivo') + '</b>.</p>' : '') + '<p class="meta">Los estudiantes entregarán su trabajo en PDF.</p><div class="form-grid">' + fechasHtml(it) + '</div>';
      if (tipo === 'foro') h += '<label for="f-plan">Tema o pregunta para debatir</label><textarea id="f-plan" rows="6">' + v('planteamiento') + '</textarea>';
      if (tipo === 'tarjetas') h += '<label for="f-intro">Mensaje inicial del recuadro «¿Sabías que…?»</label><input id="f-intro" value="' + v('intro') + '"><h3>Tarjetas</h3><div id="lista-tj">' + ((c.tarjetas || [{}]).map(tarjetaHtml).join('')) + '</div><button type="button" class="btn btn-sm2 btn-claro" data-add-tj>+ Agregar tarjeta</button>';
      if (tipo === 'examen') h += '<label for="f-desc">Instrucciones (opcional)</label><textarea id="f-desc" rows="2">' + v('descripcion') + '</textarea><div class="form-grid">' + fechasHtml(it) +
        '<div><label for="f-int">Intentos permitidos</label><input id="f-int" type="number" min="1" max="10" value="' + (it ? it.intentos : 1) + '"></div></div><h3>Preguntas de única respuesta</h3><div id="preguntas">' +
        (preg.length ? preg : [null]).map(preguntaHtml).join('') + '</div><button type="button" class="btn btn-sm2 btn-claro" data-add-preg>+ Agregar pregunta</button>';
      h += '<label class="chk"><input type="checkbox" id="f-visible"' + (!it || it.visible ? ' checked' : '') + '> Visible para los estudiantes matriculados</label><p class="aviso" id="aviso-item" role="alert"></p>' +
        '<div class="acciones"><button class="btn" type="submit">Guardar actividad</button><button class="btn btn-claro" type="button" id="cancelar-item">Cancelar</button></div></form>';
      var p = $('panel-item'); p.innerHTML = h; p.hidden = false; p.scrollIntoView && p.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('cancelar-item').addEventListener('click', cerrarForm);
      $('form-item').addEventListener('submit', function (e) { e.preventDefault(); guardar(tipo, it); });
    }
    $('panel-item').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-add-preg')) $('preguntas').insertAdjacentHTML('beforeend', preguntaHtml());
      if (b.hasAttribute('data-quitar-preg')) b.closest('.preg').remove();
      if (b.hasAttribute('data-add-opc')) { var pr = b.closest('.preg'); if (pr.querySelectorAll('.opc').length < 6) pr.querySelector('.opciones').insertAdjacentHTML('beforeend', opcionHtml(pr.dataset.n, '', false)); }
      if (b.hasAttribute('data-quitar-opc')) { var pr2 = b.closest('.preg'); if (pr2.querySelectorAll('.opc').length > 2) b.closest('.opc').remove(); }
      if (b.hasAttribute('data-add-tj')) $('lista-tj').insertAdjacentHTML('beforeend', tarjetaHtml());
      if (b.hasAttribute('data-quitar-tj')) b.closest('.tj-fila').remove();
    });

    function subir(inputId, regex, errTipo) {
      var f = $(inputId) && $(inputId).files[0];
      if (!f) return Promise.resolve(null);
      return HB.leerArchivo(f, regex, errTipo).then(function (a) { return HB.llamar('subir_archivo', { nombre: a.nombre, tipo: a.tipo, datos: a.datos }).then(function (r) { return { id: r.id, nombre: a.nombre }; }); });
    }
    function recolectar(tipo, it) {
      var g = function (id) { return $(id) ? $(id).value : ''; }, c = {}, old = (it && it.contenido) || {};
      var p = { curso: cid, tipo: tipo, titulo: g('f-titulo'), visible: $('f-visible').checked, contenido: c, intentos: 1 };
      if (it) p.id = it.id;
      if (!p.titulo.trim()) return Promise.reject({ msg: 'Escribe un título para la actividad.' });
      if (tipo === 'texto') c.cuerpo = g('f-cuerpo');
      if (tipo === 'video') { c.url = g('f-url').trim(); c.descripcion = g('f-desc'); if (!c.url) return Promise.reject({ msg: 'Pega el enlace del video.' }); }
      if (tipo === 'foro') c.planteamiento = g('f-plan');
      if (tipo === 'tarjetas') {
        c.intro = g('f-intro'); c.tarjetas = [];
        document.querySelectorAll('.tj-fila').forEach(function (r) { var q = r.querySelector('.tj-q').value.trim(), a = r.querySelector('.tj-a').value.trim(); if (q && a) c.tarjetas.push({ q: q, a: a, t: '', x: r.querySelector('.tj-x').value.trim() }); });
        if (!c.tarjetas.length) return Promise.reject({ msg: 'Agrega al menos una tarjeta con pregunta y respuesta.' });
      }
      if (tipo === 'examen') {
        c.descripcion = g('f-desc'); p.intentos = Number(g('f-int')) || 1; p.apertura = iso(g('f-ap')); p.cierre = iso(g('f-ci')); p.preguntas = [];
        var err = null;
        document.querySelectorAll('.preg').forEach(function (r, k) {
          var q = r.querySelector('.p-q').value.trim(), opts = [], ok = -1;
          r.querySelectorAll('.opc').forEach(function (o) { var t = o.querySelector('.p-o').value.trim(); if (t) { if (o.querySelector('.p-ok').checked) ok = opts.length; opts.push(t); } });
          if (!err && !q) err = 'Escribe el enunciado de la pregunta ' + (k + 1) + '.';
          else if (!err && opts.length < 2) err = 'La pregunta ' + (k + 1) + ' necesita al menos 2 opciones con texto.';
          else if (!err && ok < 0) err = 'Marca la respuesta correcta de la pregunta ' + (k + 1) + '.';
          p.preguntas.push({ q: q, o: opts, ok: ok });
        });
        if (!p.preguntas.length) err = 'Agrega al menos una pregunta.';
        if (err) return Promise.reject({ msg: err });
      }
      if (tipo === 'tarea') {
        c.instrucciones = g('f-instr'); p.apertura = iso(g('f-ap')); p.cierre = iso(g('f-ci'));
        if (p.apertura && p.cierre && new Date(p.cierre) <= new Date(p.apertura)) return Promise.reject({ msg: 'El cierre debe ser posterior a la apertura.' });
      }
      if (tipo === 'examen' && p.apertura && p.cierre && new Date(p.cierre) <= new Date(p.apertura)) return Promise.reject({ msg: 'El cierre debe ser posterior a la apertura.' });
      if (tipo === 'pdf' || tipo === 'tarea') {
        var regex = HB.DOC_RE;
        return subir('f-archivo', regex, 'tipo_archivo').then(function (f) {
          if (tipo === 'pdf') { c.descripcion = g('f-desc'); c.url = g('f-url').trim(); }
          if (f) { c.archivo = f.id; c.nombre_archivo = f.nombre; delete c.url; }
          else if (old.archivo && !(tipo === 'pdf' && c.url)) { c.archivo = old.archivo; c.nombre_archivo = old.nombre_archivo; }
          if (tipo === 'pdf' && !c.archivo && !c.url) throw { msg: 'Sube un archivo o pega un enlace al documento.' };
          return p;
        });
      }
      return Promise.resolve(p);
    }
    function guardar(tipo, it) {
      var av = $('aviso-item'), bt = $('form-item').querySelector('button[type=submit]'); av.textContent = ''; bt.disabled = true;
      recolectar(tipo, it).then(function (p) { return HB.llamar('guardar_item', p); })
        .then(function () { cerrarForm(); return cargar(); })
        .catch(function (x) { bt.disabled = false; av.textContent = msgErr(x); });
    }

    cargar().then(function () { var i = qs.get('i'); if (i) abrirItem(i); });
  }

  // ================================================================ ENTREGAS DE UNA TAREA
  function entregas() {
    var iid = qs.get('i');
    if (!iid) { cont.innerHTML = aviso('Elige una tarea desde <a href="evaluaciones.html">Evaluaciones</a>.'); return; }
    HB.llamar('item', { id: iid }).then(function (d) {
      var it = d.item; document.querySelector('h1').textContent = 'Entregas: ' + it.titulo;
      return HB.llamar('entregas', { item: iid }).then(function (r) {
        var porU = {}; r.entregas.forEach(function (g) { porU[g.u] = g; });
        var pend = r.entregas.filter(function (g) { return !g.calificada; }).length;
        var filas = r.estudiantes.map(function (e) {
          var g = porU[e.id];
          if (!g) return '<tr><td><b>' + esc(e.nombre) + '</b></td><td>' + esc(e.cedula) + '</td><td><span class="estado no">Sin entregar</span></td><td>—</td><td>—</td><td>—</td><td></td></tr>';
          return '<tr data-id="' + esc(g.id) + '"><td><b>' + esc(e.nombre) + '</b></td><td>' + esc(e.cedula) + '</td><td>' + (g.calificada ? '<span class="estado si">Calificada</span>' : '<span class="estado prog">Por calificar</span>') + '</td>' +
            '<td><button class="btn btn-sm2 btn-claro" data-arch="' + esc(g.archivo) + '">📄 ' + esc(g.nombre) + '</button><br><small>' + HB.fecha(g.fecha) + '</small></td>' +
            '<td><input type="number" class="nt" min="0" max="5" step="0.1" value="' + (g.nota === null || g.nota === undefined ? '' : g.nota) + '" style="width:5rem" aria-label="Nota de ' + esc(e.nombre) + '"></td>' +
            '<td><input class="cm" value="' + esc(g.comentario || '') + '" placeholder="Comentario (opcional)" aria-label="Comentario"></td><td class="acc"><button class="btn btn-sm2" data-g>Guardar nota</button></td></tr>';
        }).join('');
        cont.innerHTML = '<p class="meta">' + HB.badge(it.estado) + ' ' + (it.cierre ? 'Cierra: <b>' + HB.fecha(it.cierre) + '</b> · ' : '') + 'Entregas: <b>' + r.entregas.length + '</b> de ' + r.estudiantes.length + ' · Por calificar: <b>' + pend + '</b> · Escala 0,0 a 5,0.</p>' +
          (r.estudiantes.length ? '<div class="scroll-x"><table class="tabla"><tr><th>Estudiante</th><th>Cédula</th><th>Estado</th><th>Archivo</th><th>Nota</th><th>Comentario</th><th>Acción</th></tr>' + filas + '</table></div>' : aviso('No hay estudiantes matriculados en este curso.')) +
          '<div class="acciones"><a class="btn btn-claro" href="editar-curso.html?c=' + encodeURIComponent(it.curso) + '">← Volver al curso</a></div><p class="aviso" id="aviso-ent" role="status"></p>';
      });
    }).catch(function (e) { cont.innerHTML = aviso(mensajeError(e)); });
    cont.addEventListener('click', function (e) {
      var a = e.target.closest('[data-arch]'), g = e.target.closest('[data-g]');
      if (a) HB.abrirArchivo(a.dataset.arch, true).catch(function (x) { alert(mensajeError(x)); });
      if (g) {
        var tr = g.closest('tr'); g.disabled = true;
        HB.llamar('calificar_entrega', { id: tr.dataset.id, nota: tr.querySelector('.nt').value, comentario: tr.querySelector('.cm').value })
          .then(function () { location.reload(); }).catch(function (x) { g.disabled = false; $('aviso-ent').textContent = mensajeError(x); });
      }
    });
  }
});
