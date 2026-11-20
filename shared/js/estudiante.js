// Páginas del estudiante: inicio, contenido, evaluaciones y calificaciones (datos reales)
HB.listo.then(function () {
  if (!HB.yo || HB.yo.rol !== 'estudiante') return;
  var esc = HB.esc, qs = new URLSearchParams(location.search), $ = function (id) { return document.getElementById(id); };
  function aviso(t) { return '<p class="aviso-info">' + t + '</p>'; }
  function porCurso(fn) { return Promise.all(HB.cursos.map(function (c) { return HB.llamar('curso', { id: c.id }).then(function (r) { return { curso: c, items: r.items }; }); })).then(fn); }
  var linkItem = function (c, i) { return 'curso.html?c=' + encodeURIComponent(c.id) + '&i=' + i; };

  // ---------------------------------------------------------------- INICIO
  if ($('cursos-grid')) {
    $('titulo-cursos').textContent = 'Tus cursos (' + HB.cursos.length + ')';
    if (!HB.cursos.length) $('sin-cursos').hidden = false;
    $('cursos-grid').innerHTML = HB.cursos.map(function (c) { return HB.tarjetaCurso(c, 'curso.html?c=' + encodeURIComponent(c.id)); }).join('');
  }

  // ---------------------------------------------------------------- CONTENIDO
  var cl = $('contenido-lista');
  if (cl) {
    if (!HB.cursos.length) { cl.innerHTML = aviso('Aún no estás matriculado en ningún curso. Tu profesor te matriculará y aparecerán aquí.'); }
    else porCurso(function (lista) {
      cl.innerHTML = lista.map(function (x) {
        return '<section class="bloque-curso tarjeta"><h2>' + esc(x.curso.emoji) + ' ' + esc(x.curso.nombre) + '</h2><p class="meta">' + esc(x.curso.descripcion) + '</p>' +
          (x.items.length ? '<div class="enlaces-curso">' + x.items.map(function (i, k) { return '<a class="btn btn-claro" href="' + linkItem(x.curso, i.id) + '">' + HB.tipos[i.tipo][0] + ' ' + (k + 1) + '. ' + esc(i.titulo) + '</a>'; }).join('') + '</div>' : '<p class="meta">Este curso todavía no tiene actividades.</p>') + '</section>';
      }).join('');
    }).catch(function (e) { cl.innerHTML = aviso(mensajeError(e)); });
  }

  // ---------------------------------------------------------------- EVALUACIONES Y TAREAS
  var le = $('lista-eval');
  if (le) {
    if (!HB.cursos.length) le.innerHTML = aviso('Aún no estás matriculado en ningún curso.');
    else porCurso(function (lista) {
      var filas = [];
      lista.forEach(function (x) { x.items.forEach(function (i) { if (i.tipo === 'examen' || i.tipo === 'tarea') filas.push({ c: x.curso, i: i }); }); });
      if (!filas.length) { le.innerHTML = aviso('Tu profesor todavía no ha habilitado evaluaciones ni tareas.'); return; }
      var pend = filas.filter(function (f) { var m = f.i.mi || {}; return f.i.estado === 'abierto' && (f.i.tipo === 'examen' ? m.usados === 0 : !m.entregada); }).length;
      var orden = { abierto: 0, programado: 1, cerrado: 2 };
      filas.sort(function (a, b) { return (orden[a.i.estado] - orden[b.i.estado]) || (a.c.nombre < b.c.nombre ? -1 : 1); });
      var html = filas.map(function (f) {
        var i = f.i, m = i.mi || {}, res, acc;
        if (i.tipo === 'examen') {
          res = m.usados + ' de ' + m.intentosMax + ' intentos · Nota: <b class="nota">' + HB.nota(m.mejor) + '</b>';
          acc = i.estado === 'abierto' && m.usados < m.intentosMax ? '<a class="btn" href="' + linkItem(f.c, i.id) + '">' + (m.usados ? 'Intentar de nuevo' : 'Presentar') + '</a>' : '<a class="btn btn-claro" href="' + linkItem(f.c, i.id) + '">Ver</a>';
        } else {
          res = !m.entregada ? 'Sin entregar' : m.calificada ? 'Calificada: <b class="nota">' + HB.nota(m.nota) + '</b>' : 'Entregada · por calificar';
          acc = i.estado === 'abierto' && !m.calificada ? '<a class="btn" href="' + linkItem(f.c, i.id) + '">' + (m.entregada ? 'Ver / reemplazar' : 'Entregar') + '</a>' : '<a class="btn btn-claro" href="' + linkItem(f.c, i.id) + '">Ver</a>';
        }
        return '<tr><td><b>' + esc(f.c.nombre) + '</b></td><td>' + HB.tipos[i.tipo][0] + ' ' + esc(i.titulo) + '</td><td>' + HB.badge(i.estado) + '</td><td>' + HB.fecha(i.cierre) + '</td><td>' + res + '</td><td class="acc">' + acc + '</td></tr>';
      }).join('');
      le.innerHTML = '<p class="meta">' + (pend ? 'Tienes <b>' + pend + '</b> ' + (pend > 1 ? 'actividades' : 'actividad') + ' por presentar o entregar.' : 'No tienes actividades pendientes.') +
        ' Escala 0,0 a 5,0; se aprueba con 3,0 o más.</p><div class="scroll-x"><table class="tabla"><tr><th>Curso</th><th>Actividad</th><th>Estado</th><th>Cierra</th><th>Resultado</th><th>Acción</th></tr>' + html + '</table></div>';
    }).catch(function (e) { le.innerHTML = aviso(mensajeError(e)); });
  }

  // ---------------------------------------------------------------- CALIFICACIONES
  var cal = $('calificaciones');
  if (cal) {
    var filtro = qs.get('curso');
    HB.llamar('mis_notas').then(function (n) {
      if (!HB.cursos.length) { cal.innerHTML = aviso('Aún no estás matriculado en ningún curso.'); return; }
      function resultado(it) {
        if (it.tipo === 'examen') {
          var t = n.intentos.filter(function (x) { return x.item === it.id; });
          return t.length ? { nota: Math.max.apply(null, t.map(function (x) { return x.nota; })), fecha: t[t.length - 1].fecha, texto: t.length + ' intento(s)' } : { texto: 'Sin presentar' };
        }
        var g = n.entregas.filter(function (x) { return x.item === it.id; })[0];
        if (!g) return { texto: 'Sin entregar' };
        return g.calificada ? { nota: g.nota, fecha: g.fecha, texto: 'Calificada', comentario: g.comentario } : { fecha: g.fecha, texto: 'Entregada · por calificar' };
      }
      var prom = [], filas = '';
      HB.cursos.forEach(function (c) {
        var its = n.items.filter(function (i) { return i.curso === c.id; }), res = its.map(resultado), notas = res.filter(function (r) { return r.nota !== undefined; }).map(function (r) { return r.nota; });
        var p = notas.length ? notas.reduce(function (a, b) { return a + b; }, 0) / notas.length : null; if (p !== null) prom.push(p);
        var est = p === null ? '<span class="estado no">Sin notas</span>' : p >= 3 ? '<span class="estado si">Aprobado</span>' : '<span class="estado mal">No aprobado</span>';
        filas += '<tr><td><b>' + esc(c.nombre) + '</b></td><td>' + notas.length + ' de ' + its.length + '</td><td class="nota">' + HB.nota(p) + '</td><td>' + est + '</td><td><a href="calificaciones.html?curso=' + encodeURIComponent(c.id) + '">Detalle</a></td></tr>';
      });
      var general = prom.length ? prom.reduce(function (a, b) { return a + b; }, 0) / prom.length : null;
      var h = '<p class="meta">Promedio general: <b>' + HB.nota(general) + '</b> (' + prom.length + ' de ' + HB.cursos.length + ' cursos con notas). Escala 0,0 a 5,0; se aprueba con 3,0 o más. En los exámenes cuenta tu mejor intento.</p>' +
        '<div class="scroll-x"><table class="tabla"><tr><th>Curso</th><th>Actividades calificadas</th><th>Promedio</th><th>Estado</th><th></th></tr>' + filas + '</table></div>';
      var cd = HB.cursos.filter(function (c) { return c.id === filtro; })[0];
      if (cd) {
        var its = n.items.filter(function (i) { return i.curso === cd.id; });
        h += '<h2>Detalle: ' + esc(cd.nombre) + '</h2>' + (its.length ? '<div class="scroll-x"><table class="tabla"><tr><th>Actividad</th><th>Tipo</th><th>Estado</th><th>Nota</th><th>Fecha</th><th>Comentario</th></tr>' +
          its.map(function (i) { var r = resultado(i); return '<tr><td>' + esc(i.titulo) + '</td><td>' + HB.tipos[i.tipo][1] + '</td><td>' + esc(r.texto) + '</td><td class="nota">' + HB.nota(r.nota) + '</td><td>' + HB.fecha(r.fecha) + '</td><td>' + esc(r.comentario || '—') + '</td></tr>'; }).join('') + '</table></div>'
          : aviso('Este curso todavía no tiene exámenes ni tareas.')) + '<div class="acciones"><a class="btn" href="curso.html?c=' + encodeURIComponent(cd.id) + '">Ir al curso</a></div>';
      }
      cal.innerHTML = h;
    }).catch(function (e) { cal.innerHTML = aviso(mensajeError(e)); });
  }
});
