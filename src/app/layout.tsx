import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Safe Bike Seoul | 안전한 서울 라이딩",
  description: "서울에서의 안전한 자전거 이동을 위한 지도 서비스 데모",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
