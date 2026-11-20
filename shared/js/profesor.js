// Módulo del profesor (datos reales desde la base de datos)
HB.listo.then(function () {
  if (!HB.yo || HB.yo.rol !== 'profesor') return;
  var esc = HB.esc, vista = document.body.dataset.vista, cont = document.getElementById('vista');
  if (!cont) return;
  var $ = function (id) { return document.getElementById(id); };
  function sinAcentos(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  // Coincide por nombre, correo o cédula (acepta puntos, espacios y guiones en la cédula)
  function coincide(e, q) {
    var toks = sinAcentos(q).split(/\s+/).filter(Boolean);
    var hay = sinAcentos(e.nombre + ' ' + (e.correo || '')), ced = String(e.cedula || '').replace(/\D/g, '');
    return toks.every(function (t) { var d = t.replace(/\D/g, ''); return hay.indexOf(t) > -1 || (d && ced.indexOf(d) > -1); });
  }
  function buscador(alBuscar) {
    var inp = $('buscar');
    inp.addEventListener('input', function () { alBuscar(inp.value); });
    $('form-buscar').addEventListener('submit', function (e) { e.preventDefault(); alBuscar(inp.value); });
    $('limpiar').addEventListener('click', function () { inp.value = ''; alBuscar(''); inp.focus(); });
  }
  var err = function (e) { cont.innerHTML = '<p class="aviso-info">' + mensajeError(e) + '</p>'; };
  function descargarCSV(nombre, filas) {
    var txt = '\ufeff' + filas.map(function (f) { return f.map(function (c) { return '"' + String(c === null || c === undefined ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function checks(idContenedor) {
    $(idContenedor).innerHTML = HB.cursos.map(function (c) { return '<label class="chk"><input type="checkbox" value="' + c.slug + '"> ' + esc(c.nombre) + '</label>'; }).join('');
  }
  function marcados(idContenedor) { return Array.prototype.map.call($(idContenedor).querySelectorAll('input:checked'), function (i) { return i.value; }); }
  function mejores(its) {
    var m = {}; its.forEach(function (i) { var k = i.u + '|' + i.curso; if (m[k] === undefined || i.nota > m[k]) m[k] = i.nota; }); return m;
  }

  // ============================================================ ESTUDIANTES
  if (vista === 'estudiantes') {
    checks('cursos-nuevos');
    var lista = [], filtroTxt = '';
    var URL_LOGIN = new URL('../../auth/html/login.html', location.href).href, ALFA = 'abcdefghjkmnpqrstuvwxyz23456789';
    function genClave() { var a = new Uint32Array(6); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (n) { return ALFA.charAt(n % ALFA.length); }).join(''); }
    function pintar() {
      var f = lista.filter(function (e) { return coincide(e, filtroTxt); });
      $('tabla-est').innerHTML = f.length ? '<table class="tabla"><tr><th>Nombre</th><th>Usuario (cédula)</th><th>Correo</th><th>Cursos</th><th>Acciones</th></tr>' + f.map(function (e) {
        return '<tr><td><b>' + esc(e.nombre) + '</b></td><td><code>' + esc(e.cedula) + '</code></td><td>' + esc(e.correo || '—') + '</td><td>' + e.cursos.length + '</td><td class="acc">' +
          '<button class="btn btn-sm2" data-act="clave" data-id="' + e.id + '">Nueva contraseña</button> <button class="btn btn-sm2 btn-peligro" data-act="del" data-id="' + e.id + '">Eliminar</button></td></tr>'; }).join('') + '</table>'
        : '<p class="aviso-info">' + (lista.length ? 'No se encontró ningún estudiante con «' + esc(filtroTxt.trim()) + '».' : 'No hay estudiantes registrados todavía.') + '</p>';
      $('total-est').textContent = lista.length;
      $('conteo').textContent = filtroTxt.trim() ? 'Mostrando ' + f.length + ' de ' + lista.length + ' estudiantes.' : '';
    }
    function cargar() { return HB.llamar('estudiantes').then(function (r) { lista = r.estudiantes; pintar(); }).catch(err); }
    cargar();
    buscador(function (v) { filtroTxt = v; pintar(); });

    // Tarjeta con usuario y contraseña para entregar
    function credenciales(filas) {
      var c = $('credenciales'); c.hidden = false;
      c.innerHTML = '<h2>Credenciales para entregar</h2><p class="meta">Entrar en: <b>' + esc(URL_LOGIN) + '</b><br>Guarda o imprime esta lista ahora: por seguridad las contraseñas no se pueden volver a consultar. ' +
        'Si alguien la olvida, genera una nueva con «Nueva contraseña».</p><div class="scroll-x"><table class="tabla"><tr><th>Estudiante</th><th>Usuario</th><th>Contraseña</th></tr>' +
        filas.map(function (f) { return '<tr><td>' + esc(f.nombre) + '</td><td><code>' + esc(f.usuario) + '</code></td><td><code>' + esc(f.clave) + '</code></td></tr>'; }).join('') + '</table></div>' +
        '<div class="acciones no-imprimir"><button class="btn" id="cred-copiar" type="button">Copiar</button><button class="btn btn-claro" id="cred-csv" type="button">Descargar CSV</button>' +
        '<button class="btn btn-claro" id="cred-imp" type="button">Imprimir</button><button class="btn btn-claro" id="cred-cerrar" type="button">Cerrar</button></div>';
      $('cred-copiar').addEventListener('click', function () {
        var txt = 'Entrar en: ' + URL_LOGIN + '\n' + filas.map(function (f) { return f.nombre + '\tUsuario: ' + f.usuario + '\tContraseña: ' + f.clave; }).join('\n');
        var fin = function () { $('cred-copiar').textContent = '¡Copiado!'; };
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(fin, fin);
        else { var t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); fin(); }
      });
      $('cred-csv').addEventListener('click', function () { descargarCSV('credenciales.csv', [['Estudiante', 'Usuario', 'Contraseña']].concat(filas.map(function (f) { return [f.nombre, f.usuario, f.clave]; }))); });
      $('cred-imp').addEventListener('click', function () { window.print(); });
      $('cred-cerrar').addEventListener('click', function () { c.hidden = true; c.innerHTML = ''; });
      if (c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function crear(nuevos) {
      var gen = $('gen').checked, vistos = {};
      nuevos = nuevos.map(function (e) {
        var c = String(e.cedula || '').trim();
        return { nombre: String(e.nombre || '').trim(), cedula: c, correo: e.correo, clave: String(e.clave || '').trim() || (gen ? genClave() : c) };
      }).filter(function (e) { if (!e.cedula) return true; if (vistos[e.cedula]) return false; vistos[e.cedula] = 1; return true; });
      return HB.llamar('crear_estudiantes', { lista: nuevos, cursos: marcados('cursos-nuevos') }).then(function (r) {
        var om = r.omitidos || [];
        $('resultado').innerHTML = 'Estudiantes creados: <b>' + r.creados + '</b>.' + (om.length ? ' Omitidos (cédula repetida o datos incompletos): ' + esc(om.join(', ')) + '.' : '');
        var ok = nuevos.filter(function (e) { return e.nombre && e.cedula && om.indexOf(e.cedula) < 0; });
        if (r.creados && ok.length) credenciales(ok.map(function (e) { return { nombre: e.nombre, usuario: e.cedula, clave: e.clave }; }));
        return cargar().then(function () { return r; });
      });
    }
    $('form-nuevo').addEventListener('submit', function (e) {
      e.preventDefault();
      var g = function (n) { return e.target.querySelector('[name=' + n + ']').value; };
      crear([{ nombre: g('nombre'), cedula: g('cedula'), correo: g('correo'), clave: g('clave') }])
        .then(function (r) { if (r.creados) e.target.reset(); }).catch(function (x) { $('resultado').textContent = mensajeError(x); });
    });
    $('tabla-est').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var est = lista.filter(function (x) { return x.id === b.dataset.id; })[0];
      if (b.dataset.act === 'del' && confirm('¿Eliminar a ' + est.nombre + '? También se borrarán sus notas y matrículas.'))
        HB.llamar('eliminar_estudiante', { id: est.id }).then(cargar).catch(function (x) { alert(mensajeError(x)); });
      if (b.dataset.act === 'clave') {
        var n = prompt('Nueva contraseña para ' + est.nombre + '.\nEscríbela o deja vacío para generar una automática:');
        if (n === null) return;
        n = n.trim() || genClave();
        if (n.length < 4) { alert('La contraseña debe tener al menos 4 caracteres.'); return; }
        HB.llamar('restablecer_clave', { id: est.id, clave: n }).then(function () { credenciales([{ nombre: est.nombre, usuario: est.cedula, clave: n }]); })
          .catch(function (x) { alert(mensajeError(x)); });
      }
    });

    // Importación desde Excel/CSV
    var filas = [];
    function norm(k) { return String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, ''); }
    var sin = { nombre: ['nombre', 'nombres', 'nombrecompleto', 'estudiante'], cedula: ['cedula', 'documento', 'identificacion', 'id', 'cc'], correo: ['correo', 'email', 'correoelectronico'], clave: ['clave', 'contrasena', 'password'] };
    $('archivo').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (!window.XLSX) { $('prev').textContent = 'No se pudo cargar el lector de Excel (revisa tu conexión a internet).'; return; }
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var wb = XLSX.read(new Uint8Array(rd.result), { type: 'array' });
          var data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
          filas = data.map(function (o) {
            var r = {}; Object.keys(o).forEach(function (k) { var n = norm(k); Object.keys(sin).forEach(function (c) { if (sin[c].indexOf(n) > -1) r[c] = String(o[k]).trim(); }); });
            return r;
          }).filter(function (r) { return r.nombre || r.cedula; });
          $('prev').innerHTML = filas.length ? 'Se leyeron <b>' + filas.length + '</b> estudiantes. Primeros: ' + esc(filas.slice(0, 3).map(function (r) { return r.nombre; }).join(', ')) + '…' : 'No se encontraron filas. Usa la plantilla: columnas nombre, cedula, correo, clave.';
          $('importar').disabled = !filas.length;
        } catch (x) { $('prev').textContent = 'No se pudo leer el archivo. Usa .xlsx o .csv.'; }
      };
      rd.readAsArrayBuffer(f);
    });
    $('importar').addEventListener('click', function () {
      $('importar').disabled = true;
      crear(filas).then(function () { filas = []; $('prev').textContent = ''; $('archivo').value = ''; })
        .catch(function (x) { $('resultado').textContent = mensajeError(x); $('importar').disabled = false; });
    });
    $('plantilla').addEventListener('click', function () {
      descargarCSV('plantilla-estudiantes.csv', [['nombre', 'cedula', 'correo', 'clave'], ['Ana Pérez', '1001234567', 'ana@correo.com', ''], ['Carlos Gómez', '1007654321', '', '']]);
    });
  }

  // ============================================================ MATRÍCULAS
  if (vista === 'matriculas') {
    var est = [], q = '';
    function tabla() {
      var f = est.filter(function (e) { return coincide(e, q); });
      $('conteo').textContent = q.trim() ? 'Mostrando ' + f.length + ' de ' + est.length + ' estudiantes.' : '';
      var h = '<div class="scroll-x"><table class="tabla" data-ancha><tr><th>Estudiante</th>' + HB.cursos.map(function (c) {
        return '<th class="cen">' + esc(c.nombre) + '<br><button class="btn btn-sm2" data-col="' + c.slug + '" data-a="agregar">Todos</button> <button class="btn btn-sm2 btn-claro" data-col="' + c.slug + '" data-a="quitar">Ninguno</button></th>'; }).join('') + '</tr>';
      f.forEach(function (e) {
        h += '<tr><td><b>' + esc(e.nombre) + '</b><br><small>' + esc(e.cedula) + '</small></td>' + HB.cursos.map(function (c) {
          return '<td class="cen"><input type="checkbox" aria-label="' + esc(e.nombre + ' en ' + c.nombre) + '" data-id="' + e.id + '" data-c="' + c.slug + '"' + (e.cursos.indexOf(c.slug) > -1 ? ' checked' : '') + '></td>'; }).join('') + '</tr>';
      });
      cont.innerHTML = f.length ? h + '</table></div>' : '<p class="aviso-info">' + (est.length ? 'No se encontró ningún estudiante con «' + esc(q.trim()) + '».' : 'No hay estudiantes. Primero créalos en la sección Estudiantes.') + '</p>';
    }
    function cargarM() { return HB.llamar('estudiantes').then(function (r) { est = r.estudiantes; tabla(); }).catch(err); }
    cargarM();
    buscador(function (v) { q = v; tabla(); });
    $('todo').addEventListener('click', function () {
      if (est.length && confirm('¿Matricular a todos los estudiantes en los 6 cursos?'))
        HB.llamar('matricular', { ids: est.map(function (e) { return e.id; }), cursos: HB.cursos.map(function (c) { return c.slug; }), accion: 'agregar' }).then(cargarM);
    });
    cont.addEventListener('change', function (e) {
      var i = e.target; if (!i.dataset.id) return;
      i.disabled = true;
      HB.llamar('matricular', { ids: [i.dataset.id], cursos: [i.dataset.c], accion: i.checked ? 'agregar' : 'quitar' }).then(function () {
        var s = est.filter(function (x) { return x.id === i.dataset.id; })[0];
        s.cursos = s.cursos.filter(function (c) { return c !== i.dataset.c; }); if (i.checked) s.cursos.push(i.dataset.c); i.disabled = false;
      }).catch(function (x) { i.checked = !i.checked; i.disabled = false; alert(mensajeError(x)); });
    });
    cont.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-col]'); if (!b || !est.length) return;
      HB.llamar('matricular', { ids: est.map(function (x) { return x.id; }), cursos: [b.dataset.col], accion: b.dataset.a }).then(cargarM);
    });
  }

  // ============================================================ PANEL
  if (vista === 'panel') {
    var gc = $('grid-cursos');
    gc.innerHTML = HB.cursos.length ? HB.cursos.map(function (c) {
      return HB.tarjetaCurso(c, '../../estudiante/html/curso.html?c=' + encodeURIComponent(c.id), '<p class="meta"><b>' + c.matriculados + '</b> estudiantes matriculados</p>');
    }).join('') : '<p class="aviso-info">Aún no hay cursos. <a href="cursos.html">Crea el primero</a>.</p>';
    Promise.all([HB.llamar('estudiantes'), HB.llamar('actividades'), HB.llamar('notas'), HB.llamar('descargas_resumen')]).then(function (r) {
      var es = r[0].estudiantes, ac = r[1].actividades, N = r[2], ds = r[3].descargas;
      var mat = es.reduce(function (a, e) { return a + e.cursos.length; }, 0);
      var abiertas = ac.filter(function (x) { return x.estado === 'abierto'; }).length;
      var porCalificar = N.entregas.filter(function (g) { return !g.calificada; }).length;
      var nombres = {}, titulos = {}; es.forEach(function (e) { nombres[e.id] = e.nombre; }); N.items.forEach(function (i) { titulos[i.id] = i.titulo; });
      var h = '<div class="panel">' + [['Estudiantes', es.length], ['Cursos', HB.cursos.length], ['Matrículas', mat], ['Actividades abiertas', abiertas], ['Exámenes presentados', N.intentos.length], ['Tareas entregadas', N.entregas.length], ['Tareas por calificar', porCalificar], ['Descargas', ds.length]]
        .map(function (x) { return '<div class="dato"><b>' + x[1] + '</b>' + x[0] + '</div>'; }).join('') + '</div>';
      var rec = N.intentos.map(function (i) { return { f: i.fecha, u: i.u, t: 'Presentó «' + (titulos[i.item] || '') + '»', n: HB.nota(i.nota) }; })
        .concat(N.entregas.map(function (g) { return { f: g.fecha, u: g.u, t: 'Entregó «' + (titulos[g.item] || '') + '»', n: g.calificada ? HB.nota(g.nota) : 'por calificar' }; }))
        .sort(function (a, b) { return a.f < b.f ? 1 : -1; }).slice(0, 8);
      h += '<h2>Actividad reciente</h2>' + (rec.length ? '<div class="scroll-x"><table class="tabla"><tr><th>Estudiante</th><th>Actividad</th><th>Nota</th><th>Fecha</th></tr>' + rec.map(function (x) {
        return '<tr><td>' + esc(nombres[x.u] || '(eliminado)') + '</td><td>' + esc(x.t) + '</td><td class="nota">' + esc(x.n) + '</td><td>' + HB.fecha(x.f) + '</td></tr>'; }).join('') + '</table></div>'
        : '<p class="aviso-info">Todavía no hay actividad de los estudiantes.</p>');
      cont.innerHTML = h;
    }).catch(err);
  }

  // ============================================================ CURSOS
  if (vista === 'cursos') {
    var sel = $('c-paleta'); sel.innerHTML = HB.paletas.map(function (p, i) { return '<option value="' + i + '">' + p[0] + '</option>'; }).join('');
    function pintarCursos() {
      cont.innerHTML = HB.cursos.length ? '<div class="scroll-x"><table class="tabla"><tr><th>Curso</th><th>Matriculados</th><th>Acciones</th></tr>' + HB.cursos.map(function (c) {
        return '<tr><td><b>' + esc(c.emoji) + ' ' + esc(c.nombre) + '</b><br><small>' + esc(c.descripcion) + '</small></td><td>' + c.matriculados + '</td><td class="acc">' +
          '<a class="btn btn-sm2" href="editar-curso.html?c=' + encodeURIComponent(c.id) + '">Editar contenido</a> <a class="btn btn-sm2 btn-claro" href="../../estudiante/html/curso.html?c=' + encodeURIComponent(c.id) + '">Ver</a> ' +
          '<button class="btn btn-sm2 btn-peligro" data-del="' + esc(c.id) + '">Eliminar</button></td></tr>'; }).join('') + '</table></div>' : '<p class="aviso-info">Aún no hay cursos. Crea el primero con el formulario de arriba.</p>';
    }
    pintarCursos();
    cont.addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]'); if (!b) return;
      if (confirm('¿Eliminar el curso «' + HB.nombreCurso(b.dataset.del) + '»? Se borrarán todas sus actividades, notas, entregas y matrículas. No se puede deshacer.'))
        HB.llamar('eliminar_curso', { id: b.dataset.del }).then(HB.cargarCursos).then(pintarCursos).catch(function (x) { alert(mensajeError(x)); });
    });
    $('form-curso').addEventListener('submit', function (e) {
      e.preventDefault();
      var g = function (n) { return e.target.querySelector('[name=' + n + ']').value; }, p = HB.paletas[Number(g('paleta'))];
      var bt = e.target.querySelector('button[type=submit]'); bt.disabled = true;
      HB.llamar('crear_curso', { nombre: g('nombre'), descripcion: g('descripcion'), emoji: g('emoji'), color1: p[1], color2: p[2], video: g('video') })
        .then(function (r) { location.href = 'editar-curso.html?c=' + encodeURIComponent(r.id); })
        .catch(function (x) { bt.disabled = false; $('aviso-curso').textContent = mensajeError(x); });
    });
  }

  // ============================================================ EVALUACIONES Y TAREAS (programar)
  if (vista === 'evaluaciones') {
    var loc = function (iso) { if (!iso) return ''; var d = new Date(iso), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
    HB.llamar('actividades').then(function (r) {
      cont.innerHTML = r.actividades.length ? '<div class="scroll-x"><table class="tabla"><tr><th>Curso</th><th>Actividad</th><th>Estado</th><th>Visible</th><th>Abre</th><th>Cierra</th><th>Intentos</th><th>Participación</th><th>Acción</th></tr>' + r.actividades.map(function (x) {
        return '<tr data-id="' + esc(x.id) + '"><td>' + esc(x.cursoNombre) + '</td><td>' + HB.tipos[x.tipo][0] + ' <b>' + esc(x.titulo) + '</b></td><td>' + HB.badge(x.estado) + '</td>' +
          '<td class="cen"><input type="checkbox" class="v" aria-label="Visible"' + (x.visible ? ' checked' : '') + '></td><td><input type="datetime-local" class="a" value="' + loc(x.apertura) + '"></td><td><input type="datetime-local" class="z" value="' + loc(x.cierre) + '"></td>' +
          '<td>' + (x.tipo === 'examen' ? '<input type="number" class="n" min="1" max="10" value="' + x.intentos + '" style="width:4.5rem">' : '—') + '</td><td>' + x.presentaron + ' de ' + x.matriculados + '</td>' +
          '<td class="acc"><button class="btn btn-sm2" data-g>Guardar</button> <a class="btn btn-sm2 btn-claro" href="editar-curso.html?c=' + encodeURIComponent(x.curso) + '&i=' + encodeURIComponent(x.id) + '">Editar</a>' +
          (x.tipo === 'tarea' ? ' <a class="btn btn-sm2 btn-claro" href="entregas.html?i=' + encodeURIComponent(x.id) + '">Entregas</a>' : '') + '</td></tr>'; }).join('') + '</table></div>' +
        '<p class="meta">Si dejas vacías las fechas, la actividad queda abierta mientras esté visible. Los estudiantes solo la ven si están matriculados en el curso.</p>'
        : '<p class="aviso-info">Todavía no hay exámenes ni tareas. Créalos en «Cursos → Editar contenido».</p>';
    }).catch(err);
    cont.addEventListener('click', function (e) {
      var b = e.target.closest('[data-g]'); if (!b) return;
      var tr = b.closest('tr'), val = function (c) { return tr.querySelector(c).value; }, a = val('.a'), z = val('.z');
      if (a && z && new Date(z) <= new Date(a)) { alert('La fecha de cierre debe ser posterior a la de apertura.'); return; }
      b.disabled = true;
      var n = tr.querySelector('.n');
      HB.llamar('programar_item', { id: tr.dataset.id, visible: tr.querySelector('.v').checked, apertura: a ? new Date(a).toISOString() : null, cierre: z ? new Date(z).toISOString() : null, intentos: n ? Number(n.value) : null })
        .then(function () { location.reload(); }).catch(function (x) { b.disabled = false; alert(mensajeError(x)); });
    });
  }

  // ============================================================ CALIFICACIONES
  if (vista === 'calificaciones') {
    Promise.all([HB.llamar('estudiantes'), HB.llamar('notas')]).then(function (r) {
      var es = r[0].estudiantes, N = r[1], sel = $('filtro'), gm = {};
      N.intentos.forEach(function (i) { var k = i.u + '|' + i.item; if (!gm[k] || i.nota > gm[k].nota) gm[k] = { nota: i.nota }; });
      N.entregas.forEach(function (g) { gm[g.u + '|' + g.item] = g.calificada ? { nota: g.nota } : { por: true }; });
      sel.innerHTML = '<option value="">Todos los cursos (promedios)</option>' + HB.cursos.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nombre) + '</option>'; }).join('');
      var prom = function (vals) { return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null; };
      var celda = function (e, it) {
        var g = gm[e.id + '|' + it.id];
        if (g && g.nota !== undefined) return { v: g.nota, h: '<td class="cen nota' + (g.nota < 3 ? ' baja' : '') + '">' + HB.nota(g.nota) + '</td>' };
        if (g && g.por) return { v: null, h: '<td class="cen"><span class="estado prog">Por calificar</span></td>' };
        return { v: null, h: '<td class="cen"><span class="gris">' + (e.cursos.indexOf(it.curso) > -1 ? 'Pendiente' : '—') + '</span></td>' };
      };
      var matriz = [];
      function pintar() {
        var cid = sel.value, cols = cid ? HB.cursos.filter(function (c) { return c.id === cid; }) : HB.cursos, its = cid ? N.items.filter(function (i) { return i.curso === cid; }) : [];
        var cab = cid ? its.map(function (i) { return HB.tipos[i.tipo][0] + ' ' + i.titulo; }) : cols.map(function (c) { return c.nombre; });
        matriz = [['Estudiante', 'Cédula'].concat(cab).concat(['Promedio'])];
        var h = '<div class="scroll-x"><table class="tabla" data-ancha><tr><th>Estudiante</th><th>Cédula</th>' + cab.map(function (t) { return '<th class="cen">' + esc(t) + '</th>'; }).join('') + '<th class="cen">Promedio</th></tr>';
        es.forEach(function (e) {
          var vals = [], fila = [e.nombre, e.cedula], tds = '';
          if (cid) its.forEach(function (it) { var c = celda(e, it); if (c.v !== null) vals.push(c.v); tds += c.h; fila.push(c.v === null ? '' : c.v); });
          else cols.forEach(function (c) {
            var v = N.items.filter(function (i) { return i.curso === c.id; }).map(function (i) { return celda(e, i).v; }).filter(function (x) { return x !== null; }), p = prom(v);
            if (p !== null) vals.push(p);
            tds += '<td class="cen nota' + (p !== null && p < 3 ? ' baja' : '') + '">' + (p !== null ? HB.nota(p) : '<span class="gris">' + (e.cursos.indexOf(c.id) > -1 ? 'Pendiente' : '—') + '</span>') + '</td>'; fila.push(p === null ? '' : Math.round(p * 10) / 10);
          });
          var pg = prom(vals); fila.push(pg === null ? '' : Math.round(pg * 10) / 10); matriz.push(fila);
          h += '<tr><td><b>' + esc(e.nombre) + '</b></td><td>' + esc(e.cedula) + '</td>' + tds + '<td class="cen nota">' + HB.nota(pg) + '</td></tr>';
        });
        var nom = {}; es.forEach(function (e) { nom[e.id] = e; });
        var tit = {}; N.items.forEach(function (i) { tit[i.id] = i; });
        var det = N.intentos.map(function (i) { return { u: i.u, item: i.item, nota: i.nota, f: i.fecha, d: i.correctas + ' de ' + i.total + ' correctas' }; })
          .concat(N.entregas.map(function (g) { return { u: g.u, item: g.item, nota: g.calificada ? g.nota : null, f: g.fecha, d: g.calificada ? 'Calificada' : 'Por calificar' }; }))
          .filter(function (x) { return tit[x.item] && (!cid || tit[x.item].curso === cid); }).sort(function (a, b) { return a.f < b.f ? 1 : -1; });
        h += '</table></div><h2>Detalle de intentos y entregas</h2>' + (det.length ? '<div class="scroll-x"><table class="tabla"><tr><th>Estudiante</th><th>Curso</th><th>Actividad</th><th>Detalle</th><th>Nota</th><th>Fecha</th></tr>' + det.map(function (x) {
          return '<tr><td>' + esc((nom[x.u] || {}).nombre || '(eliminado)') + '</td><td>' + esc(HB.nombreCurso(tit[x.item].curso)) + '</td><td>' + HB.tipos[tit[x.item].tipo][0] + ' ' + esc(tit[x.item].titulo) + '</td><td>' + x.d + '</td><td class="nota">' + HB.nota(x.nota) + '</td><td>' + HB.fecha(x.f) + '</td></tr>'; }).join('') + '</table></div>'
          : '<p class="aviso-info">Todavía no hay exámenes presentados ni tareas entregadas.</p>');
        cont.innerHTML = es.length ? h : '<p class="aviso-info">No hay estudiantes registrados.</p>';
      }
      pintar(); sel.addEventListener('change', pintar);
      $('exportar').addEventListener('click', function () { descargarCSV('calificaciones.csv', matriz); });
    }).catch(err);
  }

  // ============================================================ DESCARGAS
  if (vista === 'descargas') {
    HB.llamar('descargas_resumen').then(function (r) {
      var ds = r.descargas, filas = r.items.map(function (i) {
        var d = ds.filter(function (x) { return x.item === i.id; }), quienes = {}; d.forEach(function (x) { quienes[x.u] = 1; });
        return '<tr><td>' + esc(HB.nombreCurso(i.curso)) + '</td><td>📄 ' + esc(i.titulo) + '</td><td class="cen">' + d.length + '</td><td class="cen">' + Object.keys(quienes).length + '</td><td>' + (d.length ? HB.fecha(d[0].fecha) : '—') + '</td></tr>';
      }).join('');
      var tit = {}; r.items.forEach(function (i) { tit[i.id] = i.titulo; });
      cont.innerHTML = (r.items.length ? '<div class="scroll-x"><table class="tabla"><tr><th>Curso</th><th>Documento</th><th class="cen">Descargas</th><th class="cen">Estudiantes</th><th>Última descarga</th></tr>' + filas + '</table></div>' : '<p class="aviso-info">Aún no hay documentos en los cursos.</p>') +
        '<h2>Últimas descargas</h2>' + (ds.length ? '<div class="scroll-x"><table class="tabla"><tr><th>Estudiante</th><th>Documento</th><th>Fecha</th></tr>' + ds.slice(0, 50).map(function (x) {
          return '<tr><td>' + esc(x.nombre) + '</td><td>' + esc(tit[x.item] || x.item) + '</td><td>' + HB.fecha(x.fecha) + '</td></tr>'; }).join('') + '</table></div>' : '<p class="aviso-info">Todavía no hay descargas registradas.</p>');
    }).catch(err);
  }
});
