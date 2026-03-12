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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = "Name is required";
    if (!email.trim()) newErrors.email = "Email is required";
    else if (!validateEmail(email)) newErrors.email = "Invalid email format";
    if (!password) newErrors.password = "Password is required";
    else if (password.length < 8)
      newErrors.password = "Password must be at least 8 characters";
    if (password !== confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    const { error } = await signUp.email({ name, email, password });
    if (error) {
      setErrors({ submit: error.message ?? "Sign up failed" });
      setLoading(false);
      return;
    }
    router.push("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-8 shadow-lg"
      >
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">Create Account</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Join the event organization team
          </p>
        </div>

        {errors.submit && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {errors.submit}
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700">
            Full Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors({ ...errors, name: "" });
            }}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
              errors.name
                ? "border-red-300 focus:ring-red-200"
                : "border-zinc-300 focus:ring-blue-500"
            }`}
            placeholder="Enter your full name"
          />
          {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
        </div>

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
              setErrors({ ...errors, email: "" });
            }}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
              errors.email
                ? "border-red-300 focus:ring-red-200"
                : "border-zinc-300 focus:ring-blue-500"
            }`}
            placeholder="you@example.com"
          />
          {errors.email && (
            <p className="text-xs text-red-600">{errors.email}</p>
          )}
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
              setErrors({ ...errors, password: "" });
            }}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
              errors.password
                ? "border-red-300 focus:ring-red-200"
                : "border-zinc-300 focus:ring-blue-500"
            }`}
            placeholder="At least 8 characters"
          />
          {errors.password && (
            <p className="text-xs text-red-600">{errors.password}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700">
            Confirm Password
          </label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setErrors({ ...errors, confirmPassword: "" });
            }}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
              errors.confirmPassword
                ? "border-red-300 focus:ring-red-200"
                : "border-zinc-300 focus:ring-blue-500"
            }`}
            placeholder="Repeat your password"
          />
          {errors.confirmPassword && (
            <p className="text-xs text-red-600">{errors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>

        <div className="flex items-center justify-center gap-2 text-sm text-zinc-600">
          <p>Already have an account?</p>
          <Link
            href="/login"
            className="font-medium text-blue-600 hover:underline"
          >
            Sign in
          </Link>
        </div>
      </form>
    </div>
  );
}
