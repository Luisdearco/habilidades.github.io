// Utilidades compartidas (texto con formato, video, archivos, tarjetas)
(function () {
  var HB = window.HB, esc = HB.esc;
  HB.tipos = { texto: ['📖', 'Lectura'], video: ['🎬', 'Video'], pdf: ['📄', 'Documento'], tarea: ['📝', 'Tarea (PDF)'], foro: ['💬', 'Foro'], examen: ['✅', 'Examen'], tarjetas: ['🃏', 'Tarjetas de repaso'] };
  HB.paletas = [['Azul', '#3b9bf0', '#1f6fd1'], ['Naranja', '#f4a259', '#c1121f'], ['Morado', '#8e6bd8', '#f72585'], ['Verde', '#2a9d8f', '#1b5e56'], ['Rojo', '#d62839', '#ffb703'], ['Gris', '#6c757d', '#2b2d42']];
  HB.PDF_RE = /\.pdf$/i; HB.DOC_RE = /\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|txt)$/i;

  // Texto con formato sencillo: párrafos, "## subtítulo", "- lista" y **negrita**
  HB.md = function (texto) {
    var out = [], lista = false, par = [];
    function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
    function cierraPar() { if (par.length) { out.push('<p>' + inline(par.join(' ')) + '</p>'); par = []; } }
    function cierraLista() { if (lista) { out.push('</ul>'); lista = false; } }
    String(texto || '').replace(/\r/g, '').split('\n').forEach(function (l) {
      var m;
      if (/^\s*$/.test(l)) { cierraPar(); cierraLista(); }
      else if ((m = l.match(/^##\s+(.*)/))) { cierraPar(); cierraLista(); out.push('<h2>' + inline(m[1]) + '</h2>'); }
      else if ((m = l.match(/^[-*]\s+(.*)/))) { cierraPar(); if (!lista) { out.push('<ul>'); lista = true; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else { cierraLista(); par.push(l.trim()); }
    });
    cierraPar(); cierraLista();
    return out.join('');
  };

  HB.ytId = function (url) {
    var m = String(url || '').match(/(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/);
    return m ? m[1] : null;
  };
  HB.videoHtml = function (url, titulo) {
    url = String(url || '').trim();
    var id = HB.ytId(url), m;
    var allow = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';
    if (id) return '<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1&playsinline=1" title="' + esc(titulo || 'Video') + '" loading="lazy" allow="' + allow + '" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
    if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return '<div class="video"><iframe src="https://player.vimeo.com/video/' + m[1] + '" title="' + esc(titulo || 'Video') + '" loading="lazy" allow="' + allow + '" allowfullscreen></iframe></div>';
    if (/^https?:\/\/.+\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) return '<div class="video"><video controls preload="metadata" src="' + esc(url) + '"></video></div>';
    return null;
  };

  HB.rutaArchivo = function (u) { u = String(u || ''); return /^(https?:)?\/\//i.test(u) ? u : '../../' + u.replace(/^\/+/, ''); };

  // Lee un archivo del equipo y lo devuelve en base64
  HB.leerArchivo = function (file, regex, errTipo) {
    return new Promise(function (ok, no) {
      if (!file) return no(new Error('archivo_invalido'));
      if (!regex.test(file.name)) return no(new Error(errTipo || 'tipo_archivo'));
      if (file.size > HB.maxMB * 1048576) return no(new Error('archivo_grande'));
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); ok({ nombre: file.name, tipo: file.type || 'application/octet-stream', datos: s.slice(s.indexOf(',') + 1) }); };
      r.onerror = function () { no(new Error('archivo_invalido')); };
      r.readAsDataURL(file);
    });
  };
  HB.abrirArchivo = function (id, descargar) {
    return HB.llamar('archivo', { id: id }).then(function (r) {
      var bin = atob(r.datos), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([bytes], { type: r.tipo || 'application/octet-stream' }));
      if (descargar) { var a = document.createElement('a'); a.href = url; a.download = r.nombre; document.body.appendChild(a); a.click(); a.remove(); }
      else window.open(url, '_blank');
      return r;
    });
  };

  HB.badge = function (estado) {
    var m = { abierto: ['si', 'Abierta'], programado: ['prog', 'Programada'], cerrado: ['mal', 'Cerrada'], oculto: ['no', 'Oculta'] }[estado] || ['no', estado];
    return '<span class="estado ' + m[0] + '">' + m[1] + '</span>';
  };

  // Tarjeta de curso (con miniatura del video de portada si existe)
  HB.tarjetaCurso = function (c, href, extra) {
    var yt = HB.ytId(c.video);
    var img = yt ? '<img class="foto" src="https://i.ytimg.com/vi/' + yt + '/mqdefault.jpg" alt="Video del curso ' + esc(c.nombre) + '" loading="lazy" onerror="this.remove()"><i class="play" aria-hidden="true">▶</i>' : '';
    return '<a class="curso-card" href="' + href + '"><div class="arte" style="background:linear-gradient(135deg,' + esc(c.color1) + ',' + esc(c.color2) + ')"><span>' + esc(c.emoji) + '</span>' + img +
      '</div><div class="cuerpo"><h3>' + esc(c.nombre) + '</h3><p>' + esc(c.descripcion) + '</p>' + (extra || '') + '</div></a>';
  };

  // Tarjetas de repaso: voltear al hacer clic
  HB.iniciarRepaso = function (raiz) {
    (raiz || document).querySelectorAll('.repaso').forEach(function (sec) {
      if (sec.dataset.listo) return; sec.dataset.listo = '1';
      var panel = sec.querySelector('.sabias p'), inicial = panel.textContent;
      sec.querySelectorAll('.flip').forEach(function (b) {
        b.addEventListener('click', function () {
          var v = b.classList.toggle('volteada');
          b.setAttribute('aria-pressed', v);
          b.setAttribute('aria-label', v ? b.dataset.q + ' Respuesta: ' + b.dataset.a : b.dataset.q + ' Pulsa para ver la respuesta.');
          panel.textContent = '';
          if (!v) { panel.textContent = inicial; return; }
          if (b.dataset.titulo || b.dataset.texto) {
            if (b.dataset.titulo) { var st = document.createElement('strong'); st.textContent = b.dataset.titulo + '. '; panel.appendChild(st); }
            panel.appendChild(document.createTextNode(b.dataset.texto || ''));
          } else panel.textContent = b.dataset.a;
        });
      });
    });
  };
})();
