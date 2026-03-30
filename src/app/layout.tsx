import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a365d",
};

export const metadata: Metadata = {
  title: "ミラテクドローン 見積もりシミュレーター",
  description: "ビル条件を入力するだけで、ドローン外壁調査の販売価格・原価・粗利を即時算出。ロープアクセスとの比較も自動表示。",
  openGraph: {
    title: "ミラテクドローン 見積もりシミュレーター",
    description: "ドローン外壁調査の概算見積もりを即時算出",
    type: "website",
  },
  icons: {
    icon: [
      { url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏗️</text></svg>", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
