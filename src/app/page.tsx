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

      <section className="max-w-7xl mx-auto px-4 pt-10 pb-4">
        <div className="bg-white rounded-2xl shadow-md border p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-3xl">📁</span>
            <h2 className="text-2xl font-bold text-gray-900">Claude</h2>
            <span className="text-gray-400 text-sm">— לחץ על מודל כדי לפתוח טרמינל</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <a href={`${basePath}/terminal?model=opus-5`} className="bg-gradient-to-b from-purple-600 to-purple-800 text-white rounded-xl p-4 text-center shadow-sm hover:shadow-lg hover:scale-105 transition-all">
              <span className="text-3xl block mb-2">🟣</span>
              <span className="text-sm font-bold block">Opus 5</span>
              <span className="text-purple-200 text-xs">החזק ביותר</span>
            </a>
            <a href={`${basePath}/terminal?model=sonnet-5`} className="bg-gradient-to-b from-blue-600 to-blue-800 text-white rounded-xl p-4 text-center shadow-sm hover:shadow-lg hover:scale-105 transition-all">
              <span className="text-3xl block mb-2">🔵</span>
              <span className="text-sm font-bold block">Sonnet 5</span>
              <span className="text-blue-200 text-xs">מומלץ</span>
            </a>
            <a href={`${basePath}/terminal?model=fable-5`} className="bg-gradient-to-b from-emerald-600 to-emerald-800 text-white rounded-xl p-4 text-center shadow-sm hover:shadow-lg hover:scale-105 transition-all">
              <span className="text-3xl block mb-2">🟢</span>
              <span className="text-sm font-bold block">Fable 5</span>
              <span className="text-emerald-200 text-xs">יצירתי</span>
            </a>
            <a href={`${basePath}/terminal?model=haiku-4`} className="bg-gradient-to-b from-orange-500 to-orange-700 text-white rounded-xl p-4 text-center shadow-sm hover:shadow-lg hover:scale-105 transition-all">
              <span className="text-3xl block mb-2">🟠</span>
              <span className="text-sm font-bold block">Haiku 4.5</span>
              <span className="text-orange-200 text-xs">הכי מהיר</span>
            </a>
            <a href={`${basePath}/terminal?model=opus-4`} className="bg-gradient-to-b from-violet-600 to-violet-800 text-white rounded-xl p-4 text-center shadow-sm hover:shadow-lg hover:scale-105 transition-all">
              <span className="text-3xl block mb-2">🟤</span>
              <span className="text-sm font-bold block">Opus 4.6</span>
              <span className="text-violet-200 text-xs">יציב</span>
            </a>
          </div>
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
