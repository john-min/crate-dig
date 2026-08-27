import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  return (
    <AuthCard
      title="Reset password"
      footer={
        <Link href="/login" className="text-paper hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm sent={sent === "1"} />
    </AuthCard>
  );
}
