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
          <footer className="border-t border-border px-6 py-8 text-sm text-muted">
            <div className="mx-auto w-full max-w-5xl">
              <p className="font-semibold text-foreground">Limitless</p>
              <p className="mt-1 max-w-2xl">
                Accessibility details come from cited sources and can change.
                Always confirm critical needs with the venue before you go.
              </p>
            </div>
          </footer>
        </LiveRegionProvider>
      </body>
    </html>
  );
}
