import { requireApiAccess } from "@/lib/cloud/access";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireApiAccess();
  if (!gate.ok) return gate.response;
  return Response.json({
    userId: gate.access.user.id,
    email: gate.access.user.email ?? undefined,
  });
}
