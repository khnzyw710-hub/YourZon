import { supabase } from "@/lib/supabase";
import { CATEGORIES } from "@/lib/categories";
import { BusinessCard } from "@/components/BusinessCard";
import { notFound } from "next/navigation";

async function getBusinessesByCategory(category: string, subcategory?: string) {
  let query = supabase
    .from("businesses")
    .select("*")
    .eq("category", category)
    .order("rating", { ascending: false })
    .limit(50);

  if (subcategory) {
    query = query.eq("subcategory", subcategory);
  }

  const { data } = await query;
  return data || [];
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { sub?: string };
}) {
  const category = CATEGORIES.find((c) => c.slug === params.slug);
  if (!category) notFound();

  const businesses = await getBusinessesByCategory(category.name, searchParams.sub);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          {category.icon} {category.name}
        </h1>
        <p className="text-gray-500 mt-1">{businesses.length} עסקים נמצאו</p>
      </div>

      {/* Subcategories */}
      <div className="flex flex-wrap gap-2 mb-8">
        <a
          href={`/category/${category.slug}`}
          className={`px-4 py-2 rounded-full text-sm border transition-colors ${
            !searchParams.sub ? "bg-brand-600 text-white border-brand-600" : "bg-white hover:bg-gray-50"
          }`}
        >
          הכל
        </a>
        {category.subcategories.map((sub) => (
          <a
            key={sub.slug}
            href={`/category/${category.slug}?sub=${encodeURIComponent(sub.name)}`}
            className={`px-4 py-2 rounded-full text-sm border transition-colors ${
              searchParams.sub === sub.name ? "bg-brand-600 text-white border-brand-600" : "bg-white hover:bg-gray-50"
            }`}
          >
            {sub.name}
          </a>
        ))}
      </div>

      {/* Business Grid */}
      {businesses.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {businesses.map((biz) => (
            <BusinessCard key={biz.id} business={biz} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">🔍</p>
          <p>אין עסקים בקטגוריה זו עדיין</p>
        </div>
      )}
    </div>
  );
}
