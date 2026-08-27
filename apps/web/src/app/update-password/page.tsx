import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";
import { createClient } from "@/lib/supabase/server";
import { getSupabasePublishableEnv } from "@/lib/env";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "New password" };

export default async function UpdatePasswordPage() {
  if (!getSupabasePublishableEnv()) {
    redirect("/login?error=confirm");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AuthCard title="Choose a new password">
      <UpdatePasswordForm />
    </AuthCard>
  );
}
