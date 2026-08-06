"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createChannel, sendDisplayMessage } from "@/lib/broadcast";
import { SEED_BUSINESSES } from "@/data/businesses";
import { CATEGORIES } from "@/lib/categories";
import type { DisplayMessage } from "@/lib/broadcast";

interface DisplayState {
  mode: "idle" | "business" | "category" | "city" | "search";
  data: any;
}

export default function DisplayPage() {
  const [state, setState] = useState<DisplayState>({ mode: "idle", data: null });
  const [connected, setConnected] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [time, setTime] = useState("");
  const slideTimer = useRef<ReturnType<typeof setInterval>>();

  const featuredBusinesses = SEED_BUSINESSES.filter((b) => b.description).slice(0, 8);

  useEffect(() => {
    function updateTime() {
      setTime(
        new Date().toLocaleTimeString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
    updateTime();
    const t = setInterval(updateTime, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (state.mode !== "idle") return;
    slideTimer.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % featuredBusinesses.length);
    }, 6000);
    return () => clearInterval(slideTimer.current);
  }, [state.mode, featuredBusinesses.length]);

  const handleMessage = useCallback((msg: DisplayMessage) => {
    switch (msg.type) {
      case "business-view":
        setState({ mode: "business", data: msg.payload });
        break;
      case "category-view":
        setState({ mode: "category", data: msg.payload });
        break;
      case "city-view":
        setState({ mode: "city", data: msg.payload });
        break;
      case "search":
        setState({ mode: "search", data: msg.payload });
        break;
      case "home":
        setState({ mode: "idle", data: null });
        break;
      case "ping":
        sendDisplayMessage("pong");
        break;
    }
  }, []);

  useEffect(() => {
    // Presentation API receiver
    if ("presentation" in navigator && "receiver" in (navigator as any).presentation) {
      const receiver = (navigator as any).presentation.receiver;
      receiver.connectionList.then((list: any) => {
        list.connections.forEach((conn: PresentationConnection) => {
          setConnected(true);
          conn.onmessage = (e: MessageEvent) => {
            try {
              handleMessage(JSON.parse(e.data));
            } catch {}
          };
        });
        list.onconnectionavailable = (event: any) => {
          setConnected(true);
          event.connection.onmessage = (e: MessageEvent) => {
            try {
              handleMessage(JSON.parse(e.data));
            } catch {}
          };
        };
      });
    }

    // BroadcastChannel fallback
    const channel = createChannel();
    if (!channel) return;

    channel.onmessage = (e: MessageEvent<DisplayMessage>) => {
      handleMessage(e.data);
      if (e.data.type !== "ping" && e.data.type !== "pong") {
        setConnected(true);
      }
    };

    sendDisplayMessage("pong");
    setConnected(true);

    return () => channel.close();
  }, [handleMessage]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white overflow-hidden" dir="rtl">
      <div className="fixed top-4 left-4 right-4 flex justify-between items-center z-50">
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full px-4 py-2">
          <span className="text-xl font-bold bg-gradient-to-l from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            YourZon
          </span>
          <span className="text-white/50 text-sm">|</span>
          <span className="text-white/60 text-sm">מסך משני</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/50 text-lg font-light">{time}</span>
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md rounded-full px-3 py-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-green-400 animate-pulse" : "bg-red-400"
              }`}
            />
            <span className="text-xs text-white/60">
              {connected ? "מחובר" : "ממתין לחיבור"}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-20 px-8 pb-8 h-screen flex flex-col">
        {state.mode === "idle" && (
          <IdleView
            businesses={featuredBusinesses}
            currentSlide={currentSlide}
          />
        )}
        {state.mode === "business" && <BusinessView data={state.data} />}
        {state.mode === "category" && <CategoryView data={state.data} />}
        {state.mode === "city" && <CityView data={state.data} />}
        {state.mode === "search" && <SearchView data={state.data} />}
      </div>
    </div>
  );
}

function IdleView({
  businesses,
  currentSlide,
}: {
  businesses: typeof SEED_BUSINESSES;
  currentSlide: number;
}) {
  const biz = businesses[currentSlide];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 display-fade-in">
      <div className="text-center mb-4">
        <h1 className="text-5xl font-bold mb-3 bg-gradient-to-l from-blue-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
          YourZon
        </h1>
        <p className="text-xl text-white/50">כל העסקים בישראל, במקום אחד</p>
      </div>

      <div className="w-full max-w-2xl">
        <div className="bg-white/5 backdrop-blur-lg rounded-3xl border border-white/10 p-8 display-fade-in" key={currentSlide}>
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/30 to-cyan-500/30 flex items-center justify-center text-4xl shrink-0">
              {CATEGORIES.find((c) => c.name === biz?.category)?.icon || "🏢"}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold mb-1">{biz?.name}</h2>
              <p className="text-white/50 text-sm mb-3">
                {biz?.city} · {biz?.category}
              </p>
              {biz?.description && (
                <p className="text-white/70 text-base leading-relaxed">
                  {biz.description}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                {biz?.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="bg-white/10 text-white/60 text-xs px-3 py-1 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-2 mt-6">
          {businesses.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === currentSlide
                  ? "w-8 bg-blue-400"
                  : "w-1.5 bg-white/20"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mt-4 w-full max-w-3xl">
        {CATEGORIES.slice(0, 10).map((cat) => (
          <div
            key={cat.slug}
            className="bg-white/5 backdrop-blur rounded-2xl p-3 text-center border border-white/5 hover:border-white/20 transition-colors"
          >
            <span className="text-2xl block mb-1">{cat.icon}</span>
            <span className="text-xs text-white/50">{cat.name}</span>
          </div>
        ))}
      </div>

      <p className="text-white/30 text-sm mt-auto">
        חפשו עסקים במסך הראשי כדי לראות פרטים כאן
      </p>
    </div>
  );
}

function BusinessView({ data }: { data: any }) {
  return (
    <div className="flex-1 flex flex-col display-fade-in">
      <div className="flex-1 flex gap-8 items-center max-w-5xl mx-auto w-full">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            {data.verified && (
              <span className="bg-green-500/20 text-green-400 text-xs px-3 py-1 rounded-full border border-green-500/30">
                עסק מאומת
              </span>
            )}
          </div>
          <h1 className="text-5xl font-bold mb-3">{data.name}</h1>
          <p className="text-xl text-white/50 mb-6">{data.subtitle}</p>

          {data.desc && (
            <p className="text-lg text-white/70 leading-relaxed mb-8 max-w-xl">
              {data.desc}
            </p>
          )}

          <div className="space-y-4">
            {data.phone && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-lg">
                  📞
                </div>
                <span className="text-lg">{data.phone}</span>
              </div>
            )}
            {data.address && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-lg">
                  📍
                </div>
                <span className="text-lg">{data.address}</span>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {data.img ? (
            <div className="w-80 h-80 rounded-3xl overflow-hidden border border-white/10">
              <img
                src={data.img}
                alt={data.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-80 h-80 rounded-3xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center">
              <span className="text-8xl opacity-30">🏢</span>
            </div>
          )}
        </div>
      </div>

      {data.rating && (
        <div className="flex justify-center mt-auto">
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 px-8 py-4 flex items-center gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-yellow-400">{data.rating}</div>
              <div className="text-yellow-400/60 text-sm mt-1">דירוג</div>
            </div>
            <div className="w-px h-12 bg-white/10" />
            <div className="text-yellow-400 text-2xl tracking-wider">
              {"★".repeat(Math.round(parseFloat(data.rating) || 0))}
              {"☆".repeat(5 - Math.round(parseFloat(data.rating) || 0))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryView({ data }: { data: any }) {
  const cat = CATEGORIES.find((c) => c.slug === data.slug);
  const businesses = SEED_BUSINESSES.filter((b) => b.category === cat?.name).slice(0, 9);

  return (
    <div className="flex-1 flex flex-col display-fade-in">
      <div className="text-center mb-8">
        <span className="text-6xl block mb-4">{cat?.icon || "📁"}</span>
        <h1 className="text-4xl font-bold mb-2">{data.title || cat?.name}</h1>
        <p className="text-white/50 text-lg">{data.count}</p>
      </div>

      {cat?.subcategories && (
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {cat.subcategories.slice(0, 8).map((sub) => (
            <span
              key={sub.slug}
              className="bg-white/10 backdrop-blur text-white/70 text-sm px-4 py-2 rounded-full border border-white/10"
            >
              {sub.name}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 flex-1 max-w-4xl mx-auto w-full">
        {businesses.map((biz, i) => (
          <div
            key={i}
            className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-4 flex flex-col"
          >
            <h3 className="font-bold text-lg mb-1">{biz.name}</h3>
            <p className="text-white/40 text-sm mb-2">{biz.city}</p>
            {biz.description && (
              <p className="text-white/50 text-xs line-clamp-2">{biz.description}</p>
            )}
            <div className="flex flex-wrap gap-1 mt-auto pt-2">
              {biz.tags?.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="bg-white/10 text-white/40 text-xs px-2 py-0.5 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CityView({ data }: { data: any }) {
  const cityName = data.city || data.title?.replace("עסקים ב", "") || "";
  const businesses = SEED_BUSINESSES.filter((b) => b.city === cityName).slice(0, 6);

  const categoryCounts: Record<string, number> = {};
  SEED_BUSINESSES.filter((b) => b.city === cityName).forEach((b) => {
    categoryCounts[b.category] = (categoryCounts[b.category] || 0) + 1;
  });
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="flex-1 flex flex-col display-fade-in">
      <div className="text-center mb-8">
        <span className="text-6xl block mb-4">🏙️</span>
        <h1 className="text-4xl font-bold mb-2">{data.title || `עסקים ב${cityName}`}</h1>
        <p className="text-white/50 text-lg">{data.count}</p>
      </div>

      {topCategories.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {topCategories.map(([cat, count]) => {
            const catObj = CATEGORIES.find((c) => c.name === cat);
            return (
              <div
                key={cat}
                className="bg-white/10 backdrop-blur rounded-xl border border-white/10 px-4 py-3 flex items-center gap-2"
              >
                <span className="text-xl">{catObj?.icon || "📁"}</span>
                <span className="text-sm">{cat}</span>
                <span className="text-white/30 text-xs">({count})</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 flex-1 max-w-4xl mx-auto w-full">
        {businesses.map((biz, i) => {
          const catObj = CATEGORIES.find((c) => c.name === biz.category);
          return (
            <div
              key={i}
              className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-4 flex flex-col"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{catObj?.icon || "🏢"}</span>
                <h3 className="font-bold">{biz.name}</h3>
              </div>
              <p className="text-white/40 text-xs mb-1">{biz.category}</p>
              {biz.description && (
                <p className="text-white/50 text-xs line-clamp-2 mt-1">{biz.description}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchView({ data }: { data: any }) {
  const query = data.query || "";
  const lower = query.toLowerCase();
  const results = SEED_BUSINESSES.filter(
    (b) =>
      b.name.toLowerCase().includes(lower) ||
      b.city.toLowerCase().includes(lower) ||
      b.category.toLowerCase().includes(lower) ||
      b.subcategory.toLowerCase().includes(lower) ||
      b.tags?.some((t: string) => t.toLowerCase().includes(lower))
  ).slice(0, 9);

  return (
    <div className="flex-1 flex flex-col display-fade-in">
      <div className="text-center mb-8">
        <span className="text-6xl block mb-4">🔍</span>
        <h1 className="text-3xl font-bold mb-2">
          תוצאות חיפוש: &ldquo;{query}&rdquo;
        </h1>
        <p className="text-white/50 text-lg">{results.length} תוצאות</p>
      </div>

      {results.length > 0 ? (
        <div className="grid grid-cols-3 gap-4 flex-1 max-w-4xl mx-auto w-full">
          {results.map((biz, i) => {
            const catObj = CATEGORIES.find((c) => c.name === biz.category);
            return (
              <div
                key={i}
                className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-4 flex flex-col"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{catObj?.icon || "🏢"}</span>
                  <h3 className="font-bold truncate">{biz.name}</h3>
                </div>
                <p className="text-white/40 text-sm mb-1">
                  {biz.city} · {biz.category}
                </p>
                {biz.description && (
                  <p className="text-white/50 text-xs line-clamp-2 mt-1">
                    {biz.description}
                  </p>
                )}
                {biz.phone && (
                  <p className="text-white/30 text-xs mt-auto pt-2">📞 {biz.phone}</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/30 text-xl">לא נמצאו תוצאות</p>
        </div>
      )}
    </div>
  );
}
