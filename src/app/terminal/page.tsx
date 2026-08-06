"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

interface ModelInfo {
  id: string;
  name: string;
  color: string;
  promptColor: string;
  accentBg: string;
  accentHover: string;
  greeting: string;
  description: string;
}

const MODELS: Record<string, ModelInfo> = {
  "opus-5": {
    id: "claude-opus-5",
    name: "Claude Opus 5",
    color: "purple",
    promptColor: "text-purple-300",
    accentBg: "bg-purple-600",
    accentHover: "hover:bg-purple-500",
    greeting: "שלום! אני Claude Opus 5 — המודל החזק והמתקדם ביותר. איך אוכל לעזור?",
    description: "המודל החזק ביותר — לוגיקה מורכבת, כתיבת קוד, וניתוח מעמיק",
  },
  "sonnet-5": {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    color: "blue",
    promptColor: "text-blue-300",
    accentBg: "bg-blue-600",
    accentHover: "hover:bg-blue-500",
    greeting: "שלום! אני Claude Sonnet 5 — האיזון המושלם בין ביצועים למהירות. איך אוכל לעזור?",
    description: "איזון מושלם — מהיר וחכם, מתאים לרוב המשימות",
  },
  "haiku-4": {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    color: "orange",
    promptColor: "text-orange-300",
    accentBg: "bg-orange-600",
    accentHover: "hover:bg-orange-500",
    greeting: "שלום! אני Claude Haiku 4.5 — מהיר, קל וזמין. איך אוכל לעזור?",
    description: "הכי מהיר — תשובות מיידיות, משימות קלות ומהירות",
  },
  "fable-5": {
    id: "claude-fable-5",
    name: "Claude Fable 5",
    color: "emerald",
    promptColor: "text-emerald-300",
    accentBg: "bg-emerald-600",
    accentHover: "hover:bg-emerald-500",
    greeting: "שלום! אני Claude Fable 5 — מומחה ביצירתיות וסיפורים. איך אוכל לעזור?",
    description: "יצירתי ומדויק — כתיבה, סיפורים, ותוכן יצירתי",
  },
  "opus-4": {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    color: "violet",
    promptColor: "text-violet-300",
    accentBg: "bg-violet-600",
    accentHover: "hover:bg-violet-500",
    greeting: "שלום! אני Claude Opus 4.6 — אמין ומדויק. איך אוכל לעזור?",
    description: "אמין ויציב — ביצועים מוכחים ואיכות גבוהה",
  },
};

const DEFAULT_MODEL = "opus-5";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

function TerminalContent() {
  const searchParams = useSearchParams();
  const modelKey = searchParams.get("model") || DEFAULT_MODEL;
  const model = MODELS[modelKey] || MODELS[DEFAULT_MODEL];

  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: `${model.name} Terminal — Ready.` },
    { role: "assistant", content: model.greeting },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: getResponse(trimmed, model.name) },
      ]);
      setIsTyping(false);
    }, 800 + Math.random() * 1200);
  };

  return (
    <div className="min-h-[calc(100vh-120px)] bg-gray-950 flex flex-col">
      <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-gray-300 text-sm font-mono">{model.name} Terminal</span>
          <span className="text-gray-600 text-xs font-mono">({model.id})</span>
        </div>
        <div className="flex items-center gap-3">
          <a href={`${basePath}/claude`} className="text-gray-400 hover:text-white text-sm transition-colors">
            ← מודלים
          </a>
          <a href={`${basePath}/`} className="text-gray-400 hover:text-white text-sm transition-colors">
            ✕ סגור
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm">
        {messages.map((msg, i) => (
          <div key={i} className={msgClass(msg.role, model)}>
            <span className="select-none opacity-60">{msgPrompt(msg.role)}</span>
            {msg.content}
          </div>
        ))}
        {isTyping && (
          <div className={model.promptColor}>
            <span className="select-none opacity-60">claude › </span>
            <span className="animate-pulse">▊</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-700 bg-gray-900 p-3 flex gap-2">
        <span className="text-green-400 font-mono text-sm py-2 select-none">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="הקלד הודעה..."
          className="flex-1 bg-transparent text-gray-100 font-mono text-sm outline-none placeholder-gray-600"
          dir="auto"
        />
        <button
          type="submit"
          disabled={isTyping}
          className={`${model.accentBg} ${model.accentHover} disabled:opacity-40 text-white px-4 py-1.5 rounded text-sm font-mono transition-colors`}
        >
          שלח
        </button>
      </form>
    </div>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-120px)] bg-gray-950 flex items-center justify-center text-gray-500 font-mono">Loading...</div>}>
      <TerminalContent />
    </Suspense>
  );
}

function msgPrompt(role: Message["role"]): string {
  switch (role) {
    case "user": return "$ ";
    case "assistant": return "claude › ";
    case "system": return "⚡ ";
  }
}

function msgClass(role: Message["role"], model: ModelInfo): string {
  switch (role) {
    case "user": return "text-green-400";
    case "assistant": return model.promptColor;
    case "system": return "text-yellow-400 opacity-80";
  }
}

function getResponse(input: string, modelName: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("שלום") || lower.includes("היי") || lower.includes("hello") || lower.includes("hi"))
    return "שלום! מה אוכל לעשות בשבילך?";
  if (lower.includes("מה השעה") || lower.includes("time"))
    return `השעה כרגע: ${new Date().toLocaleTimeString("he-IL")}`;
  if (lower.includes("מי אתה") || lower.includes("who are you"))
    return `אני ${modelName}, מודל שפה מתקדם של Anthropic. אני כאן כדי לעזור!`;
  if (lower.includes("עזרה") || lower.includes("help"))
    return "אתה יכול לשאול אותי כל שאלה, לבקש עזרה בקוד, לתרגם טקסטים, או סתם לשוחח. נסה!";
  if (lower.includes("תודה") || lower.includes("thanks"))
    return "בשמחה!";
  if (lower.includes("bye") || lower.includes("להתראות"))
    return "להתראות! תמיד כאן אם תצטרך עזרה.";

  const responses = [
    "שאלה מעניינת! תן לי לחשוב על זה... אני חושב שהתשובה תלויה בהקשר. ספר לי עוד.",
    "אני מבין את השאלה שלך. בוא ננסה לפרק את זה לחלקים קטנים יותר.",
    "נקודה טובה. יש לזה כמה היבטים שכדאי לשקול.",
    "מעניין! אשמח לעזור לך עם זה. האם אתה יכול לפרט קצת יותר?",
    "אני כאן כדי לעזור. אגיד לך מה אני חושב על זה...",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}
