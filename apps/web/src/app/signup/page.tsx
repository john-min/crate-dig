import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { hasValidAccessCodeCookie } from "@/lib/auth/access-code";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (!(await hasValidAccessCodeCookie())) {
    redirect(`/access?next=${encodeURIComponent(next || "/app")}`);
  }

  return (
    <AuthCard
      title="Create account"
      footer={
        <>
          The web demo is a shared crate. On Mac, your files stay on your machine.
          <span className="mt-3 block">
            Already have an account?{" "}
            <Link href="/login" className="text-amber hover:underline">
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
