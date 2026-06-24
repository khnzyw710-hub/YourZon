import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YourZon - כל העסקים בישראל",
  description: "מדריך העסקים המקיף ביותר בישראל. חפשו עסקים, קראו ביקורות, מצאו את מה שאתם צריכים.",
  keywords: "עסקים, ישראל, ביקורות, מסעדות, שירותים, חנויות",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <header className="bg-white shadow-sm border-b sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="text-2xl font-bold text-brand-600">
              YourZon
            </a>
            <nav className="flex gap-4 text-sm">
              <a href="/" className="hover:text-brand-600">ראשי</a>
              <a href="/category/restaurants" className="hover:text-brand-600">קטגוריות</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="bg-gray-900 text-gray-400 py-8 mt-16">
          <div className="max-w-7xl mx-auto px-4 text-center text-sm">
            <p>© 2026 YourZon - כל העסקים בישראל</p>
            <p className="mt-1">מידע עסקי ממקורות ציבוריים. נתונים מ-OpenStreetMap, data.gov.il ועוד.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
