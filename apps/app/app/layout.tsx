import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Suspense, type ReactNode } from "react";
import { GoogleAnalytics } from "@/components/google-analytics";
import { Providers } from "@/components/providers";
import "./globals.css";

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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
  },
  twitter: {
    card: "summary_large_image",
    title: "Singularity | Fundraising redefined",
    description: "Singularity is a platform that connects investors with builders to grow capital together.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {gaMeasurementId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}', { send_page_view: false });
              `}
            </Script>
            <Suspense fallback={null}>
              <GoogleAnalytics measurementId={gaMeasurementId} />
            </Suspense>
          </>
        ) : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
