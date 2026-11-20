import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE } from './config.js';

export const sb = createClient(SUPABASE.url, SUPABASE.anonKey);

// Chama uma função do banco (RPC) e devolve os dados, ou lança o erro.
export async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
}
