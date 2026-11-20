
-- Plataforma de Habilidades Blandas · esquema para Supabase (cursos y actividades dinámicos)
-- Pega TODO este archivo en Supabase → SQL Editor → Run.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, cedula text unique, usuario text unique, correo text,
  rol text not null check (rol in ('estudiante','profesor')),
  clave_hash text not null, activo boolean not null default true, creado timestamptz default now());
create table if not exists cursos (
  id text primary key, nombre text not null, descripcion text not null default '', emoji text not null default '📘',
  color1 text not null default '#3b9bf0', color2 text not null default '#1f6fd1', video text, orden int not null default 0, creado timestamptz default now());
create table if not exists matriculas (
  usuario_id uuid references usuarios on delete cascade, curso text references cursos on delete cascade, primary key (usuario_id, curso));
create table if not exists items (
  id text primary key, curso text not null references cursos on delete cascade,
  tipo text not null check (tipo in ('texto','video','pdf','tarea','foro','examen','tarjetas')),
  titulo text not null, contenido jsonb not null default '{}'::jsonb, orden int not null default 0,
  visible boolean not null default true, apertura timestamptz, cierre timestamptz, intentos int not null default 1, creado timestamptz default now());
create table if not exists preguntas (
  id serial primary key, item text not null references items on delete cascade, orden int not null,
  enunciado text not null, opciones jsonb not null, correcta int not null);
create table if not exists intentos (
  id uuid primary key default gen_random_uuid(), usuario_id uuid references usuarios on delete cascade,
  item text not null references items on delete cascade, nota numeric(3,1) not null, correctas int not null, total int not null,
  respuestas jsonb, fecha timestamptz default now());
create table if not exists archivos (
  id uuid primary key default gen_random_uuid(), nombre text not null, tipo text, tamano int, datos text not null,
  subido_por uuid references usuarios on delete set null, creado timestamptz default now());
create table if not exists entregas (
  id uuid primary key default gen_random_uuid(), item text not null references items on delete cascade,
  usuario_id uuid not null references usuarios on delete cascade, archivo_id uuid references archivos on delete set null,
  nombre text not null, fecha timestamptz default now(), nota numeric(3,1), comentario text, calificada timestamptz, unique (item, usuario_id));
create table if not exists mensajes (
  id bigserial primary key, item text not null references items on delete cascade,
  usuario_id uuid not null references usuarios on delete cascade, texto text not null, fecha timestamptz default now());
create table if not exists descargas (
  id bigserial primary key, usuario_id uuid references usuarios on delete cascade, item text references items on delete cascade,
  curso text, fecha timestamptz default now());
create table if not exists sesiones (
  token text primary key, usuario_id uuid references usuarios on delete cascade, creado timestamptz default now());

-- Nadie accede a las tablas directamente: solo a través de la función hb_rpc.
alter table usuarios enable row level security;   alter table cursos enable row level security;
alter table matriculas enable row level security; alter table items enable row level security;
alter table preguntas enable row level security;  alter table intentos enable row level security;
alter table archivos enable row level security;   alter table entregas enable row level security;
alter table mensajes enable row level security;   alter table descargas enable row level security;
alter table sesiones enable row level security;

create or replace function hb_estado(it items) returns text language sql stable as $$
  select case when not it.visible then 'oculto'
              when it.apertura is not null and now() < it.apertura then 'programado'
              when it.cierre is not null and now() > it.cierre then 'cerrado'
              else 'abierto' end;
$$;
create or replace function hb_puede(p_uid uuid, p_rol text, p_curso text) returns boolean language sql stable as $$
  select p_rol = 'profesor' or exists (select 1 from matriculas where usuario_id = p_uid and curso = p_curso);
$$;

create or replace function hb_rpc(p_token text, p_op text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  u usuarios; it items; cu cursos; ent entregas; ar archivos; ant items;
  est text; usados int; mejor numeric; maxi int; pres jsonb; tot int; ok_n int; v_nota numeric; det jsonb; r jsonb;
  tok text; e jsonb; uid uuid; fid uuid; cur text; nid text; nm text; tx text; n int := 0; ord int; om jsonb := '[]'::jsonb;
  ident text; c text; tiene boolean;
begin
  if p_op = 'login' then
    select * into u from usuarios where activo and (cedula = btrim(p_args->>'usuario')
      or lower(usuario) = lower(btrim(p_args->>'usuario')) or lower(correo) = lower(btrim(p_args->>'usuario'))) limit 1;
    if not found or u.clave_hash <> crypt(coalesce(p_args->>'clave',''), u.clave_hash) then
      return jsonb_build_object('error','credenciales'); end if;
    delete from sesiones where creado < now() - interval '1 day';
    tok := gen_random_uuid()::text || gen_random_uuid()::text;
    insert into sesiones(token, usuario_id) values (tok, u.id);
    return jsonb_build_object('token', tok, 'usuario',
      jsonb_build_object('id',u.id,'nombre',u.nombre,'rol',u.rol,'cedula',u.cedula));
  end if;

  select us.* into u from sesiones s join usuarios us on us.id = s.usuario_id
   where s.token = p_token and s.creado > now() - interval '12 hours' and us.activo;
  if not found then return jsonb_build_object('error','sesion'); end if;

  -- ===================== Operaciones de estudiante y profesor =====================
  if p_op = 'yo' then
    return jsonb_build_object('usuario', jsonb_build_object('id',u.id,'nombre',u.nombre,'rol',u.rol,'cedula',u.cedula));

  elsif p_op = 'cursos' then
    return jsonb_build_object('cursos', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'nombre',x.nombre,'descripcion',x.descripcion,
      'emoji',x.emoji,'color1',x.color1,'color2',x.color2,'video',x.video,
      'matriculados',(select count(*) from matriculas m where m.curso = x.id)) order by x.orden, x.nombre)
      from cursos x where hb_puede(u.id, u.rol, x.id)),'[]'));

  elsif p_op = 'curso' then
    cur := p_args->>'id';
    select * into cu from cursos where id = cur;
    if not found then return jsonb_build_object('error','no_existe'); end if;
    if not hb_puede(u.id, u.rol, cur) then return jsonb_build_object('error','sin_matricula'); end if;
    return jsonb_build_object('curso', jsonb_build_object('id',cu.id,'nombre',cu.nombre,'descripcion',cu.descripcion,'emoji',cu.emoji,
      'color1',cu.color1,'color2',cu.color2,'video',cu.video),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'tipo',i.tipo,'titulo',i.titulo,'visible',i.visible,'orden',i.orden,
        'apertura',i.apertura,'cierre',i.cierre,'estado',hb_estado(i),
        'mi', case
          when i.tipo = 'examen' then (select jsonb_build_object('usados',count(*),'intentosMax',i.intentos,'mejor',max(t.nota)) from intentos t where t.item = i.id and t.usuario_id = u.id)
          when i.tipo = 'tarea' then (select jsonb_build_object('entregada',count(*) > 0,'nota',max(g.nota),'calificada',coalesce(bool_or(g.calificada is not null),false)) from entregas g where g.item = i.id and g.usuario_id = u.id)
          else null end) order by i.orden, i.creado)
        from items i where i.curso = cur and (u.rol = 'profesor' or i.visible)),'[]'));

  elsif p_op = 'item' then
    select * into it from items where id = p_args->>'id';
    if not found then return jsonb_build_object('error','no_existe'); end if;
    if not hb_puede(u.id, u.rol, it.curso) then return jsonb_build_object('error','sin_matricula'); end if;
    if u.rol <> 'profesor' and not it.visible then return jsonb_build_object('error','no_visible'); end if;
    est := hb_estado(it);
    r := jsonb_build_object('item', jsonb_build_object('id',it.id,'curso',it.curso,'tipo',it.tipo,'titulo',it.titulo,'contenido',it.contenido,
      'visible',it.visible,'apertura',it.apertura,'cierre',it.cierre,'intentosMax',it.intentos,'estado',est));
    if it.tipo = 'examen' then
      select count(*), max(nota) into usados, mejor from intentos where item = it.id and usuario_id = u.id;
      select count(*) into tot from preguntas where item = it.id;
      r := r || jsonb_build_object('usados',usados,'mejor',mejor,'total',tot);
      if u.rol <> 'profesor' and est = 'abierto' and usados < it.intentos then
        select jsonb_agg(jsonb_build_object('q',enunciado,'o',opciones) order by orden) into pres from preguntas where item = it.id;
        if pres is not null then r := r || jsonb_build_object('preguntas',pres); end if;
      end if;
    elsif it.tipo = 'tarea' then
      select * into ent from entregas where item = it.id and usuario_id = u.id;
      if found then r := r || jsonb_build_object('entrega', jsonb_build_object('id',ent.id,'nombre',ent.nombre,'fecha',ent.fecha,
        'nota',ent.nota,'comentario',ent.comentario,'calificada',ent.calificada,'archivo',ent.archivo_id)); end if;
    elsif it.tipo = 'foro' then
      r := r || jsonb_build_object('mensajes', coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'u',m.usuario_id,'nombre',x.nombre,
        'rol',x.rol,'texto',m.texto,'fecha',m.fecha) order by m.fecha, m.id)
        from (select * from mensajes where item = it.id order by fecha desc, id desc limit 300) m join usuarios x on x.id = m.usuario_id),'[]'));
    end if;
    return r;

  elsif p_op = 'enviar_examen' then
    if u.rol <> 'estudiante' then return jsonb_build_object('error','permiso'); end if;
    select * into it from items where id = p_args->>'item' and tipo = 'examen';
    if not found then return jsonb_build_object('error','no_existe'); end if;
    if not hb_puede(u.id, u.rol, it.curso) then return jsonb_build_object('error','sin_matricula'); end if;
    select count(*) into usados from intentos where item = it.id and usuario_id = u.id;
    select count(*) into tot from preguntas where item = it.id;
    if hb_estado(it) <> 'abierto' or usados >= it.intentos or tot = 0 then return jsonb_build_object('error','no_disponible'); end if;
    select count(*) filter (where q.acierto), jsonb_agg(q.acierto order by q.idx) into ok_n, det
      from (select t.idx, coalesce(((p_args->'respuestas')->>(t.idx - 1))::int = t.correcta, false) as acierto
            from (select row_number() over (order by orden)::int as idx, correcta from preguntas where item = it.id) t) q;
    v_nota := round(ok_n::numeric / tot * 5, 1);
    insert into intentos(usuario_id,item,nota,correctas,total,respuestas) values (u.id,it.id,v_nota,ok_n,tot,p_args->'respuestas');
    return jsonb_build_object('nota',v_nota,'correctas',ok_n,'total',tot,'detalle',det);

  elsif p_op = 'entregar_tarea' then
    if u.rol <> 'estudiante' then return jsonb_build_object('error','permiso'); end if;
    select * into it from items where id = p_args->>'item' and tipo = 'tarea';
    if not found then return jsonb_build_object('error','no_existe'); end if;
    if not hb_puede(u.id, u.rol, it.curso) then return jsonb_build_object('error','sin_matricula'); end if;
    if hb_estado(it) <> 'abierto' then return jsonb_build_object('error','no_disponible'); end if;
    nm := btrim(coalesce(p_args->>'nombre',''));
    if nm !~* '\.pdf$' then return jsonb_build_object('error','solo_pdf'); end if;
    if length(coalesce(p_args->>'datos','')) = 0 then return jsonb_build_object('error','archivo_invalido'); end if;
    if length(p_args->>'datos') > 7000000 then return jsonb_build_object('error','archivo_grande'); end if;
    select * into ent from entregas where item = it.id and usuario_id = u.id;
    tiene := found;
    if tiene and ent.calificada is not null then return jsonb_build_object('error','ya_calificada'); end if;
    insert into archivos(nombre,tipo,tamano,datos,subido_por) values (nm,'application/pdf',(length(p_args->>'datos') * 3) / 4,p_args->>'datos',u.id) returning id into fid;
    if tiene then
      delete from archivos where id = ent.archivo_id;
      update entregas set archivo_id = fid, nombre = nm, fecha = now() where id = ent.id;
    else
      insert into entregas(item,usuario_id,archivo_id,nombre) values (it.id,u.id,fid,nm);
    end if;
    return jsonb_build_object('ok',true);

  elsif p_op = 'foro_publicar' then
    select * into it from items where id = p_args->>'item' and tipo = 'foro';
    if not found then return jsonb_build_object('error','no_existe'); end if;
    if not hb_puede(u.id, u.rol, it.curso) then return jsonb_build_object('error','sin_matricula'); end if;
    if u.rol <> 'profesor' and hb_estado(it) = 'oculto' then return jsonb_build_object('error','no_visible'); end if;
    tx := btrim(coalesce(p_args->>'texto',''));
    if length(tx) < 1 or length(tx) > 2000 then return jsonb_build_object('error','texto_invalido'); end if;
    insert into mensajes(item,usuario_id,texto) values (it.id,u.id,tx);
    return jsonb_build_object('ok',true);

  elsif p_op = 'archivo' then
    select * into ar from archivos where id = (p_args->>'id')::uuid;
    if not found then return jsonb_build_object('error','no_existe'); end if;
    if not (u.rol = 'profesor' or ar.subido_por = u.id or exists (select 1 from items i where i.contenido->>'archivo' = ar.id::text
        and i.visible and hb_puede(u.id, u.rol, i.curso))) then return jsonb_build_object('error','permiso'); end if;
    return jsonb_build_object('nombre',ar.nombre,'tipo',ar.tipo,'datos',ar.datos);

  elsif p_op = 'mis_notas' then
    return jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'curso',i.curso,'tipo',i.tipo,'titulo',i.titulo,'estado',hb_estado(i)) order by i.curso, i.orden)
        from items i where i.tipo in ('examen','tarea') and i.visible and hb_puede(u.id, u.rol, i.curso)),'[]'),
      'intentos', coalesce((select jsonb_agg(jsonb_build_object('item',t.item,'nota',t.nota,'correctas',t.correctas,'total',t.total,'fecha',t.fecha) order by t.fecha)
        from intentos t where t.usuario_id = u.id),'[]'),
      'entregas', coalesce((select jsonb_agg(jsonb_build_object('item',g.item,'nota',g.nota,'fecha',g.fecha,'calificada',g.calificada,'comentario',g.comentario))
        from entregas g where g.usuario_id = u.id),'[]'));

  elsif p_op = 'registrar_descarga' then
    select * into it from items where id = p_args->>'item';
    if not found then return jsonb_build_object('error','no_existe'); end if;
    insert into descargas(usuario_id,item,curso) values (u.id,it.id,it.curso);
    return jsonb_build_object('ok',true);

  elsif p_op = 'mis_descargas' then
    return jsonb_build_object('descargas', coalesce((select jsonb_agg(jsonb_build_object('item',item,'fecha',f))
      from (select item, max(fecha) f from descargas where usuario_id = u.id group by item) t),'[]'));
  end if;

  -- ===================== Operaciones exclusivas del profesor =====================
  if u.rol <> 'profesor' then return jsonb_build_object('error','permiso'); end if;

  if p_op = 'foro_borrar' then
    delete from mensajes where id = (p_args->>'id')::bigint;
    return jsonb_build_object('ok',true);

  elsif p_op = 'crear_curso' then
    nm := btrim(coalesce(p_args->>'nombre',''));
    if nm = '' then return jsonb_build_object('error','titulo'); end if;
    nid := 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    select coalesce(max(orden),0) + 1 into ord from cursos;
    insert into cursos(id,nombre,descripcion,emoji,color1,color2,video,orden) values (nid,nm,coalesce(btrim(p_args->>'descripcion'),''),
      coalesce(nullif(btrim(p_args->>'emoji'),''),'📘'),coalesce(nullif(p_args->>'color1',''),'#3b9bf0'),coalesce(nullif(p_args->>'color2',''),'#1f6fd1'),
      nullif(btrim(coalesce(p_args->>'video','')),''),ord);
    return jsonb_build_object('ok',true,'id',nid);

  elsif p_op = 'guardar_curso' then
    nm := btrim(coalesce(p_args->>'nombre',''));
    if nm = '' then return jsonb_build_object('error','titulo'); end if;
    update cursos set nombre = nm, descripcion = coalesce(btrim(p_args->>'descripcion'),''),
      emoji = coalesce(nullif(btrim(p_args->>'emoji'),''),'📘'), color1 = coalesce(nullif(p_args->>'color1',''),'#3b9bf0'),
      color2 = coalesce(nullif(p_args->>'color2',''),'#1f6fd1'), video = nullif(btrim(coalesce(p_args->>'video','')),'')
      where id = p_args->>'id';
    return jsonb_build_object('ok',true);

  elsif p_op = 'eliminar_curso' then
    cur := p_args->>'id';
    delete from archivos where id in (select g.archivo_id from entregas g join items i on i.id = g.item where i.curso = cur)
       or id::text in (select i.contenido->>'archivo' from items i where i.curso = cur and i.contenido ? 'archivo');
    delete from cursos where id = cur;
    return jsonb_build_object('ok',true);

  elsif p_op = 'subir_archivo' then
    nm := btrim(coalesce(p_args->>'nombre',''));
    if nm !~* '\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|txt)$' then return jsonb_build_object('error','tipo_archivo'); end if;
    if length(coalesce(p_args->>'datos','')) = 0 then return jsonb_build_object('error','archivo_invalido'); end if;
    if length(p_args->>'datos') > 7000000 then return jsonb_build_object('error','archivo_grande'); end if;
    insert into archivos(nombre,tipo,tamano,datos,subido_por) values (nm,coalesce(p_args->>'tipo','application/octet-stream'),
      (length(p_args->>'datos') * 3) / 4,p_args->>'datos',u.id) returning id into fid;
    return jsonb_build_object('ok',true,'id',fid);

  elsif p_op = 'guardar_item' then
    cur := p_args->>'curso';
    if not exists (select 1 from cursos where id = cur) then return jsonb_build_object('error','no_existe'); end if;
    if (p_args->>'tipo') is null or (p_args->>'tipo') not in ('texto','video','pdf','tarea','foro','examen','tarjetas') then return jsonb_build_object('error','tipo'); end if;
    if btrim(coalesce(p_args->>'titulo','')) = '' then return jsonb_build_object('error','titulo'); end if;
    if p_args ? 'preguntas' then
      for e in select value from jsonb_array_elements(p_args->'preguntas') loop
        if btrim(coalesce(e->>'q','')) = '' or jsonb_typeof(e->'o') <> 'array' or jsonb_array_length(e->'o') < 2 or (e->>'ok') is null
           or (e->>'ok')::int < 0 or (e->>'ok')::int >= jsonb_array_length(e->'o') then return jsonb_build_object('error','pregunta_invalida'); end if;
      end loop;
    end if;
    nid := nullif(p_args->>'id','');
    if nid is null then
      nid := 'i' || substr(md5(random()::text || clock_timestamp()::text), 1, 9);
      select coalesce(max(orden),0) + 1 into ord from items where curso = cur;
      insert into items(id,curso,tipo,titulo,contenido,orden,visible,apertura,cierre,intentos) values (nid,cur,p_args->>'tipo',btrim(p_args->>'titulo'),
        coalesce(p_args->'contenido','{}'::jsonb),ord,coalesce((p_args->>'visible')::boolean,true),nullif(p_args->>'apertura','')::timestamptz,
        nullif(p_args->>'cierre','')::timestamptz,greatest(1,coalesce((p_args->>'intentos')::int,1)));
    else
      select * into it from items where id = nid;
      if not found then return jsonb_build_object('error','no_existe'); end if;
      if it.contenido ? 'archivo' and (it.contenido->>'archivo') is distinct from (p_args->'contenido'->>'archivo') then
        delete from archivos where id = (it.contenido->>'archivo')::uuid;
      end if;
      update items set titulo = btrim(p_args->>'titulo'), contenido = coalesce(p_args->'contenido','{}'::jsonb),
        visible = coalesce((p_args->>'visible')::boolean,true), apertura = nullif(p_args->>'apertura','')::timestamptz,
        cierre = nullif(p_args->>'cierre','')::timestamptz, intentos = greatest(1,coalesce((p_args->>'intentos')::int,1)) where id = nid;
    end if;
    if p_args ? 'preguntas' then
      delete from preguntas where item = nid;
      ord := 0;
      for e in select value from jsonb_array_elements(p_args->'preguntas') loop
        ord := ord + 1;
        insert into preguntas(item,orden,enunciado,opciones,correcta) values (nid,ord,btrim(e->>'q'),e->'o',(e->>'ok')::int);
      end loop;
    end if;
    return jsonb_build_object('ok',true,'id',nid);

  elsif p_op = 'programar_item' then
    update items set visible = coalesce((p_args->>'visible')::boolean,visible), apertura = nullif(p_args->>'apertura','')::timestamptz,
      cierre = nullif(p_args->>'cierre','')::timestamptz, intentos = greatest(1,coalesce((p_args->>'intentos')::int,intentos)) where id = p_args->>'id';
    return jsonb_build_object('ok',true);

  elsif p_op = 'eliminar_item' then
    nid := p_args->>'id';
    delete from archivos where id in (select archivo_id from entregas where item = nid)
       or id::text = (select contenido->>'archivo' from items where id = nid);
    delete from items where id = nid;
    return jsonb_build_object('ok',true);

  elsif p_op = 'mover_item' then
    select * into it from items where id = p_args->>'id';
    if not found then return jsonb_build_object('error','no_existe'); end if;
    if (p_args->>'dir')::int < 0 then
      select * into ant from items where curso = it.curso and (orden < it.orden or (orden = it.orden and id < it.id)) order by orden desc, id desc limit 1;
    else
      select * into ant from items where curso = it.curso and (orden > it.orden or (orden = it.orden and id > it.id)) order by orden, id limit 1;
    end if;
    if found then
      update items set orden = ant.orden where id = it.id;
      update items set orden = it.orden where id = ant.id;
    end if;
    return jsonb_build_object('ok',true);

  elsif p_op = 'item_edicion' then
    select * into it from items where id = p_args->>'id';
    if not found then return jsonb_build_object('error','no_existe'); end if;
    return jsonb_build_object('item', jsonb_build_object('id',it.id,'curso',it.curso,'tipo',it.tipo,'titulo',it.titulo,'contenido',it.contenido,
      'visible',it.visible,'apertura',it.apertura,'cierre',it.cierre,'intentos',it.intentos),
      'preguntas', coalesce((select jsonb_agg(jsonb_build_object('q',enunciado,'o',opciones,'ok',correcta) order by orden) from preguntas where item = it.id),'[]'));

  elsif p_op = 'entregas' then
    return jsonb_build_object(
      'estudiantes', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'nombre',x.nombre,'cedula',x.cedula) order by x.nombre)
        from usuarios x join matriculas m on m.usuario_id = x.id where x.rol = 'estudiante'
        and m.curso = (select curso from items where id = p_args->>'item')),'[]'),
      'entregas', coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'u',g.usuario_id,'nombre',g.nombre,'fecha',g.fecha,'nota',g.nota,
        'comentario',g.comentario,'calificada',g.calificada,'archivo',g.archivo_id)) from entregas g where g.item = p_args->>'item'),'[]'));

  elsif p_op = 'calificar_entrega' then
    if (p_args->>'nota') is null or (p_args->>'nota')::numeric < 0 or (p_args->>'nota')::numeric > 5 then return jsonb_build_object('error','nota_invalida'); end if;
    update entregas set nota = round((p_args->>'nota')::numeric, 1), comentario = nullif(btrim(coalesce(p_args->>'comentario','')),''), calificada = now()
      where id = (p_args->>'id')::uuid;
    return jsonb_build_object('ok',true);

  elsif p_op = 'actividades' then
    return jsonb_build_object('actividades', coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'curso',i.curso,'cursoNombre',c2.nombre,'tipo',i.tipo,
      'titulo',i.titulo,'visible',i.visible,'apertura',i.apertura,'cierre',i.cierre,'intentos',i.intentos,'estado',hb_estado(i),
      'presentaron',(select count(distinct z) from (select usuario_id z from intentos where item = i.id union all select usuario_id from entregas where item = i.id) k),
      'matriculados',(select count(*) from matriculas m where m.curso = i.curso)) order by c2.orden, i.orden)
      from items i join cursos c2 on c2.id = i.curso where i.tipo in ('examen','tarea')),'[]'));

  elsif p_op = 'notas' then
    return jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'curso',i.curso,'tipo',i.tipo,'titulo',i.titulo) order by c2.orden, i.orden)
        from items i join cursos c2 on c2.id = i.curso where i.tipo in ('examen','tarea')),'[]'),
      'intentos', coalesce((select jsonb_agg(jsonb_build_object('u',usuario_id,'item',item,'nota',nota,'correctas',correctas,'total',total,'fecha',fecha) order by fecha) from intentos),'[]'),
      'entregas', coalesce((select jsonb_agg(jsonb_build_object('u',usuario_id,'item',item,'nota',nota,'fecha',fecha,'calificada',calificada)) from entregas),'[]'));

  elsif p_op = 'descargas_resumen' then
    return jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'curso',i.curso,'titulo',i.titulo) order by c2.orden, i.orden)
        from items i join cursos c2 on c2.id = i.curso where i.tipo = 'pdf'),'[]'),
      'descargas', coalesce((select jsonb_agg(jsonb_build_object('u',d.usuario_id,'nombre',x.nombre,'item',d.item,'curso',d.curso,'fecha',d.fecha) order by d.fecha desc)
        from (select * from descargas order by fecha desc limit 2000) d join usuarios x on x.id = d.usuario_id),'[]'));

  elsif p_op = 'estudiantes' then
    return jsonb_build_object('estudiantes', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'nombre',x.nombre,
      'cedula',x.cedula,'correo',x.correo,'cursos',coalesce((select jsonb_agg(m.curso) from matriculas m where m.usuario_id = x.id),'[]'))
      order by x.nombre) from usuarios x where x.rol = 'estudiante'),'[]'));

  elsif p_op = 'crear_estudiantes' then
    for e in select value from jsonb_array_elements(coalesce(p_args->'lista','[]'::jsonb)) loop
      ident := btrim(coalesce(e->>'cedula','')); c := btrim(coalesce(e->>'nombre',''));
      if ident = '' or c = '' or exists (select 1 from usuarios where cedula = ident) then
        om := om || to_jsonb(coalesce(nullif(ident,''), nullif(c,''), '(vacío)')); continue; end if;
      insert into usuarios(nombre,cedula,correo,rol,clave_hash)
        values (c, ident, lower(nullif(btrim(coalesce(e->>'correo','')),'')), 'estudiante',
                crypt(coalesce(nullif(btrim(coalesce(e->>'clave','')),''), ident), gen_salt('bf'))) returning id into uid;
      for cur in select jsonb_array_elements_text(coalesce(p_args->'cursos','[]'::jsonb)) loop
        insert into matriculas select uid, cur where exists (select 1 from cursos where id = cur) on conflict do nothing; end loop;
      n := n + 1;
    end loop;
    return jsonb_build_object('creados', n, 'omitidos', om);

  elsif p_op = 'eliminar_estudiante' then
    delete from archivos where id in (select archivo_id from entregas where usuario_id = (p_args->>'id')::uuid);
    delete from usuarios where id = (p_args->>'id')::uuid and rol = 'estudiante';
    return jsonb_build_object('ok',true);

  elsif p_op = 'restablecer_clave' then
    if length(coalesce(p_args->>'clave','')) < 4 then return jsonb_build_object('error','clave_corta'); end if;
    update usuarios set clave_hash = crypt(p_args->>'clave', gen_salt('bf')) where id = (p_args->>'id')::uuid and rol = 'estudiante';
    return jsonb_build_object('ok',true);

  elsif p_op = 'matricular' then
    for uid in select (jsonb_array_elements_text(coalesce(p_args->'ids','[]'::jsonb)))::uuid loop
      for cur in select jsonb_array_elements_text(coalesce(p_args->'cursos','[]'::jsonb)) loop
        if p_args->>'accion' = 'agregar' then insert into matriculas select uid, cur where exists (select 1 from cursos where id = cur) on conflict do nothing;
        else delete from matriculas where usuario_id = uid and curso = cur; end if;
      end loop;
    end loop;
    return jsonb_build_object('ok',true);
  end if;
  return jsonb_build_object('error','operacion');
end $$;

revoke all on function hb_rpc(text,text,jsonb) from public;
revoke all on function hb_estado(items) from public;
revoke all on function hb_puede(uuid,text,text) from public;
grant execute on function hb_rpc(text,text,jsonb) to anon, authenticated;

-- ============ Datos iniciales ============
insert into cursos(id,nombre,descripcion,emoji,color1,color2,video,orden) values ('comunicacion','Comunicación asertiva','Aprende a expresar lo que piensas y sientes con claridad y respeto, sin agredir ni callar.','💬','#f4a259','#c1121f','https://www.youtube.com/watch?v=ZgmSfdE2y-s',1) on conflict do nothing;
insert into cursos(id,nombre,descripcion,emoji,color1,color2,video,orden) values ('liderazgo','Liderazgo','Descubre cómo guiar a un grupo hacia un objetivo común inspirando confianza.','🧭','#2b2d42','#4361ee','https://www.youtube.com/watch?v=r9Riujuqi0o',2) on conflict do nothing;
insert into cursos(id,nombre,descripcion,emoji,color1,color2,video,orden) values ('trabajo-en-equipo','Trabajo en equipo','Colabora con otras personas, reparte responsabilidades y resuelve conflictos en grupo.','🤝','#c9a66b','#7f5539','https://www.youtube.com/watch?v=cJUXxjOeoCk',3) on conflict do nothing;
insert into cursos(id,nombre,descripcion,emoji,color1,color2,video,orden) values ('inteligencia-emocional','Inteligencia emocional','Reconoce y regula tus emociones y comprende las de los demás para relacionarte mejor.','💜','#8e6bd8','#f72585','https://www.youtube.com/watch?v=JAwUzXSIjCk',4) on conflict do nothing;
insert into cursos(id,nombre,descripcion,emoji,color1,color2,video,orden) values ('oratoria','Oratoria','Habla en público con fluidez: estructura tu discurso, cuida tu voz y tu lenguaje corporal.','🎤','#d62839','#ffb703','https://www.youtube.com/watch?v=rz8njEmQZIw',5) on conflict do nothing;
insert into cursos(id,nombre,descripcion,emoji,color1,color2,video,orden) values ('control-del-tiempo','Control del tiempo','Organiza tus tareas, prioriza lo importante y evita la procrastinación.','⏰','#6c757d','#2a9d8f','https://www.youtube.com/watch?v=Z6F0w8M_RkI',6) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('comunicacion-1','comunicacion','video','Video del curso','{"url": "https://www.youtube.com/watch?v=ZgmSfdE2y-s", "descripcion": "La comunicación asertiva es la capacidad de expresar tus ideas, necesidades y emociones de forma clara y respetuosa, sin imponerte ni dejarte pasar por encima."}'::jsonb,1,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('comunicacion-2','comunicacion','texto','Capítulo 1: acerca de este capítulo','{"cuerpo": "La comunicación asertiva es la capacidad de expresar tus ideas, necesidades y emociones de forma clara y respetuosa, sin imponerte ni dejarte pasar por encima.\n\n## Conceptos clave\n- **Tres estilos de comunicación.** Pasivo: evitas decir lo que piensas. Agresivo: te impones sin respetar al otro. Asertivo: dices lo que piensas con respeto y firmeza.\n- **Mensajes en primera persona.** Habla desde lo que tú sientes: \"Me siento molesto cuando se cancela la reunión sin aviso\", en lugar de \"Tú nunca avisas\".\n- **Escucha activa.** Mira a la persona, no interrumpas y parafrasea lo que entendiste para confirmar que captaste el mensaje.\n- **Decir que no sin culpa.** Agradece la petición, explica tu razón en una frase y propón una alternativa si es posible."}'::jsonb,2,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('comunicacion-3','comunicacion','texto','Capítulo 2: ponlo en práctica','{"cuerpo": "Aplica lo aprendido en comunicación asertiva con estas actividades. Puedes resolverlas en el cuaderno de práctica del material de descarga.\n\n## Actividades\n- Recuerda una situación en la que no dijiste lo que pensabas. Escríbela y redáctala de nuevo con un mensaje en primera persona.\n- Conversa cinco minutos con alguien y parafrasea lo que dice antes de responder. Anota cómo reaccionó.\n- Escribe cómo dirías que no a una petición que no puedes cumplir, de forma amable y firme."}'::jsonb,3,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('comunicacion-4','comunicacion','pdf','Guía de estudio: Comunicación asertiva','{"url": "shared/docs/comunicacion/comunicacion-guia-de-estudio.pdf", "descripcion": "Resumen de las ideas clave del curso para repasar."}'::jsonb,4,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('comunicacion-5','comunicacion','pdf','Cuaderno de práctica: Comunicación asertiva','{"url": "shared/docs/comunicacion/comunicacion-cuaderno-de-practica.pdf", "descripcion": "Ejercicios con espacio para escribir y una autoevaluación."}'::jsonb,5,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('comunicacion-6','comunicacion','tarjetas','Tarjetas de repaso rápido','{"intro": "La comunicación asertiva es la capacidad de expresar tus ideas, necesidades y emociones de forma clara y respetuosa, sin imponerte ni dejarte pasar por encima.", "tarjetas": [{"q": "¿Cuáles son los tres estilos de comunicación?", "a": "Pasivo, agresivo y asertivo.", "t": "Tres estilos de comunicación", "x": "Pasivo: evitas decir lo que piensas. Agresivo: te impones sin respetar al otro. Asertivo: dices lo que piensas con respeto y firmeza."}, {"q": "¿Cómo reaccionas cuando no estás de acuerdo con alguien?", "a": "Digo lo que pienso con respeto, hablando desde lo que yo siento.", "t": "Mensajes en primera persona", "x": "Habla desde lo que tú sientes: \"Me siento molesto cuando se cancela la reunión sin aviso\", en lugar de \"Tú nunca avisas\"."}, {"q": "¿Qué haces para demostrar que escuchas de verdad?", "a": "Miro a la persona, no interrumpo y parafraseo lo que entendí.", "t": "Escucha activa", "x": "Mira a la persona, no interrumpas y parafrasea lo que entendiste para confirmar que captaste el mensaje."}, {"q": "¿Cómo puedes decir que no sin sentir culpa?", "a": "Agradezco, explico mi razón en una frase y propongo una alternativa.", "t": "Decir que no sin culpa", "x": "Agradece la petición, explica tu razón en una frase y propón una alternativa si es posible."}]}'::jsonb,6,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('comunicacion-7','comunicacion','examen','Evaluación: Comunicación asertiva','{"descripcion": "Responde las preguntas de única respuesta. Tu calificación queda registrada."}'::jsonb,7,true,3) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('liderazgo-1','liderazgo','video','Video del curso','{"url": "https://www.youtube.com/watch?v=r9Riujuqi0o", "descripcion": "Liderar es influir en otras personas para alcanzar una meta común, inspirando confianza más que imponiendo autoridad."}'::jsonb,1,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('liderazgo-2','liderazgo','texto','Capítulo 1: acerca de este capítulo','{"cuerpo": "Liderar es influir en otras personas para alcanzar una meta común, inspirando confianza más que imponiendo autoridad.\n\n## Conceptos clave\n- **Estilos de liderazgo.** Existen los estilos autoritario, democrático y liberal. El líder eficaz elige el estilo según la situación y el equipo.\n- **Toma de decisiones.** Define el problema, reúne información, evalúa opciones y decide. Comunica por qué tomaste esa decisión.\n- **Delegar con claridad.** Explica el objetivo, el plazo y los recursos disponibles. Confía en la persona y haz seguimiento sin controlar cada paso.\n- **Retroalimentación útil.** Describe hechos concretos, el efecto que tuvieron y una sugerencia de mejora. Reconoce también lo que se hizo bien."}'::jsonb,2,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('liderazgo-3','liderazgo','texto','Capítulo 2: ponlo en práctica','{"cuerpo": "Aplica lo aprendido en liderazgo con estas actividades. Puedes resolverlas en el cuaderno de práctica del material de descarga.\n\n## Actividades\n- Identifica a un líder que admires y escribe tres cualidades que lo caracterizan.\n- Elige una tarea y delégala por escrito indicando objetivo, plazo y recursos.\n- Da retroalimentación a un compañero siguiendo el esquema: hecho, efecto y sugerencia."}'::jsonb,3,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('liderazgo-4','liderazgo','pdf','Guía de estudio: Liderazgo','{"url": "shared/docs/liderazgo/liderazgo-guia-de-estudio.pdf", "descripcion": "Resumen de las ideas clave del curso para repasar."}'::jsonb,4,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('liderazgo-5','liderazgo','pdf','Cuaderno de práctica: Liderazgo','{"url": "shared/docs/liderazgo/liderazgo-cuaderno-de-practica.pdf", "descripcion": "Ejercicios con espacio para escribir y una autoevaluación."}'::jsonb,5,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('liderazgo-6','liderazgo','tarjetas','Tarjetas de repaso rápido','{"intro": "Liderar es influir en otras personas para alcanzar una meta común, inspirando confianza más que imponiendo autoridad.", "tarjetas": [{"q": "¿Un solo estilo de liderazgo sirve para todo?", "a": "No: se elige según la situación y el equipo.", "t": "Estilos de liderazgo", "x": "Existen los estilos autoritario, democrático y liberal. El líder eficaz elige el estilo según la situación y el equipo."}, {"q": "¿Qué pasos sigues para decidir bien?", "a": "Definir el problema, reunir información, evaluar opciones y decidir.", "t": "Toma de decisiones", "x": "Define el problema, reúne información, evalúa opciones y decide. Comunica por qué tomaste esa decisión."}, {"q": "¿Qué debes explicar al delegar una tarea?", "a": "El objetivo, el plazo y los recursos disponibles.", "t": "Delegar con claridad", "x": "Explica el objetivo, el plazo y los recursos disponibles. Confía en la persona y haz seguimiento sin controlar cada paso."}, {"q": "¿Cómo se da una retroalimentación útil?", "a": "Con hechos concretos, su efecto y una sugerencia de mejora.", "t": "Retroalimentación útil", "x": "Describe hechos concretos, el efecto que tuvieron y una sugerencia de mejora. Reconoce también lo que se hizo bien."}]}'::jsonb,6,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('liderazgo-7','liderazgo','examen','Evaluación: Liderazgo','{"descripcion": "Responde las preguntas de única respuesta. Tu calificación queda registrada."}'::jsonb,7,true,3) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('trabajo-en-equipo-1','trabajo-en-equipo','video','Video del curso','{"url": "https://www.youtube.com/watch?v=cJUXxjOeoCk", "descripcion": "Trabajar en equipo es coordinar esfuerzos con otras personas para lograr resultados que no se alcanzarían de forma individual."}'::jsonb,1,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('trabajo-en-equipo-2','trabajo-en-equipo','texto','Capítulo 1: acerca de este capítulo','{"cuerpo": "Trabajar en equipo es coordinar esfuerzos con otras personas para lograr resultados que no se alcanzarían de forma individual.\n\n## Conceptos clave\n- **Roles dentro del equipo.** Cuando cada persona conoce su rol (coordinar, aportar ideas, ejecutar, revisar) se evitan duplicidades y vacíos.\n- **Acuerdos claros.** Definan metas, tiempos y formas de comunicación al inicio. Lo que se acuerda por escrito se cumple mejor.\n- **Manejo de conflictos.** Separa a la persona del problema, escucha todas las posturas y busca una solución en la que el equipo gane.\n- **Confianza y cooperación.** Reconoce los aportes de los demás, pide ayuda a tiempo y cumple lo que prometes."}'::jsonb,2,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('trabajo-en-equipo-3','trabajo-en-equipo','texto','Capítulo 2: ponlo en práctica','{"cuerpo": "Aplica lo aprendido en trabajo en equipo con estas actividades. Puedes resolverlas en el cuaderno de práctica del material de descarga.\n\n## Actividades\n- Escribe el rol que sueles asumir en un grupo y el que te gustaría practicar.\n- Con tu equipo, redacta tres acuerdos de trabajo para un proyecto.\n- Describe un conflicto reciente y plantea una solución en la que todos ganen."}'::jsonb,3,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('trabajo-en-equipo-4','trabajo-en-equipo','pdf','Guía de estudio: Trabajo en equipo','{"url": "shared/docs/trabajo-en-equipo/trabajo-en-equipo-guia-de-estudio.pdf", "descripcion": "Resumen de las ideas clave del curso para repasar."}'::jsonb,4,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('trabajo-en-equipo-5','trabajo-en-equipo','pdf','Cuaderno de práctica: Trabajo en equipo','{"url": "shared/docs/trabajo-en-equipo/trabajo-en-equipo-cuaderno-de-practica.pdf", "descripcion": "Ejercicios con espacio para escribir y una autoevaluación."}'::jsonb,5,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('trabajo-en-equipo-6','trabajo-en-equipo','tarjetas','Tarjetas de repaso rápido','{"intro": "Trabajar en equipo es coordinar esfuerzos con otras personas para lograr resultados que no se alcanzarían de forma individual.", "tarjetas": [{"q": "¿Para qué sirve que cada persona tenga un rol?", "a": "Evita duplicar trabajo y deja claro quién hace qué.", "t": "Roles dentro del equipo", "x": "Cuando cada persona conoce su rol (coordinar, aportar ideas, ejecutar, revisar) se evitan duplicidades y vacíos."}, {"q": "¿Cuándo conviene fijar los acuerdos del equipo?", "a": "Al inicio, y por escrito.", "t": "Acuerdos claros", "x": "Definan metas, tiempos y formas de comunicación al inicio. Lo que se acuerda por escrito se cumple mejor."}, {"q": "¿Qué haces cuando hay un conflicto en el equipo?", "a": "Separo a la persona del problema, escucho y busco una solución en la que todos ganen.", "t": "Manejo de conflictos", "x": "Separa a la persona del problema, escucha todas las posturas y busca una solución en la que el equipo gane."}, {"q": "¿Cómo se construye la confianza?", "a": "Reconociendo los aportes, pidiendo ayuda a tiempo y cumpliendo lo prometido.", "t": "Confianza y cooperación", "x": "Reconoce los aportes de los demás, pide ayuda a tiempo y cumple lo que prometes."}]}'::jsonb,6,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('trabajo-en-equipo-7','trabajo-en-equipo','examen','Evaluación: Trabajo en equipo','{"descripcion": "Responde las preguntas de única respuesta. Tu calificación queda registrada."}'::jsonb,7,true,3) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('inteligencia-emocional-1','inteligencia-emocional','video','Video del curso','{"url": "https://www.youtube.com/watch?v=JAwUzXSIjCk", "descripcion": "La inteligencia emocional es la habilidad de reconocer y regular tus emociones y de comprender las de los demás para relacionarte mejor."}'::jsonb,1,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('inteligencia-emocional-2','inteligencia-emocional','texto','Capítulo 1: acerca de este capítulo','{"cuerpo": "La inteligencia emocional es la habilidad de reconocer y regular tus emociones y de comprender las de los demás para relacionarte mejor.\n\n## Conceptos clave\n- **Autoconocimiento.** Poner nombre a lo que sientes es el primer paso para manejarlo. Pregúntate qué sientes y qué lo provocó.\n- **Autorregulación.** Respira, haz una pausa y elige cómo responder en lugar de reaccionar por impulso.\n- **Empatía.** Intenta ver la situación desde el punto de vista de la otra persona antes de juzgarla.\n- **Habilidades sociales.** Comunica tus emociones con respeto, colabora con otros y construye relaciones sanas."}'::jsonb,2,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('inteligencia-emocional-3','inteligencia-emocional','texto','Capítulo 2: ponlo en práctica','{"cuerpo": "Aplica lo aprendido en inteligencia emocional con estas actividades. Puedes resolverlas en el cuaderno de práctica del material de descarga.\n\n## Actividades\n- Durante tres días, anota cada noche la emoción más fuerte que sentiste y qué la provocó.\n- Practica la pausa: antes de responder a algo que te moleste, respira tres veces y escribe qué decides hacer.\n- Escribe cómo crees que se sintió alguien con quien discutiste y qué podrías decirle."}'::jsonb,3,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('inteligencia-emocional-4','inteligencia-emocional','pdf','Guía de estudio: Inteligencia emocional','{"url": "shared/docs/inteligencia-emocional/inteligencia-emocional-guia-de-estudio.pdf", "descripcion": "Resumen de las ideas clave del curso para repasar."}'::jsonb,4,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('inteligencia-emocional-5','inteligencia-emocional','pdf','Cuaderno de práctica: Inteligencia emocional','{"url": "shared/docs/inteligencia-emocional/inteligencia-emocional-cuaderno-de-practica.pdf", "descripcion": "Ejercicios con espacio para escribir y una autoevaluación."}'::jsonb,5,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('inteligencia-emocional-6','inteligencia-emocional','tarjetas','Tarjetas de repaso rápido','{"intro": "La inteligencia emocional es la habilidad de reconocer y regular tus emociones y de comprender las de los demás para relacionarte mejor.", "tarjetas": [{"q": "¿Cuál es el primer paso para manejar una emoción?", "a": "Ponerle nombre: saber qué siento y qué la provocó.", "t": "Autoconocimiento", "x": "Poner nombre a lo que sientes es el primer paso para manejarlo. Pregúntate qué sientes y qué lo provocó."}, {"q": "¿Qué haces antes de reaccionar con rabia?", "a": "Respiro, hago una pausa y elijo cómo responder.", "t": "Autorregulación", "x": "Respira, haz una pausa y elige cómo responder en lugar de reaccionar por impulso."}, {"q": "¿Qué es la empatía?", "a": "Ver la situación desde el punto de vista del otro antes de juzgar.", "t": "Empatía", "x": "Intenta ver la situación desde el punto de vista de la otra persona antes de juzgarla."}, {"q": "¿Qué son las habilidades sociales?", "a": "Comunicar emociones con respeto y colaborar para tener relaciones sanas.", "t": "Habilidades sociales", "x": "Comunica tus emociones con respeto, colabora con otros y construye relaciones sanas."}]}'::jsonb,6,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('inteligencia-emocional-7','inteligencia-emocional','examen','Evaluación: Inteligencia emocional','{"descripcion": "Responde las preguntas de única respuesta. Tu calificación queda registrada."}'::jsonb,7,true,3) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('oratoria-1','oratoria','video','Video del curso','{"url": "https://www.youtube.com/watch?v=rz8njEmQZIw", "descripcion": "La oratoria es el arte de comunicar ideas en público de forma clara, ordenada y convincente."}'::jsonb,1,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('oratoria-2','oratoria','texto','Capítulo 1: acerca de este capítulo','{"cuerpo": "La oratoria es el arte de comunicar ideas en público de forma clara, ordenada y convincente.\n\n## Conceptos clave\n- **Estructura del discurso.** Un inicio que capte la atención, un desarrollo con tres ideas principales y un cierre memorable.\n- **Voz y dicción.** Pronuncia con claridad, varía el volumen y haz pausas para dar énfasis.\n- **Lenguaje corporal.** Mantén el contacto visual, una postura abierta y gestos que acompañen tus palabras.\n- **Manejo del miedo escénico.** Prepárate, respira profundo y recuerda que el público quiere que tu presentación salga bien."}'::jsonb,2,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('oratoria-3','oratoria','texto','Capítulo 2: ponlo en práctica','{"cuerpo": "Aplica lo aprendido en oratoria con estas actividades. Puedes resolverlas en el cuaderno de práctica del material de descarga.\n\n## Actividades\n- Prepara un discurso de un minuto sobre un tema que te guste, con inicio, desarrollo y cierre.\n- Grábate en video y revisa tu voz, tu postura y las muletillas que repites.\n- Presenta tu discurso ante una persona de confianza y pídele dos comentarios para mejorar."}'::jsonb,3,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('oratoria-4','oratoria','pdf','Guía de estudio: Oratoria','{"url": "shared/docs/oratoria/oratoria-guia-de-estudio.pdf", "descripcion": "Resumen de las ideas clave del curso para repasar."}'::jsonb,4,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('oratoria-5','oratoria','pdf','Cuaderno de práctica: Oratoria','{"url": "shared/docs/oratoria/oratoria-cuaderno-de-practica.pdf", "descripcion": "Ejercicios con espacio para escribir y una autoevaluación."}'::jsonb,5,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('oratoria-6','oratoria','tarjetas','Tarjetas de repaso rápido','{"intro": "La oratoria es el arte de comunicar ideas en público de forma clara, ordenada y convincente.", "tarjetas": [{"q": "¿Cómo se estructura un buen discurso?", "a": "Un inicio que atrape, tres ideas principales y un cierre memorable.", "t": "Estructura del discurso", "x": "Un inicio que capte la atención, un desarrollo con tres ideas principales y un cierre memorable."}, {"q": "¿Cómo cuidas tu voz al hablar en público?", "a": "Pronuncio con claridad, varío el volumen y hago pausas.", "t": "Voz y dicción", "x": "Pronuncia con claridad, varía el volumen y haz pausas para dar énfasis."}, {"q": "¿Qué comunica tu cuerpo cuando hablas?", "a": "Contacto visual, postura abierta y gestos que acompañan tus palabras.", "t": "Lenguaje corporal", "x": "Mantén el contacto visual, una postura abierta y gestos que acompañen tus palabras."}, {"q": "¿Qué haces con el miedo escénico?", "a": "Me preparo, respiro profundo y recuerdo que el público quiere que me vaya bien.", "t": "Manejo del miedo escénico", "x": "Prepárate, respira profundo y recuerda que el público quiere que tu presentación salga bien."}]}'::jsonb,6,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('oratoria-7','oratoria','examen','Evaluación: Oratoria','{"descripcion": "Responde las preguntas de única respuesta. Tu calificación queda registrada."}'::jsonb,7,true,3) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('control-del-tiempo-1','control-del-tiempo','video','Video del curso','{"url": "https://www.youtube.com/watch?v=Z6F0w8M_RkI", "descripcion": "Controlar el tiempo significa decidir en qué inviertes tus horas para cumplir tus metas sin vivir bajo estrés."}'::jsonb,1,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('control-del-tiempo-2','control-del-tiempo','texto','Capítulo 1: acerca de este capítulo','{"cuerpo": "Controlar el tiempo significa decidir en qué inviertes tus horas para cumplir tus metas sin vivir bajo estrés.\n\n## Conceptos clave\n- **Urgente e importante.** Clasifica tus tareas en urgentes, importantes, ambas o ninguna. Dedica más tiempo a lo importante.\n- **Planificación semanal.** Dedica diez minutos al inicio de la semana para elegir tus tres prioridades y asignarles un horario.\n- **Técnica Pomodoro.** Trabaja 25 minutos con total atención y descansa 5. Después de cuatro ciclos, toma un descanso largo.\n- **Evitar la procrastinación.** Divide las tareas grandes en pasos pequeños y empieza por el más fácil para ganar impulso."}'::jsonb,2,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('control-del-tiempo-3','control-del-tiempo','texto','Capítulo 2: ponlo en práctica','{"cuerpo": "Aplica lo aprendido en control del tiempo con estas actividades. Puedes resolverlas en el cuaderno de práctica del material de descarga.\n\n## Actividades\n- Anota todo lo que hiciste ayer y marca qué fue realmente importante.\n- Arma tu plan de la semana con tres prioridades y su horario.\n- Aplica dos ciclos Pomodoro a una tarea pendiente y anota cuánto avanzaste."}'::jsonb,3,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('control-del-tiempo-4','control-del-tiempo','pdf','Guía de estudio: Control del tiempo','{"url": "shared/docs/control-del-tiempo/control-del-tiempo-guia-de-estudio.pdf", "descripcion": "Resumen de las ideas clave del curso para repasar."}'::jsonb,4,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('control-del-tiempo-5','control-del-tiempo','pdf','Cuaderno de práctica: Control del tiempo','{"url": "shared/docs/control-del-tiempo/control-del-tiempo-cuaderno-de-practica.pdf", "descripcion": "Ejercicios con espacio para escribir y una autoevaluación."}'::jsonb,5,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('control-del-tiempo-6','control-del-tiempo','tarjetas','Tarjetas de repaso rápido','{"intro": "Controlar el tiempo significa decidir en qué inviertes tus horas para cumplir tus metas sin vivir bajo estrés.", "tarjetas": [{"q": "¿A qué tareas dedicas más tiempo?", "a": "A las importantes, aunque no sean urgentes.", "t": "Urgente e importante", "x": "Clasifica tus tareas en urgentes, importantes, ambas o ninguna. Dedica más tiempo a lo importante."}, {"q": "¿Cuándo planificas tu semana?", "a": "Al inicio, eligiendo tres prioridades con su horario.", "t": "Planificación semanal", "x": "Dedica diez minutos al inicio de la semana para elegir tus tres prioridades y asignarles un horario."}, {"q": "¿En qué consiste la técnica Pomodoro?", "a": "25 minutos de enfoque total y 5 de descanso.", "t": "Técnica Pomodoro", "x": "Trabaja 25 minutos con total atención y descansa 5. Después de cuatro ciclos, toma un descanso largo."}, {"q": "¿Cómo vences la procrastinación?", "a": "Divido la tarea en pasos pequeños y empiezo por el más fácil.", "t": "Evitar la procrastinación", "x": "Divide las tareas grandes en pasos pequeños y empieza por el más fácil para ganar impulso."}]}'::jsonb,6,true,1) on conflict do nothing;
insert into items(id,curso,tipo,titulo,contenido,orden,visible,intentos) values ('control-del-tiempo-7','control-del-tiempo','examen','Evaluación: Control del tiempo','{"descripcion": "Responde las preguntas de única respuesta. Tu calificación queda registrada."}'::jsonb,7,true,3) on conflict do nothing;
delete from preguntas;
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('comunicacion-7',1,'¿Cuál es un ejemplo de mensaje en primera persona?','["Tú nunca me escuchas", "Me siento ignorado cuando me interrumpen", "Todos saben que estás equivocado"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('comunicacion-7',2,'Una persona asertiva…','["Evita expresar lo que piensa", "Impone su opinión", "Expresa lo que piensa con respeto"]'::jsonb,2);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('comunicacion-7',3,'Parafrasear en la escucha activa sirve para…','["Confirmar que entendiste el mensaje", "Cambiar de tema", "Demostrar que tienes la razón"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('comunicacion-7',4,'Si alguien te critica injustamente, una respuesta asertiva es…','["Gritar para defenderte", "Expresar con calma tu punto de vista", "Quedarte callado y resentido"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('comunicacion-7',5,'La asertividad busca…','["Ganar la discusión", "Respetar tus derechos y los de los demás", "Evitar todo conflicto"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('liderazgo-7',1,'Delegar bien implica…','["Hacer todo uno mismo", "Explicar objetivo, plazo y recursos", "Revisar cada paso a cada momento"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('liderazgo-7',2,'Una buena retroalimentación incluye…','["Hechos concretos y una sugerencia", "Críticas generales", "Solo elogios"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('liderazgo-7',3,'El líder eficaz…','["Usa siempre el mismo estilo", "Adapta su estilo a la situación", "Evita tomar decisiones"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('liderazgo-7',4,'¿Qué caracteriza a un líder democrático?','["Decide solo", "Involucra al equipo en las decisiones", "No participa"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('liderazgo-7',5,'Para inspirar confianza, un líder debe…','["Ser coherente entre lo que dice y hace", "Prometer sin cumplir", "Evitar dar explicaciones"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('trabajo-en-equipo-7',1,'Definir roles en un equipo ayuda a…','["Evitar duplicidades y vacíos", "Que una sola persona decida todo", "Trabajar sin comunicarse"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('trabajo-en-equipo-7',2,'Ante un conflicto lo mejor es…','["Culpar a alguien", "Escuchar todas las posturas y buscar acuerdos", "Ignorarlo"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('trabajo-en-equipo-7',3,'Los acuerdos de equipo funcionan mejor cuando…','["Quedan por escrito", "Se dan por entendidos", "Los define una sola persona"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('trabajo-en-equipo-7',4,'Una ventaja del trabajo en equipo es…','["Combinar habilidades diferentes", "Que todos hagan lo mismo", "Evitar la comunicación"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('trabajo-en-equipo-7',5,'Cuando un compañero no cumple, lo más adecuado es…','["Hablar con él para entender y acordar", "Hacer su parte en silencio", "Reportarlo sin hablarle"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('inteligencia-emocional-7',1,'El primer paso para manejar una emoción es…','["Negarla", "Reconocerla y ponerle nombre", "Reaccionar de inmediato"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('inteligencia-emocional-7',2,'La empatía consiste en…','["Ver la situación desde el punto de vista del otro", "Dar siempre la razón", "Evitar hablar de emociones"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('inteligencia-emocional-7',3,'La autorregulación nos permite…','["Responder en lugar de reaccionar por impulso", "Ocultar lo que sentimos", "Evitar a las personas"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('inteligencia-emocional-7',4,'¿Cuál es un ejemplo de empatía?','["Escuchar y reconocer lo que siente el otro", "Ignorar sus emociones", "Dar órdenes"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('inteligencia-emocional-7',5,'Las emociones son…','["Información útil sobre lo que nos pasa", "Siempre un error", "Algo que se debe ocultar"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('oratoria-7',1,'Un buen discurso tiene…','["Solo desarrollo", "Inicio, desarrollo y cierre", "Muchas ideas sin orden"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('oratoria-7',2,'Las pausas al hablar sirven para…','["Dar énfasis a las ideas", "Mostrar nerviosismo", "Alargar el discurso"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('oratoria-7',3,'Para manejar el miedo escénico conviene…','["Improvisar todo", "Prepararse y respirar profundo", "Evitar mirar al público"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('oratoria-7',4,'Las muletillas al hablar en público…','["Conviene reducirlas para dar claridad", "Son recomendables", "No afectan nunca"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('oratoria-7',5,'El contacto visual con la audiencia sirve para…','["Generar conexión y confianza", "Distraer al público", "Leer mejor las diapositivas"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('control-del-tiempo-7',1,'En la técnica Pomodoro se trabaja…','["25 minutos y se descansa 5", "Cuatro horas seguidas", "Sin descansos"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('control-del-tiempo-7',2,'Para evitar procrastinar conviene…','["Esperar a tener ganas", "Dividir la tarea en pasos pequeños", "Hacer todo a la vez"]'::jsonb,1);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('control-del-tiempo-7',3,'Priorizar significa…','["Hacer primero lo importante", "Hacer lo más fácil siempre", "Dejar todo para el final"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('control-del-tiempo-7',4,'La matriz de Eisenhower clasifica las tareas según…','["Urgencia e importancia", "Color y tamaño", "Dificultad y precio"]'::jsonb,0);
insert into preguntas(item,orden,enunciado,opciones,correcta) values ('control-del-tiempo-7',5,'Planificar la semana ayuda a…','["Reducir el estrés y priorizar", "Hacer menos actividades siempre", "Evitar descansar"]'::jsonb,0);
insert into usuarios(nombre,usuario,rol,clave_hash) values ('Yalidis Beltrán','yalidis','profesor',extensions.crypt('12345',extensions.gen_salt('bf'))) on conflict do nothing;
insert into usuarios(nombre,cedula,rol,clave_hash) values ('Luis Carlos de Arco','1047440371','estudiante',extensions.crypt('12345',extensions.gen_salt('bf'))) on conflict do nothing;
insert into matriculas select id, 'comunicacion' from usuarios where cedula='1047440371' on conflict do nothing;
insert into matriculas select id, 'liderazgo' from usuarios where cedula='1047440371' on conflict do nothing;
insert into matriculas select id, 'trabajo-en-equipo' from usuarios where cedula='1047440371' on conflict do nothing;
insert into matriculas select id, 'inteligencia-emocional' from usuarios where cedula='1047440371' on conflict do nothing;
insert into matriculas select id, 'oratoria' from usuarios where cedula='1047440371' on conflict do nothing;
insert into matriculas select id, 'control-del-tiempo' from usuarios where cedula='1047440371' on conflict do nothing;
