import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Volum",
  description: "Real-time device connection and audio sync.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
