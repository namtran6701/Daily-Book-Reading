import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "Second Brain",
    description:
      "A calendar, an Eisenhower matrix, and your book notes. Nothing else.",
    openGraph: {
      title: "Second Brain",
      description: "Think it. Place it. Find it.",
      type: "website",
      images: [`${origin}/og.png`],
    },
    twitter: {
      card: "summary_large_image",
      title: "Second Brain",
      description: "Think it. Place it. Find it.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
