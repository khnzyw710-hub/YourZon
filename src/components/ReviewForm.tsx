"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function ReviewForm({ businessId }: { businessId: string }) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    await supabase.from("reviews").insert({
      business_id: businessId,
      user_name: name.trim(),
      rating,
      text: text.trim() || null,
    });

    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm">
        הביקורת נשלחה בהצלחה! תודה רבה.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
      <h3 className="font-medium">כתוב ביקורת</h3>
      <input
        type="text"
        placeholder="השם שלך"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            onClick={() => setRating(n)}
            className={`text-2xl ${n <= rating ? "text-yellow-500" : "text-gray-300"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        placeholder="כתוב את הביקורת שלך (אופציונלי)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm h-20 resize-none"
      />
      <button
        type="submit"
        disabled={loading}
        className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? "שולח..." : "שלח ביקורת"}
      </button>
    </form>
  );
}
