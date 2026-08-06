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
      <body>{children}</body>
    </html>
  );
}
