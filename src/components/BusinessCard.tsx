import type { Business } from "@/lib/types";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-500 text-sm">
      {"★".repeat(Math.round(rating))}
      {"☆".repeat(5 - Math.round(rating))}
      <span className="text-gray-500 mr-1">({rating.toFixed(1)})</span>
    </span>
  );
}

export function BusinessCard({ business }: { business: Business }) {
  const image = business.images?.[0];

  return (
    <a
      href={`${basePath}/business/${business.slug}`}
      className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border overflow-hidden block"
    >
      <div className="h-40 bg-gray-100 relative">
        {image ? (
          <img src={image} alt={business.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">🏢</div>
        )}
        {business.verified && (
          <span className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">מאומת ✓</span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold text-lg mb-1 truncate">{business.name}</h3>
        <p className="text-gray-500 text-sm mb-2">{business.city} · {business.category}</p>
        <StarRating rating={business.rating} />
        <p className="text-gray-400 text-xs mt-1">{business.review_count} ביקורות</p>
        {business.phone && <p className="text-sm text-gray-600 mt-2">📞 {business.phone}</p>}
      </div>
    </a>
  );
}
