/**
 * Import businesses from Israeli government open data (data.gov.il)
 * Usage: npx tsx scripts/import-gov.ts
 *
 * Government open data is free and legal to use.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function makeSlug(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^\w֐-׿\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 60);
  return `${base}-gov${id.substring(0, 8)}`;
}

async function fetchDataGovResource(resourceId: string, limit = 10000) {
  const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${resourceId}&limit=${limit}`;
  console.log(`  Fetching: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`data.gov.il error: ${res.status}`);
  const data = await res.json();
  return data.result?.records || [];
}

async function importPharmacies() {
  console.log("\n--- Importing pharmacies ---");
  try {
    // Resource ID for pharmacies in Israel
    const records = await fetchDataGovResource("pharmacies-resource-id");
    console.log(`  Found ${records.length} pharmacies`);

    const businesses = records
      .filter((r: any) => r.pharmacy_name || r.name)
      .map((r: any, i: number) => ({
        name: r.pharmacy_name || r.name,
        slug: makeSlug(r.pharmacy_name || r.name, String(i)),
        category: "בריאות ורפואה",
        subcategory: "בתי מרקחת",
        phone: r.phone || null,
        address: r.address || r.street || null,
        city: r.city || r.settlement || null,
        source: "gov",
        source_id: `gov-pharmacy-${i}`,
        verified: true,
        claimed: false,
        images: [],
        tags: ["בית מרקחת"],
        rating: 0,
        review_count: 0,
        social_links: {},
        opening_hours: {},
      }));

    return businesses;
  } catch (err) {
    console.log("  Pharmacies dataset not available, skipping");
    return [];
  }
}

async function importToSupabase(businesses: any[]) {
  if (businesses.length === 0) return;

  console.log(`\nImporting ${businesses.length} businesses...`);
  const batchSize = 500;
  let total = 0;

  for (let i = 0; i < businesses.length; i += batchSize) {
    const batch = businesses.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("businesses")
      .upsert(batch, { onConflict: "slug", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error(`  Batch error:`, error.message);
    } else {
      total += data?.length || 0;
    }
  }

  console.log(`  Imported: ${total}`);
}

async function main() {
  console.log("=== YourZon Government Data Import ===\n");

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing environment variables");
    process.exit(1);
  }

  const allBusinesses: any[] = [];

  // Import from various government datasets
  const pharmacies = await importPharmacies();
  allBusinesses.push(...pharmacies);

  // Add more government data sources here as they become available
  // e.g., restaurants with health certificates, schools, kindergartens

  console.log(`\nTotal government businesses: ${allBusinesses.length}`);

  const seen = new Set<string>();
  const unique = allBusinesses.filter((b) => {
    if (seen.has(b.slug)) return false;
    seen.add(b.slug);
    return true;
  });

  await importToSupabase(unique);
}

main().catch(console.error);
