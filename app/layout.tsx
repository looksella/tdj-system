import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { NavigationProgress } from "@/components/navigation-progress";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
const appSans = DM_Sans({ subsets: ["latin"], variable: "--font-app-sans" });
const appDisplay = Fraunces({ subsets: ["latin"], variable: "--font-app-display" });
export const metadata: Metadata = {
  title: {
    default: "Tienda Don Juan",
    template: "%s | Tienda Don Juan",
  },
  description: "Inventario y ventas en un solo lugar.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${appSans.variable} ${appDisplay.variable} antialiased`}>
        <NavigationProgress />
        <ServiceWorkerRegistration />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
