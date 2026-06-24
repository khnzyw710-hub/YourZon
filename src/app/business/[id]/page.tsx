import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import type { Business, Review } from "@/lib/types";
import { ReviewForm } from "@/components/ReviewForm";

async function getBusiness(slug: string) {
  const { data } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .single();
  return data as Business | null;
}

async function getReviews(businessId: string) {
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data || []) as Review[];
}

export default async function BusinessPage({ params }: { params: { id: string } }) {
  const business = await getBusiness(params.id);
  if (!business) notFound();

  const reviews = await getReviews(business.id);

  const socialLinks = business.social_links || {};
  const hours = business.opening_hours || {};

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {business.images?.[0] && (
          <div className="h-64 bg-gray-100">
            <img src={business.images[0]} alt={business.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold">{business.name}</h1>
              <p className="text-gray-500 mt-1">
                {business.category} {business.subcategory && `· ${business.subcategory}`} · {business.city}
              </p>
            </div>
            <div className="text-left">
              <div className="text-3xl font-bold text-brand-600">{business.rating.toFixed(1)}</div>
              <div className="text-yellow-500">{"★".repeat(Math.round(business.rating))}</div>
              <div className="text-sm text-gray-400">{business.review_count} ביקורות</div>
            </div>
          </div>

          {business.verified && (
            <span className="inline-block mt-3 bg-green-100 text-green-700 text-sm px-3 py-1 rounded-full">
              ✓ עסק מאומת
            </span>
          )}

          {business.description && (
            <p className="mt-4 text-gray-700 leading-relaxed">{business.description}</p>
          )}
        </div>
      </div>

      {/* Contact & Info */}
      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-lg mb-4">פרטי התקשרות</h2>
          <div className="space-y-3 text-sm">
            {business.phone && (
              <div className="flex gap-2">
                <span>📞</span>
                <a href={`tel:${business.phone}`} className="text-brand-600 hover:underline">{business.phone}</a>
              </div>
            )}
            {business.address && (
              <div className="flex gap-2">
                <span>📍</span>
                <span>{business.address}, {business.city}</span>
              </div>
            )}
            {business.website && (
              <div className="flex gap-2">
                <span>🌐</span>
                <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline truncate">
                  {business.website.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
            {business.email && (
              <div className="flex gap-2">
                <span>✉️</span>
                <a href={`mailto:${business.email}`} className="text-brand-600 hover:underline">{business.email}</a>
              </div>
            )}
          </div>

          {/* Social Links */}
          {Object.keys(socialLinks).length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="font-medium mb-2">רשתות חברתיות</h3>
              <div className="flex gap-3">
                {socialLinks.instagram && (
                  <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline text-sm">Instagram</a>
                )}
                {socialLinks.facebook && (
                  <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">Facebook</a>
                )}
                {socialLinks.whatsapp && (
                  <a href={`https://wa.me/${socialLinks.whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline text-sm">WhatsApp</a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Opening Hours */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-lg mb-4">שעות פעילות</h2>
          {Object.keys(hours).length > 0 ? (
            <div className="space-y-2 text-sm">
              {Object.entries(hours).map(([day, time]) => (
                <div key={day} className="flex justify-between">
                  <span className="font-medium">{day}</span>
                  <span className="text-gray-600">{time as string}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">לא צוינו שעות פעילות</p>
          )}
        </div>
      </div>

      {/* Tags */}
      {business.tags?.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {business.tags.map((tag) => (
            <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Reviews */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">ביקורות ({reviews.length})</h2>
        <ReviewForm businessId={business.id} />
        <div className="space-y-4 mt-6">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-xl shadow-sm border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{review.user_name}</span>
                <span className="text-yellow-500 text-sm">{"★".repeat(review.rating)}</span>
              </div>
              {review.text && <p className="text-gray-700 text-sm">{review.text}</p>}
              <p className="text-gray-400 text-xs mt-2">
                {new Date(review.created_at).toLocaleDateString("he-IL")}
              </p>
            </div>
          ))}
          {reviews.length === 0 && (
            <p className="text-gray-400 text-center py-8">אין ביקורות עדיין. היו הראשונים!</p>
          )}
        </div>
      </div>
    </div>
  );
}
