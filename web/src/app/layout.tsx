import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const cascadiaMono = localFont({
  src: "./fonts/CascadiaMono.ttf",
  variable: "--font-cascadia-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgentWeb",
  description:
    "Turn any website into an operating manual for AI agents. Paste a URL, explore with AI, and generate agents.json.",
  icons: {
    icon: "/agentweb-main-icon.svg",
    apple: "/agentweb-main-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${cascadiaMono.variable} antialiased font-[family-name:var(--font-cascadia-mono)]`}
      >
        {children}
      </body>
    </html>
  );
}
