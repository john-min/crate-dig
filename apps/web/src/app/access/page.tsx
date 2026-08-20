import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { AccessCodeForm } from "@/components/auth/AccessCodeForm";

export const metadata: Metadata = { title: "Access" };

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthCard
      title="Enter your access code"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-paper hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <p className="mb-8 text-[15px] leading-relaxed text-paper-dim">
        Crate Dig is gated while the map is still a private tool. The code is
        checked on the server before you can create an account.
      </p>
      <AccessCodeForm next={next || "/app"} />
    </AuthCard>
  );
}
