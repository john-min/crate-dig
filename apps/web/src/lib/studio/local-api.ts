export const LOCAL_API_URL = (
  process.env.NEXT_PUBLIC_LOCAL_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");
