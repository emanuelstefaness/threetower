import type { Metadata } from "next";
import "./globals.css";
import "./towerAlfa.css";

export const metadata: Metadata = {
  title: "Sistema de Salas - Prédio 3D",
  description: "Gerenciamento de salas por andar com dashboard 3D interativo.",
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
