import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qrohl",
  description: "The Whole Package for QR and Barcodes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col subpixel-antialiased">
        {children}
      </body>
    </html>
  );
}
