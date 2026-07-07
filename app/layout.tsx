import type { Metadata } from "next";
import localFont from "next/font/local";
import { Baloo_2 } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { IntroSplash } from "@/components/layout/intro-splash";

const shag = localFont({
  src: "./fonts/shag-lounge.otf",
  variable: "--font-shag",
  display: "swap",
});

const baloo = Baloo_2({
  subsets: ["latin"],
  variable: "--font-baloo",
});

export const metadata: Metadata = {
  title: {
    default: "Object Stream Community",
    template: "%s · Object Stream Community",
  },
  description:
    "Watch Object Shows the right way. No reuploads. No stolen credit. Just clean embeds, playlists, reviews, and community discovery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${shag.variable} ${baloo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <IntroSplash />
        <SiteHeader />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 sm:px-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
