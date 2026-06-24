import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

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
  veterinary: { category: "בריאות ורפואה", subcategory: "וטרינרים" },
  hairdresser: { category: "יופי וטיפוח", subcategory: "מספרות" },
  beauty: { category: "יופי וטיפוח", subcategory: "מכוני יופי" },
  car_repair: { category: "רכב", subcategory: "מוסכים" },
  car: { category: "רכב", subcategory: "סוכנויות רכב" },
  car_wash: { category: "רכב", subcategory: "שטיפת רכב" },
  fuel: { category: "רכב", subcategory: "תדלוק" },
  tyres: { category: "רכב", subcategory: "פנצ׳ריות" },
  supermarket: { category: "קניות", subcategory: "סופרמרקטים" },
  convenience: { category: "קניות", subcategory: "חנויות נוחות" },
  clothes: { category: "קניות", subcategory: "אופנה וביגוד" },
  shoes: { category: "קניות", subcategory: "אופנה וביגוד" },
  electronics: { category: "קניות", subcategory: "אלקטרוניקה" },
  books: { category: "קניות", subcategory: "ספרים" },
  jewelry: { category: "קניות", subcategory: "תכשיטים" },
  florist: { category: "קניות", subcategory: "פרחים" },
  pet: { category: "קניות", subcategory: "חיות מחמד" },
  toys: { category: "קניות", subcategory: "צעצועים" },
  furniture: { category: "בית וגינה", subcategory: "רהיטים" },
  hardware: { category: "בית וגינה", subcategory: "שיפוצים" },
  doityourself: { category: "בית וגינה", subcategory: "שיפוצים" },
  garden_centre: { category: "בית וגינה", subcategory: "גינון" },
  school: { category: "חינוך ולימודים", subcategory: "בתי ספר" },
  kindergarten: { category: "חינוך ולימודים", subcategory: "גני ילדים" },
  university: { category: "חינוך ולימודים", subcategory: "אוניברסיטאות" },
  college: { category: "חינוך ולימודים", subcategory: "קורסים" },
  library: { category: "חינוך ולימודים", subcategory: "ספריות" },
  fitness_centre: { category: "ספורט וכושר", subcategory: "חדרי כושר" },
  gym: { category: "ספורט וכושר", subcategory: "חדרי כושר" },
  sports: { category: "ספורט וכושר", subcategory: "חנויות ספורט" },
  swimming_pool: { category: "פנאי ובידור", subcategory: "בריכות שחיה" },
  cinema: { category: "פנאי ובידור", subcategory: "קולנוע" },
  theatre: { category: "פנאי ובידור", subcategory: "תיאטרון" },
  nightclub: { category: "פנאי ובידור", subcategory: "מועדוני לילה" },
  hotel: { category: "תיירות ונסיעות", subcategory: "מלונות" },
  guest_house: { category: "תיירות ונסיעות", subcategory: "צימרים" },
  hostel: { category: "תיירות ונסיעות", subcategory: "מלונות" },
  travel_agency: { category: "תיירות ונסיעות", subcategory: "סוכנויות נסיעות" },
  bank: { category: "ממשל ושירותים ציבוריים", subcategory: "בנקים" },
  atm: { category: "ממשל ושירותים ציבוריים", subcategory: "בנקים" },
  post_office: { category: "ממשל ושירותים ציבוריים", subcategory: "דואר" },
  place_of_worship: { category: "דת ורוחניות" },
  mobile_phone: { category: "טכנולוגיה ומחשבים", subcategory: "תיקון סלולר" },
  computer: { category: "טכנולוגיה ומחשבים", subcategory: "תיקון מחשבים" },
  optician: { category: "בריאות ורפואה", subcategory: "רופאי עיניים" },
  laundry: { category: "בית וגינה", subcategory: "ניקיון" },
  dry_cleaning: { category: "בית וגינה", subcategory: "ניקיון" },
  butcher: { category: "מסעדות ואוכל", subcategory: "בשרי" },
  greengrocer: { category: "קניות", subcategory: "ירקות ופירות" },
  deli: { category: "מסעדות ואוכל", subcategory: "מעדנייה" },
  cosmetics: { category: "יופי וטיפוח", subcategory: "קוסמטיקה" },
  tattoo: { category: "יופי וטיפוח", subcategory: "קעקועים" },
  massage: { category: "יופי וטיפוח", subcategory: "ספא ועיסוי" },
  taxi: { category: "תחבורה", subcategory: "מוניות" },
};

function makeSlug(name: string, osmId: number): string {
  const base = name
    .replace(/[^\w֐-׿\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 60);
  return `${base}-osm${osmId}`;
}

function getCategory(tags: Record<string, string>) {
  for (const key of ["amenity", "shop", "tourism", "leisure"]) {
    if (tags[key] && OSM_CATEGORY_MAP[tags[key]]) return OSM_CATEGORY_MAP[tags[key]];
  }
  if (tags.shop) return { category: "קניות" };
  if (tags.amenity) return { category: "שירותים מקצועיים" };
  return null;
}

function osmToBusiness(el: any) {
  const tags = el.tags || {};
  const name = tags.name || tags["name:he"];
  if (!name) return null;

  const cat = getCategory(tags);
  if (!cat) return null;

  const lat = el.lat || el.center?.lat;
  const lng = el.lon || el.center?.lon;

  const socialLinks: Record<string, string> = {};
  if (tags["contact:instagram"] || tags.instagram)
    socialLinks.instagram = tags["contact:instagram"] || tags.instagram;
  if (tags["contact:facebook"] || tags.facebook)
    socialLinks.facebook = tags["contact:facebook"] || tags.facebook;
  if (tags["contact:whatsapp"])
    socialLinks.whatsapp = tags["contact:whatsapp"];

  const openingHours: Record<string, string> = {};
  if (tags.opening_hours) openingHours.raw = tags.opening_hours;

  const tagsList: string[] = [];
  if (tags.cuisine) tagsList.push(...tags.cuisine.split(";").map((s: string) => s.trim()));
  if (tags.kosher) tagsList.push("כשר");
  if (tags.wheelchair === "yes") tagsList.push("נגיש לכסאות גלגלים");
  if (tags.delivery === "yes") tagsList.push("משלוחים");
  if (tags.takeaway === "yes") tagsList.push("טייקאווי");

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
    address: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ") || null,
    city: tags["addr:city"] || tags["addr:suburb"] || tags["is_in:city"] || null,
    area: tags["addr:state"] || null,
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
    tags: tagsList,
  };
}

async function queryOverpass(query: string): Promise<any[]> {
  const res = await fetch(OVERPASS_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Overpass API ${res.status}: ${text.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.elements || [];
}

export async function POST() {
  const startTime = Date.now();

  try {
    const supabase = getServiceClient();

    // Israel bounding box
    const bbox = "29.45,34.25,33.35,35.90";

    const queries = [
      `[out:json][timeout:300];(node["amenity"]["name"](${bbox});way["amenity"]["name"](${bbox}););out center body;`,
      `[out:json][timeout:300];(node["shop"]["name"](${bbox});way["shop"]["name"](${bbox}););out center body;`,
      `[out:json][timeout:300];(node["tourism"]["name"](${bbox});way["tourism"]["name"](${bbox}););out center body;`,
      `[out:json][timeout:300];(node["leisure"]["name"](${bbox});way["leisure"]["name"](${bbox}););out center body;`,
    ];

    const allElements: any[] = [];

    for (let i = 0; i < queries.length; i++) {
      try {
        const elements = await queryOverpass(queries[i]);
        allElements.push(...elements);
      } catch (err: any) {
        console.error(`Query ${i + 1} failed:`, err.message);
      }
      // Rate limit between queries
      if (i < queries.length - 1) {
        await new Promise((r) => setTimeout(r, 12000));
      }
    }

    // Convert to businesses
    const businesses = allElements
      .map(osmToBusiness)
      .filter((b): b is NonNullable<typeof b> => b !== null);

    // Deduplicate
    const seen = new Set<string>();
    const unique = businesses.filter((b: any) => {
      if (seen.has(b.slug)) return false;
      seen.add(b.slug);
      return true;
    });

    // Insert in batches
    let imported = 0;
    let errors = 0;
    const batchSize = 500;

    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from("businesses")
        .upsert(batch, { onConflict: "slug", ignoreDuplicates: true })
        .select("id");

      if (error) {
        console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
        errors += batch.length;
      } else {
        imported += data?.length || 0;
      }
    }

    const duration = `${Math.round((Date.now() - startTime) / 1000)}s`;

    return NextResponse.json({
      total: unique.length,
      imported,
      errors,
      duration,
      raw_elements: allElements.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
