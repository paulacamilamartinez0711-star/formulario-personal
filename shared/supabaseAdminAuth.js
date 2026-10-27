import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "../src/supabase.js";

export async function isAdminToken(token) {
  if (!token) return false;

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return false;

  const { data: profile, error: profileError } = await client
    .from("perfiles")
    .select("rol")
    .eq("id", data.user.id)
    .maybeSingle();

  return !profileError && profile?.rol === "admin";
}
