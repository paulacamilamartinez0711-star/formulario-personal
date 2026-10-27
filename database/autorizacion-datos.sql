-- Ejecutar en SQL Editor del mismo proyecto Supabase usado por la aplicación.
alter table public.empleados
  add column if not exists autorizacion_datos boolean not null default false;

notify pgrst, 'reload schema';
