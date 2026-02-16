import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ObservabilityProvider } from "@/components/observability/observability-provider";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vdex.cloud";
const siteName = "vdesk";
const siteDescription =
  "Cloud workspace desktop for launching apps, managing files, and running development environments from anywhere.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "vdesk — Cloud Workspace Desktop",
    template: "%s | vdesk",
  },
  description: siteDescription,
  applicationName: siteName,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName,
    title: "vdesk — Cloud Workspace Desktop",
    description: siteDescription,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "vdesk cloud workspace desktop",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "vdesk — Cloud Workspace Desktop",
    description: siteDescription,
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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
        className={[
          GeistSans.variable,
          GeistMono.variable,
          jetbrainsMono.variable,
          "antialiased min-h-screen bg-background w-full mx-auto scroll-smooth ",
        ].join(" ")}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ObservabilityProvider>
            <TooltipProvider>
              <div className="flex min-h-screen flex-col">
                <div className="flex-1">{children}</div>
              </div>
            </TooltipProvider>
          </ObservabilityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
