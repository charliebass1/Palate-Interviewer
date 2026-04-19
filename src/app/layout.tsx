import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Palate — Autonomous Foodservice Expert Interviewer",
  description:
    "Upload research materials, run adaptive 30-minute voice interviews with foodservice experts, and synthesize cross-call insights.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
