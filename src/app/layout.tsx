import type { Metadata } from "next";
import "./globals.css";
import { isMockMode } from "@/lib/mock/config";
import { DemoBanner } from "./demo-banner";

export const metadata: Metadata = {
  title: "Palate — Autonomous Foodservice Expert Interviewer",
  description:
    "Upload research materials, run adaptive 30-minute voice interviews with foodservice experts, and synthesize cross-call insights.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {isMockMode() && <DemoBanner />}
        {children}
      </body>
    </html>
  );
}
