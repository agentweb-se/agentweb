import type { Metadata } from "next";
import localFont from "next/font/local";
import { Instrument_Sans, Space_Mono } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
  display: "swap",
});

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
        className={`${instrumentSans.variable} ${spaceMono.variable} ${cascadiaMono.variable} antialiased font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
