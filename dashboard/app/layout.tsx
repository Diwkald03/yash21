import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DeoDap Blog Drafter — YouTube to Shopify blogs",
    template: "%s · DeoDap Blog Drafter",
  },
  description:
    "Turn DeoDap YouTube videos into SEO-optimized, publish-ready Shopify blog drafts — transcript, analysis, product links and schema, automatically.",
  applicationName: "DeoDap Blog Drafter",
  authors: [{ name: "DeoDap" }],
  keywords: ["YouTube to blog", "Shopify blog automation", "SEO blog", "DeoDap"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d1b2d",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
