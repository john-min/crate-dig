import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import type { Metadata } from "next";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Crate Dig",
    template: "%s · Crate Dig",
  },
  description:
    "Explore a curated library mapped by sound. Ask Q where your set should go next. Soon, analyze your own collection on Mac.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full bg-ink font-sans text-paper">{children}</body>
    </html>
  );
}
