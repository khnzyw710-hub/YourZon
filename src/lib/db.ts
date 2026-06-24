import { SEED_BUSINESSES, type SeedBusiness } from "@/data/businesses";
import type { Business } from "./types";

let _businesses: Business[] | null = null;

function slugify(name: string, index: number): string {
  const base = name
    .replace(/[^\w֐-׿\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 60);
  return `${base}-${index}`;
}

function seedToBusiness(seed: SeedBusiness, index: number): Business {
  return {
    id: `seed-${index}`,
    name: seed.name,
    name_en: seed.name_en,
    slug: slugify(seed.name, index),
    description: seed.description,
    category: seed.category,
    subcategory: seed.subcategory,
    phone: seed.phone,
    website: seed.website,
    address: seed.address,
    city: seed.city,
    lat: undefined,
    lng: undefined,
    opening_hours: {},
    social_links: {},
    images: [],
    rating: 0,
    review_count: 0,
    source: "manual",
    verified: false,
    claimed: false,
    tags: seed.tags || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function getBusinesses(): Business[] {
  if (!_businesses) {
    _businesses = SEED_BUSINESSES.map((s, i) => seedToBusiness(s, i));
  }
  return _businesses;
}

const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function getAllBusinesses(): Promise<Business[]> {
  if (hasSupabase) {
    const { supabase } = await import("./supabase");
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .order("rating", { ascending: false })
      .limit(200);
    if (data && data.length > 0) return data;
  }
  return getBusinesses();
}

export async function getTopBusinesses(limit = 12): Promise<Business[]> {
  if (hasSupabase) {
    const { supabase } = await import("./supabase");
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .order("rating", { ascending: false })
      .limit(limit);
    if (data && data.length > 0) return data;
  }
  return getBusinesses().slice(0, limit);
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  if (hasSupabase) {
    const { supabase } = await import("./supabase");
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .eq("slug", slug)
      .single();
    if (data) return data;
  }
  return getBusinesses().find((b) => b.slug === slug) || null;
}

export async function getBusinessesByCategory(category: string, subcategory?: string): Promise<Business[]> {
  if (hasSupabase) {
    const { supabase } = await import("./supabase");
    let query = supabase.from("businesses").select("*").eq("category", category);
    if (subcategory) query = query.eq("subcategory", subcategory);
    const { data } = await query.order("rating", { ascending: false }).limit(50);
    if (data && data.length > 0) return data;
  }
  let results = getBusinesses().filter((b) => b.category === category);
  if (subcategory) results = results.filter((b) => b.subcategory === subcategory);
  return results;
}

export async function getBusinessesByCity(city: string): Promise<Business[]> {
  if (hasSupabase) {
    const { supabase } = await import("./supabase");
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .eq("city", city)
      .order("rating", { ascending: false })
      .limit(60);
    if (data && data.length > 0) return data;
  }
  return getBusinesses().filter((b) => b.city === city);
}

export async function searchBusinesses(query: string): Promise<Business[]> {
  const q = query.toLowerCase();
  if (hasSupabase) {
    const { supabase } = await import("./supabase");
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .or(`name.ilike.%${query}%,city.ilike.%${query}%,category.ilike.%${query}%`)
      .order("rating", { ascending: false })
      .limit(50);
    if (data && data.length > 0) return data;
  }
  return getBusinesses().filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      b.city?.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q) ||
      b.subcategory?.toLowerCase().includes(q) ||
      b.tags?.some((t) => t.toLowerCase().includes(q))
  );
}

export async function getStats(): Promise<{ businessCount: number; reviewCount: number }> {
  if (hasSupabase) {
    const { supabase } = await import("./supabase");
    const { count: bc } = await supabase.from("businesses").select("*", { count: "exact", head: true });
    const { count: rc } = await supabase.from("reviews").select("*", { count: "exact", head: true });
    if (bc && bc > 0) return { businessCount: bc, reviewCount: rc || 0 };
  }
  return { businessCount: getBusinesses().length, reviewCount: 0 };
}

export async function getReviews(businessId: string) {
  if (hasSupabase) {
    const { supabase } = await import("./supabase");
    const { data } = await supabase
      .from("reviews")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    return data || [];
  }
  return [];
}
