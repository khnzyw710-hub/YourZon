import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "YourZon - מסך משני",
  description: "מסך משני של YourZon להצגת מידע על עסקים",
};

export default function DisplayGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
