import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CashFlow402 — HTTP 402 Payments for BCH",
    template: "%s | CashFlow402",
  },
  description:
    "CashFlow402 is an open protocol enabling HTTP 402 per-call and subscription payments on Bitcoin Cash. Monetize any API endpoint instantly.",
  keywords: [
    "Bitcoin Cash",
    "BCH",
    "HTTP 402",
    "payment required",
    "micropayments",
    "subscription",
    "API monetization",
    "CashScript",
    "CashTokens",
  ],
  openGraph: {
    type: "website",
    title: "CashFlow402",
    description: "HTTP 402 Per-Call & Subscription Payments on Bitcoin Cash",
    siteName: "CashFlow402",
  },
  twitter: {
    card: "summary_large_image",
    title: "CashFlow402",
    description: "HTTP 402 Per-Call & Subscription Payments on Bitcoin Cash",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange={false}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
