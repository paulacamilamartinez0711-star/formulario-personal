import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://zqfqvcapdtiwntkirunn.supabase.co'
export const supabaseKey = 'sb_publishable_itiGj8i8Yy8rhcLRn-9Y0w_kiMIf5nv'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)