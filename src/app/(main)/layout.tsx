import { DisplayBridge } from "@/components/DisplayBridge";
import { SecondaryScreenButton } from "@/components/SecondaryScreenButton";
import { TabletRedirect } from "@/components/TabletRedirect";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 text-gray-900 min-h-screen">
      <TabletRedirect />
      <DisplayBridge />
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href={`${basePath}/`} className="text-2xl font-bold text-brand-600">YourZon</a>
          <nav className="flex items-center gap-4 text-sm">
            <a href={`${basePath}/`} className="hover:text-brand-600">ראשי</a>
            <a href={`${basePath}/category/restaurants`} className="hover:text-brand-600">קטגוריות</a>
            <SecondaryScreenButton />
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="bg-gray-900 text-gray-400 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm">
          <p>&copy; 2026 YourZon - כל העסקים בישראל</p>
          <p className="mt-1">מידע עסקי ממקורות ציבוריים</p>
        </div>
      </footer>
    </div>
  );
}
