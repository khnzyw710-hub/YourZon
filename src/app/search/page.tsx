import { searchBusinesses } from "@/lib/db";
import { BusinessCard } from "@/components/BusinessCard";
import { SearchBar } from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = searchParams.q || "";
  const results = query ? await searchBusinesses(query) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="max-w-xl mb-8">
        <SearchBar />
      </div>

      {query && (
        <h1 className="text-2xl font-bold mb-6">
          תוצאות חיפוש: &quot;{query}&quot;
          <span className="text-gray-400 text-lg font-normal mr-2">({results.length} תוצאות)</span>
        </h1>
      )}

      {results.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {results.map((biz) => (
            <BusinessCard key={biz.id} business={biz} />
          ))}
        </div>
      ) : query ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">🔍</p>
          <p>לא נמצאו תוצאות עבור &quot;{query}&quot;</p>
        </div>
      ) : null}
    </div>
  );
}
