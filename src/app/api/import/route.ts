import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedKey = process.env.IMPORT_API_KEY;

  if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { businesses } = await req.json();

  if (!Array.isArray(businesses) || businesses.length === 0) {
    return NextResponse.json({ error: "businesses array required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  let inserted = 0;
  let skipped = 0;
  const batchSize = 500;

  for (let i = 0; i < businesses.length; i += batchSize) {
    const batch = businesses.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("businesses")
      .upsert(batch, { onConflict: "slug", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error(`Batch ${i} error:`, error.message);
      skipped += batch.length;
    } else {
      inserted += data?.length || 0;
    }
  }

  return NextResponse.json({ inserted, skipped, total: businesses.length });
}
