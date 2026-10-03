import type { Metadata, Viewport } from "next";
import { Chakra_Petch, JetBrains_Mono, Orbitron } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], weight: ["500", "700", "900"] });
const chakra = Chakra_Petch({ variable: "--font-chakra", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "J.A.R.V.I.S. — Doomsday Command Centre",
  description: "Tony Stark's personal AI assistant: calendar, reminders, Stark Archive (Drive) and Telegram comms in one HUD.",
};

export const viewport: Viewport = { themeColor: "#020705", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${orbitron.variable} ${chakra.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="hud-grid scanlines h-full overflow-hidden">
        {children}
        <Toaster theme="dark" position="top-center" toastOptions={{ className: "hud-panel !bg-[var(--panel-solid)] !text-[var(--text)]" }} />
      </body>
    </html>
  );
}
