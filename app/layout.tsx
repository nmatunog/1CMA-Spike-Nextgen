import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PlausibleAnalytics } from "@/components/plausible-analytics";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  preload: false,
});

export const metadata: Metadata = {
  title: "AIA Next Gen — Your Career Level Up",
  description:
    "AIA Next Gen Advisor program — roadmap, DNA match quiz, and English-first next steps.",
  icons: {
    icon: "/icon",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body className={`${plusJakarta.className} font-sans antialiased`}>
        <PlausibleAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
