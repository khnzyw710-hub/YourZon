const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const models = [
  {
    key: "opus-5",
    name: "Claude Opus 5",
    id: "claude-opus-5",
    icon: "🟣",
    description: "המודל החזק ביותר — לוגיקה מורכבת, כתיבת קוד, וניתוח מעמיק",
    gradient: "from-purple-600 to-purple-800",
    badge: "החזק ביותר",
    badgeColor: "bg-purple-500",
  },
  {
    key: "sonnet-5",
    name: "Claude Sonnet 5",
    id: "claude-sonnet-5",
    icon: "🔵",
    description: "איזון מושלם — מהיר וחכם, מתאים לרוב המשימות",
    gradient: "from-blue-600 to-blue-800",
    badge: "מומלץ",
    badgeColor: "bg-blue-500",
  },
  {
    key: "fable-5",
    name: "Claude Fable 5",
    id: "claude-fable-5",
    icon: "🟢",
    description: "יצירתי ומדויק — כתיבה, סיפורים, ותוכן יצירתי",
    gradient: "from-emerald-600 to-emerald-800",
    badge: "יצירתי",
    badgeColor: "bg-emerald-500",
  },
  {
    key: "haiku-4",
    name: "Claude Haiku 4.5",
    id: "claude-haiku-4-5",
    icon: "🟠",
    description: "הכי מהיר — תשובות מיידיות, משימות קלות ומהירות",
    gradient: "from-orange-600 to-orange-800",
    badge: "הכי מהיר",
    badgeColor: "bg-orange-500",
  },
  {
    key: "opus-4",
    name: "Claude Opus 4.6",
    id: "claude-opus-4-6",
    icon: "🟤",
    description: "אמין ויציב — ביצועים מוכחים ואיכות גבוהה",
    gradient: "from-violet-600 to-violet-800",
    badge: "יציב",
    badgeColor: "bg-violet-500",
  },
];

export default function ClaudeFolderPage() {
  return (
    <div className="min-h-[calc(100vh-120px)] bg-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-4xl">📁</span>
          <h1 className="text-3xl font-bold text-gray-900">Claude</h1>
        </div>
        <p className="text-gray-500 mb-8 text-sm">לחץ על מודל כדי לפתוח אותו ישירות בטרמינל</p>

        <div className="grid gap-3">
          {models.map((m) => (
            <a
              key={m.key}
              href={`${basePath}/terminal?model=${m.key}`}
              className={`group flex items-center gap-4 bg-gradient-to-l ${m.gradient} text-white rounded-xl p-5 shadow-md hover:shadow-xl hover:scale-[1.02] transition-all`}
            >
              <span className="text-4xl">{m.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-lg">{m.name}</span>
                  <span className={`${m.badgeColor} text-white text-xs px-2 py-0.5 rounded-full font-medium`}>{m.badge}</span>
                </div>
                <div className="text-white/70 text-sm">{m.description}</div>
                <div className="text-white/40 text-xs font-mono mt-1">{m.id}</div>
              </div>
              <span className="text-white/40 group-hover:text-white text-2xl transition-colors">←</span>
            </a>
          ))}
        </div>

        <div className="mt-8 text-center">
          <a href={`${basePath}/`} className="text-gray-400 hover:text-gray-600 text-sm transition-colors">
            ← חזרה לדף הבית
          </a>
        </div>
      </div>
    </div>
  );
}
