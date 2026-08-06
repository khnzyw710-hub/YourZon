import { getBusinessesByCity } from "@/lib/db";
import { BusinessCard } from "@/components/BusinessCard";
import { CITIES } from "@/lib/categories";

export async function generateStaticParams() {
  return CITIES.map((city) => ({ city: encodeURIComponent(city) }));
}

export default async function CityPage({ params }: { params: { city: string } }) {
  const city = decodeURIComponent(params.city);
  const businesses = await getBusinessesByCity(city);

  const categoryCounts: Record<string, number> = {};
  businesses.forEach((b) => {
    categoryCounts[b.category] = (categoryCounts[b.category] || 0) + 1;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">עסקים ב{city}</h1>
      <p className="text-gray-500 mb-8">{businesses.length} עסקים נמצאו</p>

      {Object.keys(categoryCounts).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
            <span key={cat} className="bg-white border rounded-full px-3 py-1 text-sm">{cat} ({count})</span>
          ))}
        </div>
      )}

      {businesses.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {businesses.map((biz) => (
            <BusinessCard key={biz.id} business={biz} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">🏙️</p>
          <p>אין עסקים ב{city} עדיין</p>
        </div>
      )}
    </div>
  );
}
