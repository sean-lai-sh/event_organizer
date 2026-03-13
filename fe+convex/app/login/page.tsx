"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";

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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-lg"
      >
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">Eboard Login</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Sign in to manage your events
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <div className="flex items-center justify-center gap-2 text-sm text-zinc-600">
          <p>Don&apos;t have an account?</p>
          <Link
            href="/signup"
            className="font-medium text-blue-600 hover:underline"
          >
            Create account
          </Link>
        </div>
      </form>
    </div>
  );
}
