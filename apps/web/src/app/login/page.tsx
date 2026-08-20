import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; checkEmail?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          Need an access code first?{" "}
          <Link href="/access" className="text-paper hover:underline">
            Start digging
          </Link>
          <span className="mx-2 text-line">·</span>
          <Link href="/signup" className="text-paper hover:underline">
            Create account
          </Link>
        </>
      }
    >
      <LoginForm
        next={params.next || "/app"}
        checkEmail={params.checkEmail === "1"}
        oauthError={params.error === "oauth" || params.error === "confirm"}
      />
    </AuthCard>
  );
}
