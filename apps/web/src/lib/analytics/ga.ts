export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "G-38JH1QX8HH";

export function isGoogleAnalyticsEnabled(): boolean {
  return process.env.NODE_ENV === "production" && Boolean(GA_MEASUREMENT_ID);
}
