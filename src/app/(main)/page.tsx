import { CATEGORIES, CITIES } from "@/lib/categories";
import { getTopBusinesses, getStats } from "@/lib/db";
import { BusinessCard } from "@/components/BusinessCard";
import { SearchBar } from "@/components/SearchBar";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default async function HomePage() {
  const [businesses, stats] = await Promise.all([getTopBusinesses(12), getStats()]);

  return (
    <div>
      <section className="bg-gradient-to-bl from-brand-700 to-brand-900 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">כל העסקים בישראל, במקום אחד</h1>
          <p className="text-lg text-blue-100 mb-8">
            {stats.businessCount.toLocaleString()} עסקים
          </p>
          <SearchBar />
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold mb-6">קטגוריות</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {CATEGORIES.map((cat) => (
            <a key={cat.slug} href={`${basePath}/category/${cat.slug}`} className="bg-white rounded-xl p-4 text-center shadow-sm hover:shadow-md transition-shadow border">
              <span className="text-3xl block mb-2">{cat.icon}</span>
              <span className="text-sm font-medium">{cat.name}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-4">ערים מובילות</h2>
        <div className="flex flex-wrap gap-2">
          {CITIES.slice(0, 20).map((city) => (
            <a key={city} href={`${basePath}/city/${encodeURIComponent(city)}`} className="bg-white border rounded-full px-4 py-2 text-sm hover:bg-brand-50 hover:border-brand-300 transition-colors">
              {city}
            </a>
          ))}
        </div>
      </section>

      {businesses.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold mb-6">עסקים מובילים</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {businesses.map((biz) => (
              <BusinessCard key={biz.id} business={biz} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
