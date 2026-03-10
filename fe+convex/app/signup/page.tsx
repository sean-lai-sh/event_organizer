"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import Link from "next/link";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await signUp.email({ name, email, password });
    if (error) {
      setError(error.message ?? "Sign up failed");
      setLoading(false);
      return;
    }
    router.push("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Create account
        </h1>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-zinc-900 dark:text-zinc-50">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
