import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { readAccessCodeCookie } from "@/lib/auth/access-code";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const code = await readAccessCodeCookie();
  if (!code) {
    redirect(`/access?next=${encodeURIComponent(next || "/app")}`);
  }

  return (
    <AuthCard
      title="Create account"
      footer={
        <>
          Music files stay private. Cloud demo uploads are not public.
          <span className="mt-3 block">
            Already have an account?{" "}
            <Link href="/login" className="text-paper hover:underline">
              Sign in
            </Link>
          </span>
        </>
      }
    >
      <SignUpForm next={next || "/app"} />
    </AuthCard>
  );
}
