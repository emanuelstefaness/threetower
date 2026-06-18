import type { Metadata, Viewport } from "next";
import AppShell from "./AppShell";
import "./globals.css";
import "./towerAlfa.css";

export const metadata: Metadata = {
  title: "Tree Tower — Salas",
  description: "Gestão de salas por andar — Tree Tower.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
