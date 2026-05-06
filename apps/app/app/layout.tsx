import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#020203",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://app.singularity.diy"),
  title: "Singularity | Fundraising redefined",
  description: "Singularity is a platform that connects investors with builders to grow capital together.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    siteName: "Singularity",
    title: "Singularity | Fundraising redefined",
    description: "Singularity is a platform that connects investors with builders to grow capital together.",
    images: [
      {
        url: "/og-image.svg",
        type: "image/svg+xml",
        width: 1200,
        height: 630,
        alt: "Singularity fundraising redefined social preview card",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Singularity | Fundraising redefined",
    description: "Singularity is a platform that connects investors with builders to grow capital together.",
    images: [
      {
        url: "/og-image.svg",
        alt: "Singularity fundraising redefined social preview card",
      },
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
