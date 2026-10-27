-- Ejecutar en el SQL Editor del proyecto Supabase usado por la aplicación.
alter table public.empleados
  add column if not exists documentos_revision jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
