// Capa de datos. Dos modos (ver config.js):
//  - local:    todo se guarda en el navegador (solo para probar).
//  - supabase: base de datos compartida (uso real).
(function () {
  var CFG = window.HB_CONFIG || { modo: 'local' }, TK = 'hb_token';
  var HB = window.HB = { cfg: CFG, cursos: [], yo: null };
  HB.maxMB = CFG.modo === 'supabase' ? 5 : 1.4;

  HB.nombreCurso = function (id) { var c = HB.cursos.filter(function (x) { return x.id === id; })[0]; return c ? c.nombre : id; };
  HB.fecha = function (iso) { return iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; };
  HB.nota = function (n) { return (n === null || n === undefined) ? '—' : Number(n).toFixed(1).replace('.', ','); };
  HB.esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ---------------------------------------------------------------- modo Supabase
  function remoto(op, args) {
    return fetch(CFG.supabaseUrl + '/rest/v1/rpc/hb_rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey },
      body: JSON.stringify({ p_token: sessionStorage.getItem(TK), p_op: op, p_args: args || {} })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.error) throw new Error(j.error);
      if (j && j.message && !('ok' in j)) throw new Error(j.message);
      return j;
    });
  }

  // ---------------------------------------------------------------- modo local
  var DB = 'hb_db2', SEED = null, MAX_B64 = 2000000;
  function sha(t) {
    if (!(window.crypto && crypto.subtle)) return Promise.reject(new Error('inseguro'));
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function leer() { try { return JSON.parse(localStorage.getItem(DB)); } catch (e) { return null; } }
  function guardar(db) { localStorage.setItem(DB, JSON.stringify(db)); }
  function nuevoId(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function estadoDe(it) {
    var t = Date.now();
    if (!it.visible) return 'oculto';
    if (it.apertura && t < Date.parse(it.apertura)) return 'programado';
    if (it.cierre && t > Date.parse(it.cierre)) return 'cerrado';
    return 'abierto';
  }
  function porOrden(a, b) { return (a.orden - b.orden) || (a.id < b.id ? -1 : 1); }
  function sembrar() {
    var db = { usuarios: [], matriculas: [], cursos: copia(SEED.cursos), items: copia(SEED.items), preguntas: copia(SEED.preguntas),
      intentos: [], entregas: [], mensajes: [], descargas: [], archivos: [] };
    return Promise.all(SEED.usuarios.map(function (u) {
      return sha(u.id + ':' + u.clave).then(function (h) {
        db.usuarios.push({ id: u.id, nombre: u.nombre, cedula: u.cedula || '', usuario: u.usuario || '', correo: u.correo || '', rol: u.rol, hash: h, activo: true });
        (u.cursos || []).forEach(function (c) { db.matriculas.push({ u: u.id, c: c }); });
      });
    })).then(function () { guardar(db); return db; });
  }
  function pub(u) { return { id: u.id, nombre: u.nombre, rol: u.rol, cedula: u.cedula }; }
  function soloProfe(u) { if (u.rol !== 'profesor') throw new Error('permiso'); }
  function puede(db, u, c) { return u.rol === 'profesor' || db.matriculas.some(function (m) { return m.u === u.id && m.c === c; }); }
  function pubCurso(c) { return { id: c.id, nombre: c.nombre, descripcion: c.descripcion, emoji: c.emoji, color1: c.color1, color2: c.color2, video: c.video || null }; }
  function itemDe(db, id) { return db.items.filter(function (i) { return i.id === id; })[0]; }
  function nombreDe(db, id) { var x = db.usuarios.filter(function (y) { return y.id === id; })[0]; return x || {}; }
  function guardarArchivo(db, u, nombre, tipo, datos) {
    if (!datos) throw new Error('archivo_invalido');
    if (datos.length > MAX_B64) throw new Error('archivo_grande');
    var id = nuevoId('f');
    try { localStorage.setItem('hb_f_' + id, datos); } catch (e) { throw new Error('archivo_grande'); }
    db.archivos.push({ id: id, nombre: nombre, tipo: tipo, subido_por: u.id });
    return id;
  }
  function borrarArchivo(db, id) {
    if (!id) return;
    db.archivos = db.archivos.filter(function (a) { return a.id !== id; });
    try { localStorage.removeItem('hb_f_' + id); } catch (e) {}
  }
  function archivosDeItems(db, ids) {
    var out = [];
    db.items.forEach(function (i) { if (ids.indexOf(i.id) > -1 && i.contenido && i.contenido.archivo) out.push(i.contenido.archivo); });
    db.entregas.forEach(function (g) { if (ids.indexOf(g.item) > -1 && g.archivo) out.push(g.archivo); });
    return out;
  }
  function quitarItems(db, ids) {
    archivosDeItems(db, ids).forEach(function (f) { borrarArchivo(db, f); });
    db.items = db.items.filter(function (i) { return ids.indexOf(i.id) < 0; });
    db.intentos = db.intentos.filter(function (x) { return ids.indexOf(x.item) < 0; });
    db.entregas = db.entregas.filter(function (x) { return ids.indexOf(x.item) < 0; });
    db.mensajes = db.mensajes.filter(function (x) { return ids.indexOf(x.item) < 0; });
    db.descargas = db.descargas.filter(function (x) { return ids.indexOf(x.item) < 0; });
    ids.forEach(function (id) { delete db.preguntas[id]; });
  }
  function validarPreguntas(ps) {
    ps.forEach(function (p) {
      if (!String(p.q || '').trim() || !Array.isArray(p.o) || p.o.length < 2 || typeof p.ok !== 'number' || p.ok < 0 || p.ok >= p.o.length) throw new Error('pregunta_invalida');
    });
  }
  function miResumen(db, u, i) {
    if (i.tipo === 'examen') {
      var t = db.intentos.filter(function (x) { return x.item === i.id && x.u === u.id; });
      return { usados: t.length, intentosMax: i.intentos || 1, mejor: t.length ? Math.max.apply(null, t.map(function (x) { return x.nota; })) : null };
    }
    if (i.tipo === 'tarea') {
      var g = db.entregas.filter(function (x) { return x.item === i.id && x.u === u.id; })[0];
      return { entregada: !!g, nota: g ? g.nota : null, calificada: !!(g && g.calificada) };
    }
    return null;
  }
  function evaluables(db) { return db.items.filter(function (i) { return i.tipo === 'examen' || i.tipo === 'tarea'; }); }
  function ordenCurso(db, id) { var c = db.cursos.filter(function (x) { return x.id === id; })[0]; return c ? c.orden : 0; }

  var ops = {
    yo: function (a, u) { return { usuario: pub(u) }; },
    cursos: function (a, u, db) {
      return { cursos: db.cursos.filter(function (c) { return puede(db, u, c.id); }).sort(porOrden).map(function (c) {
        var o = pubCurso(c); o.matriculados = db.matriculas.filter(function (m) { return m.c === c.id; }).length; return o; }) };
    },
    curso: function (a, u, db) {
      var cu = db.cursos.filter(function (c) { return c.id === a.id; })[0];
      if (!cu) throw new Error('no_existe');
      if (!puede(db, u, a.id)) throw new Error('sin_matricula');
      return { curso: pubCurso(cu), items: db.items.filter(function (i) { return i.curso === a.id && (u.rol === 'profesor' || i.visible); }).sort(porOrden).map(function (i) {
        return { id: i.id, tipo: i.tipo, titulo: i.titulo, visible: i.visible, orden: i.orden, apertura: i.apertura || null, cierre: i.cierre || null, estado: estadoDe(i), mi: miResumen(db, u, i) }; }) };
    },
    item: function (a, u, db) {
      var it = itemDe(db, a.id);
      if (!it) throw new Error('no_existe');
      if (!puede(db, u, it.curso)) throw new Error('sin_matricula');
      if (u.rol !== 'profesor' && !it.visible) throw new Error('no_visible');
      var est = estadoDe(it);
      var r = { item: { id: it.id, curso: it.curso, tipo: it.tipo, titulo: it.titulo, contenido: it.contenido, visible: it.visible, apertura: it.apertura || null, cierre: it.cierre || null, intentosMax: it.intentos || 1, estado: est } };
      if (it.tipo === 'examen') {
        var t = db.intentos.filter(function (x) { return x.item === it.id && x.u === u.id; }), pre = db.preguntas[it.id] || [];
        r.usados = t.length; r.mejor = t.length ? Math.max.apply(null, t.map(function (x) { return x.nota; })) : null; r.total = pre.length;
        if (u.rol !== 'profesor' && est === 'abierto' && t.length < (it.intentos || 1) && pre.length) r.preguntas = pre.map(function (p) { return { q: p.q, o: p.o }; });
      } else if (it.tipo === 'tarea') {
        var g = db.entregas.filter(function (x) { return x.item === it.id && x.u === u.id; })[0];
        if (g) r.entrega = { id: g.id, nombre: g.nombre, fecha: g.fecha, nota: g.nota, comentario: g.comentario, calificada: g.calificada, archivo: g.archivo };
      } else if (it.tipo === 'foro') {
        r.mensajes = db.mensajes.filter(function (m) { return m.item === it.id; }).slice(-300).map(function (m) {
          var x = nombreDe(db, m.u); return { id: m.id, u: m.u, nombre: x.nombre, rol: x.rol, texto: m.texto, fecha: m.fecha }; });
      }
      return r;
    },
    enviar_examen: function (a, u, db) {
      if (u.rol !== 'estudiante') throw new Error('permiso');
      var it = itemDe(db, a.item);
      if (!it || it.tipo !== 'examen') throw new Error('no_existe');
      if (!puede(db, u, it.curso)) throw new Error('sin_matricula');
      var pre = db.preguntas[it.id] || [], usados = db.intentos.filter(function (x) { return x.item === it.id && x.u === u.id; }).length;
      if (estadoDe(it) !== 'abierto' || usados >= (it.intentos || 1) || !pre.length) throw new Error('no_disponible');
      var det = pre.map(function (p, i) { return Number(a.respuestas[i]) === p.ok; }), ok = det.filter(Boolean).length, nota = Math.round(ok / pre.length * 50) / 10;
      db.intentos.push({ id: nuevoId('t'), u: u.id, item: it.id, nota: nota, correctas: ok, total: pre.length, fecha: new Date().toISOString() });
      guardar(db);
      return { nota: nota, correctas: ok, total: pre.length, detalle: det };
    },
    entregar_tarea: function (a, u, db) {
      if (u.rol !== 'estudiante') throw new Error('permiso');
      var it = itemDe(db, a.item);
      if (!it || it.tipo !== 'tarea') throw new Error('no_existe');
      if (!puede(db, u, it.curso)) throw new Error('sin_matricula');
      if (estadoDe(it) !== 'abierto') throw new Error('no_disponible');
      var nm = String(a.nombre || '').trim();
      if (!/\.pdf$/i.test(nm)) throw new Error('solo_pdf');
      var ent = db.entregas.filter(function (x) { return x.item === it.id && x.u === u.id; })[0];
      if (ent && ent.calificada) throw new Error('ya_calificada');
      var fid = guardarArchivo(db, u, nm, 'application/pdf', a.datos);
      if (ent) { borrarArchivo(db, ent.archivo); ent.archivo = fid; ent.nombre = nm; ent.fecha = new Date().toISOString(); }
      else db.entregas.push({ id: nuevoId('e'), item: it.id, u: u.id, archivo: fid, nombre: nm, fecha: new Date().toISOString(), nota: null, comentario: null, calificada: null });
      guardar(db); return { ok: true };
    },
    foro_publicar: function (a, u, db) {
      var it = itemDe(db, a.item);
      if (!it || it.tipo !== 'foro') throw new Error('no_existe');
      if (!puede(db, u, it.curso)) throw new Error('sin_matricula');
      if (u.rol !== 'profesor' && estadoDe(it) === 'oculto') throw new Error('no_visible');
      var tx = String(a.texto || '').trim();
      if (tx.length < 1 || tx.length > 2000) throw new Error('texto_invalido');
      db.mensajes.push({ id: nuevoId('m'), item: it.id, u: u.id, texto: tx, fecha: new Date().toISOString() });
      guardar(db); return { ok: true };
    },
    archivo: function (a, u, db) {
      var ar = db.archivos.filter(function (x) { return x.id === a.id; })[0];
      if (!ar) throw new Error('no_existe');
      var permitido = u.rol === 'profesor' || ar.subido_por === u.id || db.items.some(function (i) { return i.contenido && i.contenido.archivo === ar.id && i.visible && puede(db, u, i.curso); });
      if (!permitido) throw new Error('permiso');
      var d = localStorage.getItem('hb_f_' + ar.id);
      if (d === null) throw new Error('no_existe');
      return { nombre: ar.nombre, tipo: ar.tipo, datos: d };
    },
    mis_notas: function (a, u, db) {
      return {
        items: evaluables(db).filter(function (i) { return i.visible && puede(db, u, i.curso); }).sort(function (x, y) { return (ordenCurso(db, x.curso) - ordenCurso(db, y.curso)) || porOrden(x, y); })
          .map(function (i) { return { id: i.id, curso: i.curso, tipo: i.tipo, titulo: i.titulo, estado: estadoDe(i) }; }),
        intentos: db.intentos.filter(function (x) { return x.u === u.id; }).map(function (x) { return { item: x.item, nota: x.nota, correctas: x.correctas, total: x.total, fecha: x.fecha }; }),
        entregas: db.entregas.filter(function (x) { return x.u === u.id; }).map(function (x) { return { item: x.item, nota: x.nota, fecha: x.fecha, calificada: x.calificada, comentario: x.comentario }; })
      };
    },
    registrar_descarga: function (a, u, db) {
      var it = itemDe(db, a.item); if (!it) throw new Error('no_existe');
      db.descargas.push({ u: u.id, item: it.id, curso: it.curso, fecha: new Date().toISOString() }); guardar(db); return { ok: true };
    },
    mis_descargas: function (a, u, db) {
      var m = {};
      db.descargas.filter(function (d) { return d.u === u.id; }).forEach(function (d) { if (!m[d.item] || d.fecha > m[d.item]) m[d.item] = d.fecha; });
      return { descargas: Object.keys(m).map(function (k) { return { item: k, fecha: m[k] }; }) };
    },

    // ---------------- profesor
    foro_borrar: function (a, u, db) { soloProfe(u); db.mensajes = db.mensajes.filter(function (m) { return m.id !== a.id; }); guardar(db); return { ok: true }; },
    crear_curso: function (a, u, db) {
      soloProfe(u);
      var nm = String(a.nombre || '').trim(); if (!nm) throw new Error('titulo');
      var id = nuevoId('c'), ord = db.cursos.reduce(function (m, c) { return Math.max(m, c.orden); }, 0) + 1;
      db.cursos.push({ id: id, nombre: nm, descripcion: String(a.descripcion || '').trim(), emoji: String(a.emoji || '').trim() || '📘', color1: a.color1 || '#3b9bf0', color2: a.color2 || '#1f6fd1', video: String(a.video || '').trim() || null, orden: ord });
      guardar(db); return { ok: true, id: id };
    },
    guardar_curso: function (a, u, db) {
      soloProfe(u);
      var nm = String(a.nombre || '').trim(); if (!nm) throw new Error('titulo');
      db.cursos.forEach(function (c) { if (c.id === a.id) { c.nombre = nm; c.descripcion = String(a.descripcion || '').trim(); c.emoji = String(a.emoji || '').trim() || '📘'; c.color1 = a.color1 || '#3b9bf0'; c.color2 = a.color2 || '#1f6fd1'; c.video = String(a.video || '').trim() || null; } });
      guardar(db); return { ok: true };
    },
    eliminar_curso: function (a, u, db) {
      soloProfe(u);
      quitarItems(db, db.items.filter(function (i) { return i.curso === a.id; }).map(function (i) { return i.id; }));
      db.cursos = db.cursos.filter(function (c) { return c.id !== a.id; });
      db.matriculas = db.matriculas.filter(function (m) { return m.c !== a.id; });
      guardar(db); return { ok: true };
    },
    subir_archivo: function (a, u, db) {
      soloProfe(u);
      var nm = String(a.nombre || '').trim();
      if (!/\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|txt)$/i.test(nm)) throw new Error('tipo_archivo');
      var id = guardarArchivo(db, u, nm, a.tipo || 'application/octet-stream', a.datos);
      guardar(db); return { ok: true, id: id };
    },
    guardar_item: function (a, u, db) {
      soloProfe(u);
      if (!db.cursos.some(function (c) { return c.id === a.curso; })) throw new Error('no_existe');
      if (['texto', 'video', 'pdf', 'tarea', 'foro', 'examen', 'tarjetas'].indexOf(a.tipo) < 0) throw new Error('tipo');
      if (!String(a.titulo || '').trim()) throw new Error('titulo');
      if (a.preguntas) validarPreguntas(a.preguntas);
      var it, contenido = a.contenido || {}, vis = a.visible === undefined ? true : !!a.visible, intentos = Math.max(1, parseInt(a.intentos, 10) || 1);
      if (!a.id) {
        var ord = db.items.filter(function (i) { return i.curso === a.curso; }).reduce(function (m, i) { return Math.max(m, i.orden); }, 0) + 1;
        it = { id: nuevoId('i'), curso: a.curso, tipo: a.tipo, titulo: String(a.titulo).trim(), contenido: contenido, orden: ord, visible: vis, apertura: a.apertura || null, cierre: a.cierre || null, intentos: intentos };
        db.items.push(it);
      } else {
        it = itemDe(db, a.id); if (!it) throw new Error('no_existe');
        if (it.contenido && it.contenido.archivo && it.contenido.archivo !== contenido.archivo) borrarArchivo(db, it.contenido.archivo);
        it.titulo = String(a.titulo).trim(); it.contenido = contenido; it.visible = vis; it.apertura = a.apertura || null; it.cierre = a.cierre || null; it.intentos = intentos;
      }
      if (a.preguntas) db.preguntas[it.id] = copia(a.preguntas).map(function (p) { return { q: String(p.q).trim(), o: p.o, ok: p.ok }; });
      guardar(db); return { ok: true, id: it.id };
    },
    programar_item: function (a, u, db) {
      soloProfe(u);
      var it = itemDe(db, a.id); if (!it) return { ok: true };
      if (a.visible !== undefined && a.visible !== null) it.visible = !!a.visible;
      it.apertura = a.apertura || null; it.cierre = a.cierre || null;
      if (a.intentos !== undefined && a.intentos !== null) it.intentos = Math.max(1, parseInt(a.intentos, 10) || 1);
      guardar(db); return { ok: true };
    },
    eliminar_item: function (a, u, db) { soloProfe(u); quitarItems(db, [a.id]); guardar(db); return { ok: true }; },
    mover_item: function (a, u, db) {
      soloProfe(u);
      var it = itemDe(db, a.id); if (!it) throw new Error('no_existe');
      var hermanos = db.items.filter(function (i) { return i.curso === it.curso; }).sort(porOrden), k = hermanos.indexOf(it), v = hermanos[k + (a.dir < 0 ? -1 : 1)];
      if (v) { var t = it.orden; it.orden = v.orden; v.orden = t; }
      guardar(db); return { ok: true };
    },
    item_edicion: function (a, u, db) {
      soloProfe(u);
      var it = itemDe(db, a.id); if (!it) throw new Error('no_existe');
      return { item: { id: it.id, curso: it.curso, tipo: it.tipo, titulo: it.titulo, contenido: it.contenido, visible: it.visible, apertura: it.apertura || null, cierre: it.cierre || null, intentos: it.intentos },
        preguntas: copia(db.preguntas[it.id] || []) };
    },
    entregas: function (a, u, db) {
      soloProfe(u);
      var it = itemDe(db, a.item), cur = it ? it.curso : null;
      return {
        estudiantes: db.usuarios.filter(function (x) { return x.rol === 'estudiante' && db.matriculas.some(function (m) { return m.u === x.id && m.c === cur; }); })
          .sort(function (x, y) { return x.nombre < y.nombre ? -1 : 1; }).map(function (x) { return { id: x.id, nombre: x.nombre, cedula: x.cedula }; }),
        entregas: db.entregas.filter(function (g) { return g.item === a.item; }).map(function (g) { return { id: g.id, u: g.u, nombre: g.nombre, fecha: g.fecha, nota: g.nota, comentario: g.comentario, calificada: g.calificada, archivo: g.archivo }; })
      };
    },
    calificar_entrega: function (a, u, db) {
      soloProfe(u);
      var n = Number(a.nota); if (a.nota === null || a.nota === undefined || a.nota === '' || isNaN(n) || n < 0 || n > 5) throw new Error('nota_invalida');
      db.entregas.forEach(function (g) { if (g.id === a.id) { g.nota = Math.round(n * 10) / 10; g.comentario = String(a.comentario || '').trim() || null; g.calificada = new Date().toISOString(); } });
      guardar(db); return { ok: true };
    },
    actividades: function (a, u, db) {
      soloProfe(u);
      return { actividades: evaluables(db).sort(function (x, y) { return (ordenCurso(db, x.curso) - ordenCurso(db, y.curso)) || porOrden(x, y); }).map(function (i) {
        var quienes = {}; db.intentos.concat(db.entregas).forEach(function (z) { if (z.item === i.id) quienes[z.u] = 1; });
        return { id: i.id, curso: i.curso, cursoNombre: (db.cursos.filter(function (c) { return c.id === i.curso; })[0] || {}).nombre, tipo: i.tipo, titulo: i.titulo, visible: i.visible,
          apertura: i.apertura || null, cierre: i.cierre || null, intentos: i.intentos || 1, estado: estadoDe(i), presentaron: Object.keys(quienes).length,
          matriculados: db.matriculas.filter(function (m) { return m.c === i.curso; }).length }; }) };
    },
    notas: function (a, u, db) {
      soloProfe(u);
      return { items: evaluables(db).sort(function (x, y) { return (ordenCurso(db, x.curso) - ordenCurso(db, y.curso)) || porOrden(x, y); }).map(function (i) { return { id: i.id, curso: i.curso, tipo: i.tipo, titulo: i.titulo }; }),
        intentos: db.intentos.map(function (x) { return { u: x.u, item: x.item, nota: x.nota, correctas: x.correctas, total: x.total, fecha: x.fecha }; }),
        entregas: db.entregas.map(function (x) { return { u: x.u, item: x.item, nota: x.nota, fecha: x.fecha, calificada: x.calificada }; }) };
    },
    descargas_resumen: function (a, u, db) {
      soloProfe(u);
      return { items: db.items.filter(function (i) { return i.tipo === 'pdf'; }).sort(function (x, y) { return (ordenCurso(db, x.curso) - ordenCurso(db, y.curso)) || porOrden(x, y); })
          .map(function (i) { return { id: i.id, curso: i.curso, titulo: i.titulo }; }),
        descargas: db.descargas.slice().sort(function (x, y) { return x.fecha < y.fecha ? 1 : -1; }).map(function (d) { return { u: d.u, nombre: nombreDe(db, d.u).nombre || '(eliminado)', item: d.item, curso: d.curso, fecha: d.fecha }; }) };
    },
    estudiantes: function (a, u, db) {
      soloProfe(u);
      return { estudiantes: db.usuarios.filter(function (x) { return x.rol === 'estudiante'; }).sort(function (x, y) { return x.nombre < y.nombre ? -1 : 1; }).map(function (x) {
        return { id: x.id, nombre: x.nombre, cedula: x.cedula, correo: x.correo, cursos: db.matriculas.filter(function (m) { return m.u === x.id; }).map(function (m) { return m.c; }) }; }) };
    },
    crear_estudiantes: function (a, u, db) {
      soloProfe(u);
      var creados = 0, omitidos = [];
      return Promise.all((a.lista || []).map(function (e) {
        var ced = String(e.cedula || '').trim(), nom = String(e.nombre || '').trim();
        if (!ced || !nom || db.usuarios.some(function (x) { return x.cedula === ced; })) { omitidos.push(ced || nom || '(vacío)'); return null; }
        var id = nuevoId('u');
        return sha(id + ':' + (String(e.clave || '').trim() || ced)).then(function (h) {
          db.usuarios.push({ id: id, nombre: nom, cedula: ced, usuario: '', correo: String(e.correo || '').trim().toLowerCase(), rol: 'estudiante', hash: h, activo: true });
          (a.cursos || []).forEach(function (c) { if (db.cursos.some(function (x) { return x.id === c; })) db.matriculas.push({ u: id, c: c }); });
          creados++;
        });
      })).then(function () { guardar(db); return { creados: creados, omitidos: omitidos }; });
    },
    eliminar_estudiante: function (a, u, db) {
      soloProfe(u);
      db.entregas.filter(function (g) { return g.u === a.id; }).forEach(function (g) { borrarArchivo(db, g.archivo); });
      db.usuarios = db.usuarios.filter(function (x) { return !(x.id === a.id && x.rol === 'estudiante'); });
      ['matriculas', 'intentos', 'entregas', 'mensajes', 'descargas'].forEach(function (k) { db[k] = db[k].filter(function (x) { return x.u !== a.id; }); });
      guardar(db); return { ok: true };
    },
    restablecer_clave: function (a, u, db) {
      soloProfe(u);
      if (String(a.clave || '').length < 4) throw new Error('clave_corta');
      return sha(a.id + ':' + a.clave).then(function (h) { db.usuarios.forEach(function (x) { if (x.id === a.id) x.hash = h; }); guardar(db); return { ok: true }; });
    },
    matricular: function (a, u, db) {
      soloProfe(u);
      (a.ids || []).forEach(function (id) { (a.cursos || []).forEach(function (c) {
        db.matriculas = db.matriculas.filter(function (m) { return !(m.u === id && m.c === c); });
        if (a.accion === 'agregar' && db.cursos.some(function (x) { return x.id === c; })) db.matriculas.push({ u: id, c: c });
      }); });
      guardar(db); return { ok: true };
    }
  };

  function local(op, args) {
    return Promise.resolve().then(function () {
      var db = leer();
      return db ? db : sembrar();
    }).then(function (db) {
      if (op === 'login') {
        var id = String(args.usuario || '').trim().toLowerCase();
        var cand = db.usuarios.filter(function (x) { return x.activo && (x.cedula === id || (x.usuario && x.usuario.toLowerCase() === id) || (x.correo && x.correo === id)); })[0];
        if (!cand) throw new Error('credenciales');
        return sha(cand.id + ':' + (args.clave || '')).then(function (h) {
          if (h !== cand.hash) throw new Error('credenciales');
          return { token: cand.id, usuario: pub(cand) };
        });
      }
      var u = db.usuarios.filter(function (x) { return x.id === sessionStorage.getItem(TK) && x.activo; })[0];
      if (!u) throw new Error('sesion');
      if (!ops[op]) throw new Error('operacion');
      return ops[op](args || {}, u, db);
    });
  }

  // ---------------------------------------------------------------- API común
  HB.llamar = function (op, args) { return CFG.modo === 'supabase' ? remoto(op, args) : local(op, args); };
  HB.entrar = function (usuario, clave) {
    return HB.llamar('login', { usuario: usuario, clave: clave }).then(function (r) {
      sessionStorage.setItem(TK, r.token); HB.yo = r.usuario; return r.usuario;
    });
  };
  HB.salir = function () { sessionStorage.removeItem(TK); HB.yo = null; HB.cursos = []; };
  HB.cargarCursos = function () {
    return HB.llamar('cursos').then(function (r) {
      HB.cursos = r.cursos.map(function (c) { c.slug = c.id; return c; }); return HB.cursos;
    });
  };

  function cargarSemilla() {
    if (CFG.modo === 'supabase') return Promise.resolve();
    return new Promise(function (ok) {
      var s = document.createElement('script');
      s.src = '../../shared/js/local-seed.js';
      s.onload = function () { SEED = window.HB_SEED; ok(); };
      s.onerror = function () { ok(); };
      document.head.appendChild(s);
    });
  }
  HB.listo = cargarSemilla().then(function () {
    if (!sessionStorage.getItem(TK)) return null;
    return HB.llamar('yo').then(function (r) { HB.yo = r.usuario; return HB.cargarCursos(); }).catch(function () { HB.salir(); });
  });
})();
