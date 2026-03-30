import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ミラテクドローン 見積もりシミュレーター",
  description: "ドローン外壁調査の概算見積もりを即時算出",
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
