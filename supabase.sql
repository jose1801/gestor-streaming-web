-- Corre esto en Supabase: Dashboard -> SQL Editor -> New query -> pega y ejecuta

create table cuentas (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null default 'Netflix',
  correo text not null default '',
  clave text not null default '',
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid()
);

create table perfiles (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas(id) on delete cascade,
  numero int not null,
  comprador text not null default '',
  contacto text not null default '',
  fecha_venta date,
  duracion_dias int not null default 30,
  precio text not null default '',
  user_id uuid not null default auth.uid(),
  unique (cuenta_id, numero)
);

alter table cuentas enable row level security;
alter table perfiles enable row level security;

-- Solo el dueño de la fila puede leerla / escribirla
create policy "cuentas propias" on cuentas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "perfiles propios" on perfiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
