/**
 * Import businesses from OpenStreetMap via Overpass API
 * Usage: npx tsx scripts/import-osm.ts
 *
 * OpenStreetMap data is licensed under ODbL - free to use with attribution.
 * Overpass API is free, no API key needed.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const OVERPASS_API = "https://overpass-api.de/api/interpreter";

const OSM_CATEGORY_MAP: Record<string, { category: string; subcategory?: string }> = {
  restaurant: { category: "מסעדות ואוכל", subcategory: "מסעדות" },
  cafe: { category: "מסעדות ואוכל", subcategory: "בתי קפה" },
  fast_food: { category: "מסעדות ואוכל", subcategory: "מזון מהיר" },
  bar: { category: "מסעדות ואוכל", subcategory: "ברים ופאבים" },
  pub: { category: "מסעדות ואוכל", subcategory: "ברים ופאבים" },
  ice_cream: { category: "מסעדות ואוכל", subcategory: "גלידריות" },
  bakery: { category: "מסעדות ואוכל", subcategory: "מאפיות" },
  pharmacy: { category: "בריאות ורפואה", subcategory: "בתי מרקחת" },
  hospital: { category: "בריאות ורפואה", subcategory: "מרפאות" },
  clinic: { category: "בריאות ורפואה", subcategory: "מרפאות" },
  dentist: { category: "בריאות ורפואה", subcategory: "רופאי שיניים" },
  doctors: { category: "בריאות ורפואה", subcategory: "רופאי משפחה" },
  hairdresser: { category: "יופי וטיפוח", subcategory: "מספרות" },
  beauty: { category: "יופי וטיפוח", subcategory: "מכוני יופי" },
  car_repair: { category: "רכב", subcategory: "מוסכים" },
  car: { category: "רכב", subcategory: "סוכנויות רכב" },
  car_wash: { category: "רכב", subcategory: "שטיפת רכב" },
  fuel: { category: "רכב", subcategory: "תדלוק" },
  supermarket: { category: "קניות", subcategory: "סופרמרקטים" },
  convenience: { category: "קניות", subcategory: "חנויות נוחות" },
  clothes: { category: "קניות", subcategory: "אופנה וביגוד" },
  electronics: { category: "קניות", subcategory: "אלקטרוניקה" },
  books: { category: "קניות", subcategory: "ספרים" },
  jewelry: { category: "קניות", subcategory: "תכשיטים" },
  florist: { category: "קניות", subcategory: "פרחים" },
  pet: { category: "קניות", subcategory: "חיות מחמד" },
  toys: { category: "קניות", subcategory: "צעצועים" },
  school: { category: "חינוך ולימודים", subcategory: "בתי ספר" },
  kindergarten: { category: "חינוך ולימודים", subcategory: "גני ילדים" },
  university: { category: "חינוך ולימודים", subcategory: "אוניברסיטאות" },
  college: { category: "חינוך ולימודים", subcategory: "קורסים" },
  fitness_centre: { category: "ספורט וכושר", subcategory: "חדרי כושר" },
  gym: { category: "ספורט וכושר", subcategory: "חדרי כושר" },
  swimming_pool: { category: "פנאי ובידור", subcategory: "בריכות שחיה" },
  cinema: { category: "פנאי ובידור", subcategory: "קולנוע" },
  hotel: { category: "תיירות ונסיעות", subcategory: "מלונות" },
  guest_house: { category: "תיירות ונסיעות", subcategory: "צימרים" },
  hostel: { category: "תיירות ונסיעות", subcategory: "מלונות" },
  travel_agency: { category: "תיירות ונסיעות", subcategory: "סוכנויות נסיעות" },
  bank: { category: "ממשל ושירותים ציבוריים", subcategory: "בנקים" },
  post_office: { category: "ממשל ושירותים ציבוריים", subcategory: "דואר" },
  place_of_worship: { category: "דת ורוחניות" },
  furniture: { category: "בית וגינה", subcategory: "רהיטים" },
  hardware: { category: "בית וגינה", subcategory: "שיפוצים" },
  mobile_phone: { category: "טכנולוגיה ומחשבים", subcategory: "תיקון סלולר" },
  computer: { category: "טכנולוגיה ומחשבים", subcategory: "תיקון מחשבים" },
};

function makeSlug(name: string, osmId: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^\w֐-׿\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 60);
  return `${base}-osm${osmId}`;
}

function detectCity(tags: Record<string, string>): string {
  return (
    tags["addr:city"] ||
    tags["addr:suburb"] ||
    tags["is_in:city"] ||
    ""
  );
}

function buildAddress(tags: Record<string, string>): string {
  const parts = [];
  if (tags["addr:street"]) parts.push(tags["addr:street"]);
  if (tags["addr:housenumber"]) parts.push(tags["addr:housenumber"]);
  return parts.join(" ");
}

function getCategory(tags: Record<string, string>): { category: string; subcategory?: string } | null {
  const amenity = tags.amenity;
  const shop = tags.shop;
  const tourism = tags.tourism;
  const leisure = tags.leisure;

  if (amenity && OSM_CATEGORY_MAP[amenity]) return OSM_CATEGORY_MAP[amenity];
  if (shop && OSM_CATEGORY_MAP[shop]) return OSM_CATEGORY_MAP[shop];
  if (tourism && OSM_CATEGORY_MAP[tourism]) return OSM_CATEGORY_MAP[tourism];
  if (leisure && OSM_CATEGORY_MAP[leisure]) return OSM_CATEGORY_MAP[leisure];

  if (shop) return { category: "קניות" };
  if (amenity) return { category: "שירותים מקצועיים" };

  return null;
}

async function queryOverpass(query: string): Promise<any[]> {
  const res = await fetch(OVERPASS_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.elements || [];
}

async function fetchIsraelBusinesses(): Promise<any[]> {
  console.log("Fetching businesses from OpenStreetMap...");

  // Israel bounding box: south=29.45, west=34.25, north=33.35, east=35.90
  const bbox = "29.45,34.25,33.35,35.90";

  const queries = [
    // Amenities (restaurants, cafes, banks, etc.)
    `[out:json][timeout:300];
     (
       node["amenity"]["name"](${bbox});
       way["amenity"]["name"](${bbox});
     );
     out center body;`,

    // Shops
    `[out:json][timeout:300];
     (
       node["shop"]["name"](${bbox});
       way["shop"]["name"](${bbox});
     );
     out center body;`,

    // Tourism (hotels, hostels, etc.)
    `[out:json][timeout:300];
     (
       node["tourism"]["name"](${bbox});
       way["tourism"]["name"](${bbox});
     );
     out center body;`,

    // Leisure (gyms, pools, etc.)
    `[out:json][timeout:300];
     (
       node["leisure"]["name"](${bbox});
       way["leisure"]["name"](${bbox});
     );
     out center body;`,
  ];

  const allElements: any[] = [];

  for (let i = 0; i < queries.length; i++) {
    console.log(`  Query ${i + 1}/${queries.length}...`);
    try {
      const elements = await queryOverpass(queries[i]);
      console.log(`  Got ${elements.length} elements`);
      allElements.push(...elements);
    } catch (err) {
      console.error(`  Query ${i + 1} failed:`, err);
    }
    // Rate limiting - wait 10s between queries
    if (i < queries.length - 1) {
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  return allElements;
}

function osmElementToBusiness(el: any) {
  const tags = el.tags || {};
  const name = tags.name || tags["name:he"];
  if (!name) return null;

  const cat = getCategory(tags);
  if (!cat) return null;

  const lat = el.lat || el.center?.lat;
  const lng = el.lon || el.center?.lon;

  const socialLinks: Record<string, string> = {};
  if (tags["contact:instagram"] || tags.instagram) {
    socialLinks.instagram = tags["contact:instagram"] || tags.instagram;
  }
  if (tags["contact:facebook"] || tags.facebook) {
    socialLinks.facebook = tags["contact:facebook"] || tags.facebook;
  }

  const openingHours: Record<string, string> = {};
  if (tags.opening_hours) {
    openingHours.raw = tags.opening_hours;
  }

  return {
    name,
    name_en: tags["name:en"] || null,
    slug: makeSlug(name, el.id),
    description: tags.description || tags["description:he"] || null,
    category: cat.category,
    subcategory: cat.subcategory || null,
    phone: tags.phone || tags["contact:phone"] || null,
    email: tags.email || tags["contact:email"] || null,
    website: tags.website || tags["contact:website"] || null,
    address: buildAddress(tags) || null,
    city: detectCity(tags) || null,
    area: null,
    lat: lat || null,
    lng: lng || null,
    opening_hours: Object.keys(openingHours).length > 0 ? openingHours : {},
    social_links: Object.keys(socialLinks).length > 0 ? socialLinks : {},
    images: [],
    logo: null,
    rating: 0,
    review_count: 0,
    source: "osm",
    source_id: `osm-${el.id}`,
    verified: false,
    claimed: false,
    tags: tags.cuisine ? tags.cuisine.split(";").map((s: string) => s.trim()) : [],
  };
}

async function importToSupabase(businesses: any[]) {
  console.log(`\nImporting ${businesses.length} businesses to Supabase...`);
  const batchSize = 500;
  let total = 0;

  for (let i = 0; i < businesses.length; i += batchSize) {
    const batch = businesses.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("businesses")
      .upsert(batch, { onConflict: "slug", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error(`  Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
    } else {
      total += data?.length || 0;
      console.log(`  Imported batch ${Math.floor(i / batchSize) + 1}: ${data?.length || 0} businesses`);
    }
  }

  console.log(`\nDone! Total imported: ${total}`);
}

async function main() {
  console.log("=== YourZon OSM Import ===\n");

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const elements = await fetchIsraelBusinesses();
  console.log(`\nTotal OSM elements found: ${elements.length}`);

  const businesses = elements
    .map(osmElementToBusiness)
    .filter(Boolean);

  console.log(`Mapped to businesses: ${businesses.length}`);

  // Deduplicate by slug
  const seen = new Set<string>();
  const unique = businesses.filter((b: any) => {
    if (seen.has(b.slug)) return false;
    seen.add(b.slug);
    return true;
  });

  console.log(`Unique businesses: ${unique.length}`);

  await importToSupabase(unique);
}

main().catch(console.error);
