import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const city = searchParams.get("city");
  const search = searchParams.get("q");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;

  let query = supabase
    .from("businesses")
    .select("*", { count: "exact" })
    .order("rating", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) query = query.eq("category", category);
  if (city) query = query.eq("city", city);
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,city.ilike.%${search}%,category.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    businesses: data,
    total: count,
    page,
    pages: Math.ceil((count || 0) / limit),
  });
}
