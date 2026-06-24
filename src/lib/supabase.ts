import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let _client: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!supabaseUrl) {
      if (prop === "from") {
        return () => ({
          select: () => ({ data: [], count: 0, error: null, order: () => ({ data: [], limit: () => ({ data: [] }), range: () => ({ data: [], count: 0 }), or: () => ({ data: [], order: () => ({ data: [], limit: () => ({ data: [] }) }) }) }), eq: () => ({ data: null, single: () => ({ data: null }), order: () => ({ data: [], limit: () => ({ data: [] }) }) }) }),
          insert: () => ({ data: null, error: null }),
          upsert: () => ({ data: null, error: null, select: () => ({ data: [] }) }),
        });
      }
      return undefined;
    }
    if (!_client) _client = createClient(supabaseUrl, supabaseAnonKey);
    return (_client as any)[prop];
  },
});

export function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}
