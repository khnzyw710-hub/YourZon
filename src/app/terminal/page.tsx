"use client";

import { useState, useRef, useEffect } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export default function TerminalPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "Claude Opus 5 Terminal — Ready." },
    { role: "assistant", content: "שלום! אני Claude Opus 5. איך אוכל לעזור לך היום?" },
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
        {
          role: "assistant",
          content: getResponse(trimmed),
        },
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
          <span className="text-gray-300 text-sm font-mono">Claude Opus 5 Terminal</span>
        </div>
        <a href={`${basePath}/`} className="text-gray-400 hover:text-white text-sm transition-colors">
          ✕ סגור
        </a>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm">
        {messages.map((msg, i) => (
          <div key={i} className={messageClass(msg.role)}>
            <span className="select-none opacity-60">{prompt(msg.role)}</span>
            {msg.content}
          </div>
        ))}
        {isTyping && (
          <div className="text-purple-400">
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
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white px-4 py-1.5 rounded text-sm font-mono transition-colors"
        >
          שלח
        </button>
      </form>
    </div>
  );
}

function prompt(role: Message["role"]): string {
  switch (role) {
    case "user": return "$ ";
    case "assistant": return "claude › ";
    case "system": return "⚡ ";
  }
}

function messageClass(role: Message["role"]): string {
  switch (role) {
    case "user": return "text-green-400";
    case "assistant": return "text-purple-300";
    case "system": return "text-yellow-400 opacity-80";
  }
}

function getResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("שלום") || lower.includes("היי") || lower.includes("hello") || lower.includes("hi"))
    return "שלום! מה אוכל לעשות בשבילך?";
  if (lower.includes("מה השעה") || lower.includes("time"))
    return `השעה כרגע: ${new Date().toLocaleTimeString("he-IL")}`;
  if (lower.includes("מי אתה") || lower.includes("who are you"))
    return "אני Claude Opus 5, מודל שפה מתקדם של Anthropic. אני כאן כדי לעזור!";
  if (lower.includes("עזרה") || lower.includes("help"))
    return "אתה יכול לשאול אותי כל שאלה, לבקש עזרה בקוד, לתרגם טקסטים, או סתם לשוחח. נסה!";
  if (lower.includes("תודה") || lower.includes("thanks"))
    return "בשמחה! 😊";
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
