import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  let dbConnected = false;
  let businessCount = 0;
  let reviewCount = 0;

  if (hasUrl && hasAnon) {
    try {
      const { count } = await supabase
        .from("businesses")
        .select("*", { count: "exact", head: true });
      dbConnected = true;
      businessCount = count || 0;

      const { count: revCount } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true });
      reviewCount = revCount || 0;
    } catch {
      dbConnected = false;
    }
  }

  return NextResponse.json({
    supabase: { hasUrl, hasAnon, hasService, dbConnected },
    data: { businessCount, reviewCount },
  });
}
