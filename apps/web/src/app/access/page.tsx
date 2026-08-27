import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { AccessCodeForm } from "@/components/auth/AccessCodeForm";
import { isAccessCodeConfigured } from "@/lib/auth/access-code-match";

export const metadata: Metadata = { title: "Access" };

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthCard
      title="I have a code"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-amber hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <p className="mb-8 text-[15px] leading-relaxed text-paper-dim">
        Crate Dig is currently in private beta. Enter your access code to create
        an account.
      </p>
      <AccessCodeForm configured={isAccessCodeConfigured()} next={next || "/app"} />
    </AuthCard>
  );
}
