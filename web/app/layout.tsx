import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LiveRegionProvider } from "@/components/LiveRegion";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Limitless — accessible San Diego trip planner",
  description:
    "Plan a San Diego trip around your real access needs. Every accessibility fact is sourced, and the plan adapts while you travel.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* First tab stop: lets keyboard and screen-reader users jump past any
            future header straight to the page content. */}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <LiveRegionProvider>
          <main
            id="main"
            tabIndex={-1}
            className="flex flex-1 flex-col focus:outline-none"
          >
            {children}
          </main>
          <footer className="border-t border-border px-6 py-10 text-sm text-muted">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-foreground">Limitless</p>
                <p className="mt-1">Your world to discover. Your right to explore.</p>
              </div>
              <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
                <a href="/how-it-works" className="hover:text-foreground">
                  How it works
                </a>
                <a href="/features" className="hover:text-foreground">
                  Features
                </a>
                <a href="/reviews" className="hover:text-foreground">
                  Reviews
                </a>
                <a href="/intake" className="hover:text-foreground">
                  Plan your trip
                </a>
              </nav>
            </div>
            <div className="mx-auto mt-8 w-full max-w-5xl border-t border-border pt-6 text-xs">
              <p>
                &copy; 2026 Limitless. All rights reserved. A DubHacks &rsquo;26
                project.
              </p>
            </div>
          </footer>
        </LiveRegionProvider>
      </body>
    </html>
  );
}
