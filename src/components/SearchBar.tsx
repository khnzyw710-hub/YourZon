"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 max-w-xl mx-auto">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="חפש עסק, קטגוריה או עיר..."
        className="flex-1 rounded-lg px-4 py-3 text-gray-900 text-lg border-0 focus:ring-2 focus:ring-brand-200"
      />
      <button
        type="submit"
        className="bg-brand-500 hover:bg-brand-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
      >
        חפש
      </button>
    </form>
  );
}
