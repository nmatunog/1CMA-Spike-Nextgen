import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PlausibleAnalytics } from "@/components/plausible-analytics";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "1CMA NextGen",
  description: "Recruitment exploration — fast, peer-led, English-first forms.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
        <PlausibleAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
