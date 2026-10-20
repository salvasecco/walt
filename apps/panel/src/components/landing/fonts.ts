import { DM_Sans, Space_Grotesk } from "next/font/google";

// La identidad de build 101 (deck y afiche): Space Grotesk para títulos, DM Sans para el texto.
export const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--wl-font-display", display: "swap" });
export const body = DM_Sans({ subsets: ["latin"], variable: "--wl-font-body", display: "swap" });
