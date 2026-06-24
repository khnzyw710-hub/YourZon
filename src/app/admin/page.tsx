"use client";

import { useState } from "react";

type ImportStatus = "idle" | "running" | "done" | "error";

interface ImportResult {
  source: string;
  total: number;
  imported: number;
  errors: number;
  duration: string;
}

export default function AdminPage() {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState("");

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString("he-IL")}] ${msg}`]);
  }

  async function runOSMImport() {
    setStatus("running");
    setProgress("מייבא עסקים מ-OpenStreetMap...");
    addLog("מתחיל ייבוא מ-OpenStreetMap");

    try {
      const res = await fetch("/api/import/osm", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      addLog(`OSM: יובאו ${data.imported} עסקים מתוך ${data.total} (${data.duration})`);
      setResults((prev) => [...prev, {
        source: "OpenStreetMap",
        total: data.total,
        imported: data.imported,
        errors: data.errors || 0,
        duration: data.duration,
      }]);
      setStatus("done");
      setProgress("");
    } catch (err: any) {
      addLog(`שגיאה: ${err.message}`);
      setStatus("error");
      setProgress("");
    }
  }

  async function runAllImports() {
    setStatus("running");
    setResults([]);
    setLog([]);

    // OSM Import - runs in batches by category
    await runOSMImport();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-3xl font-bold mb-2">ניהול YourZon</h1>
      <p className="text-gray-500 mb-8">ייבוא עסקים ממקורות חינמיים וחוקיים</p>

      {/* Import Controls */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">ייבוא נתונים</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <div>
              <h3 className="font-medium">OpenStreetMap</h3>
              <p className="text-sm text-gray-500">~50,000-80,000 עסקים בישראל - חינם וחוקי</p>
            </div>
            <button
              onClick={runOSMImport}
              disabled={status === "running"}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {status === "running" ? "מייבא..." : "התחל ייבוא"}
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
            <div>
              <h3 className="font-medium">ייבוא כל המקורות</h3>
              <p className="text-sm text-gray-500">OSM + data.gov.il - הכל בפעם אחת</p>
            </div>
            <button
              onClick={runAllImports}
              disabled={status === "running"}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
            >
              ייבוא מלא
            </button>
          </div>
        </div>

        {progress && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm flex items-center gap-2">
            <span className="animate-spin">⏳</span>
            <span>{progress}</span>
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">תוצאות</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right">
                <th className="py-2">מקור</th>
                <th className="py-2">נמצאו</th>
                <th className="py-2">יובאו</th>
                <th className="py-2">שגיאות</th>
                <th className="py-2">זמן</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2 font-medium">{r.source}</td>
                  <td className="py-2">{r.total.toLocaleString()}</td>
                  <td className="py-2 text-green-600">{r.imported.toLocaleString()}</td>
                  <td className="py-2 text-red-500">{r.errors}</td>
                  <td className="py-2">{r.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-gray-900 text-green-400 rounded-xl p-4 font-mono text-xs max-h-64 overflow-y-auto">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Setup Instructions */}
      <div className="mt-8 bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-bold mb-4">הוראות הגדרה</h2>
        <div className="space-y-3 text-sm text-gray-700">
          <div className="flex gap-3">
            <span className="bg-brand-100 text-brand-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0">1</span>
            <p>צרו חשבון חינם ב-<a href="https://supabase.com" target="_blank" className="text-brand-600 underline">supabase.com</a> וצרו פרויקט חדש</p>
          </div>
          <div className="flex gap-3">
            <span className="bg-brand-100 text-brand-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0">2</span>
            <p>לכו ל-SQL Editor והריצו את התוכן מקובץ <code className="bg-gray-100 px-1">supabase/schema.sql</code></p>
          </div>
          <div className="flex gap-3">
            <span className="bg-brand-100 text-brand-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0">3</span>
            <p>העתיקו את ה-URL, anon key, ו-service role key מ-Settings → API</p>
          </div>
          <div className="flex gap-3">
            <span className="bg-brand-100 text-brand-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0">4</span>
            <p>הוסיפו אותם כ-Environment Variables ב-Vercel (או בקובץ <code className="bg-gray-100 px-1">.env.local</code>)</p>
          </div>
          <div className="flex gap-3">
            <span className="bg-brand-100 text-brand-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0">5</span>
            <p>חזרו לדף הזה ולחצו על &quot;ייבוא מלא&quot; - העסקים ייובאו אוטומטית!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
