import type { Metadata } from "next";
import { Baloo_2, Nunito_Sans } from "next/font/google";
import "./globals.css";

const headingFont = Baloo_2({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["600", "700", "800"],
});

const bodyFont = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "EasyBookFair",
  description: "Book fair consignment platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body className="bg-cream font-sans text-neutral-800">{children}</body>
    </html>
  );
}
