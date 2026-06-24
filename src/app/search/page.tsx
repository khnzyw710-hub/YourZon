"use client";

import { useState, useEffect } from "react";
import { SEED_BUSINESSES } from "@/data/businesses";
import { SearchBar } from "@/components/SearchBar";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function slugify(name: string, index: number): string {
  return name.replace(/[^\w֐-׿\s-]/g, "").replace(/\s+/g, "-").substring(0, 60) + "-" + index;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<typeof SEED_BUSINESSES>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") || "";
    setQuery(q);
    if (q) {
      const lower = q.toLowerCase();
      setResults(
        SEED_BUSINESSES.filter(
          (b) =>
            b.name.toLowerCase().includes(lower) ||
            b.city.toLowerCase().includes(lower) ||
            b.category.toLowerCase().includes(lower) ||
            b.subcategory.toLowerCase().includes(lower) ||
            b.tags?.some((t) => t.toLowerCase().includes(lower))
        )
      );
    }
  }, []);

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
          {results.map((biz, i) => {
            const idx = SEED_BUSINESSES.indexOf(biz);
            return (
              <a key={i} href={`${basePath}/business/${slugify(biz.name, idx)}`}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border overflow-hidden block">
                <div className="h-40 bg-gray-100 flex items-center justify-center text-4xl text-gray-300">🏢</div>
                <div className="p-4">
                  <h3 className="font-bold text-lg mb-1 truncate">{biz.name}</h3>
                  <p className="text-gray-500 text-sm mb-2">{biz.city} · {biz.category}</p>
                  {biz.phone && <p className="text-sm text-gray-600 mt-2">📞 {biz.phone}</p>}
                </div>
              </a>
            );
          })}
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
