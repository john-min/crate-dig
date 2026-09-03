import { NextResponse } from "next/server";
import { qRequestSchema } from "@/lib/q/schema";
import { answerQ, QConfigurationError } from "@/lib/q/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Q needs a valid JSON request." }, { status: 400 });
  }

  const parsed = qRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Q received incomplete or invalid music context." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await answerQ(parsed.data));
  } catch (error) {
    if (error instanceof QConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Q request failed", error);
    return NextResponse.json(
      { error: "Q's model service is temporarily unavailable." },
      { status: 502 },
    );
  }
}
