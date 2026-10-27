-- Ejecutar en Supabase para agregar los campos de ubicación del contrato.
alter table public.empleados
  add column if not exists lugar_desempeno_labores text,
  add column if not exists lugar_contratacion text,
  add column if not exists frente_obra text,
  add column if not exists bono_mera_liberalidad numeric;

notify pgrst, 'reload schema';
