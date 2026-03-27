"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth/AuthShell";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "Invalid credentials");
      setLoading(false);
      return;
    }

    router.push(redirect);
  }

  return (
    <AuthShell
      title="Run event ops without chaos."
      subtitle="Coordinate speakers, logistics, and outreach in one monochrome workspace."
      footnote="Built for student orgs moving fast."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="mb-8">
          <h1 className="text-[36px] font-semibold tracking-[-1.4px] text-[#0A0A0A]">
            Welcome back
          </h1>
          <p className="mt-2 text-[14px] text-[#999999]">
            Sign in to manage your events
          </p>
        </div>

        {error && (
          <div className="rounded-[8px] border border-[#E0E0E0] bg-[#F9F9F9] px-3 py-2.5 text-[13px] text-[#555555]">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-[#555555]">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            className="h-11 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-[14px] text-[14px] text-[#111111] outline-none transition focus:border-[#111111]"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-[#555555]">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              className="h-11 w-full rounded-[8px] border border-[#E0E0E0] bg-transparent px-[14px] pr-10 text-[14px] text-[#111111] outline-none transition focus:border-[#111111]"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999999] transition hover:text-[#555555]"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-[8px] bg-[#0A0A0A] text-[14px] font-semibold text-[#FFFFFF] transition hover:bg-[#111111] disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="text-center text-[14px] text-[#999999]">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-[#111111] hover:underline">
            Create account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
