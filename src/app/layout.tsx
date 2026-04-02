import type { Metadata } from "next";
import "./globals.css";
import "./towerAlfa.css";

export const metadata: Metadata = {
  title: "Three Tower — Salas",
  description: "Gestão de salas por andar — Three Tower.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
