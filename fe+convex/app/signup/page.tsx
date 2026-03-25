"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { signUp } from "@/lib/auth-client";
import { AuthShell } from "@/components/auth/AuthShell";

type Step = "invite" | "register";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const codeFromUrl = params.get("code")?.trim().toUpperCase() ?? "";

  const [step, setStep] = useState<Step>("invite");
  const [inviteCode, setInviteCode] = useState(codeFromUrl);
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [lockedInviteEmail, setLockedInviteEmail] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const normalizedCode = inviteCode.trim().toUpperCase();

  const validateResult = useQuery(
    api.invites.validate,
    normalizedCode.length >= 4 ? { code: normalizedCode } : "skip"
  );

  const consumeInvite = useMutation(api.invites.consume);

  const inviteIsValid = normalizedCode.length >= 4 && validateResult?.valid === true;
  const passwordStrong = password.length >= 8;
  const confirmMatches = confirmPassword.length > 0 && password === confirmPassword;

  const registerEmail = useMemo(
    () => (lockedInviteEmail ? lockedInviteEmail : email.trim().toLowerCase()),
    [email, lockedInviteEmail]
  );

  async function handleInviteSubmit(e: FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError("");

    if (!validateResult?.valid) {
      setInviteError(validateResult?.reason ?? "Invalid invite code");
      setInviteLoading(false);
      return;
    }

    const inviteEmail = validateResult.invited_email;
    if (inviteEmail) {
      setLockedInviteEmail(inviteEmail);
      setEmail(inviteEmail);
      setErrors((prev) => ({ ...prev, email: "" }));
    } else {
      setLockedInviteEmail(null);
    }

    setStep("register");
    setInviteLoading(false);
  }

  function validateForm() {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = "Name is required";

    if (!registerEmail) {
      newErrors.email = "Email is required";
    } else if (!isValidEmail(registerEmail)) {
      newErrors.email = "Invalid email format";
    }

    if (!password) {
      newErrors.password = "Password is required";
    } else if (!passwordStrong) {
      newErrors.password = "Password must be at least 8 characters";
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (!confirmMatches) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);

    const { error } = await signUp.email({ name: name.trim(), email: registerEmail, password });
    if (error) {
      setErrors({ submit: error.message ?? "Sign up failed" });
      setLoading(false);
      return;
    }

    try {
      await consumeInvite({ code: normalizedCode, email: registerEmail });
    } catch (consumeError) {
      console.warn("Failed to consume invite code", consumeError);
    }

    router.push("/dashboard");
  }

  return (
    <AuthShell
      title="Build better events together."
      subtitle="Invite-only access keeps your organizing team focused and secure."
      footnote="Invite codes are managed by your eboard admins."
    >
      {step === "invite" ? (
        <form onSubmit={handleInviteSubmit} className="space-y-5">
          <div className="mb-8">
            <h1 className="text-[36px] font-semibold tracking-[-1.4px] text-[#0A0A0A]">
              Join the team
            </h1>
            <p className="mt-2 text-[14px] text-[#999999]">
              Enter your invite code to continue.
            </p>
          </div>

          {inviteError && (
            <div className="rounded-[8px] border border-[#E0E0E0] bg-[#F9F9F9] px-3 py-2.5 text-[13px] text-[#555555]">
              {inviteError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-[#555555]">Invite code</label>
            <div className="relative">
              <input
                type="text"
                required
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value);
                  setInviteError("");
                }}
                className={`h-11 w-full rounded-[8px] border bg-transparent px-[14px] pr-10 text-[14px] uppercase tracking-[0.22em] text-[#111111] outline-none transition ${
                  inviteIsValid
                    ? "border-[#22C55E]"
                    : "border-[#E0E0E0] focus:border-[#111111]"
                }`}
                placeholder="XXXXXXXX"
                autoFocus
              />
              {inviteIsValid && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#16A34A]">
                  <CheckIcon />
                </span>
              )}
            </div>

            {normalizedCode.length >= 4 && validateResult?.valid === false && (
              <p className="text-[12px] text-[#555555]">{validateResult.reason}</p>
            )}
            {inviteIsValid && (
              <p className="flex items-center gap-1.5 text-[12px] text-[#16A34A]">
                <CheckIcon />
                Invite code is valid.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={
              inviteLoading ||
              (normalizedCode.length >= 4 && validateResult?.valid === false)
            }
            className="h-11 w-full rounded-[8px] bg-[#0A0A0A] text-[14px] font-semibold text-[#FFFFFF] transition hover:bg-[#111111] disabled:opacity-60"
          >
            {inviteLoading ? "Checking..." : "Continue"}
          </button>

          <p className="text-center text-[14px] text-[#999999]">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-[#111111] hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setStep("invite")}
              className="mb-4 text-[13px] text-[#999999] transition hover:text-[#555555]"
            >
              ← Back
            </button>
            <h1 className="text-[36px] font-semibold tracking-[-1.4px] text-[#0A0A0A]">
              Create account
            </h1>
            <p className="mt-2 text-[13px] text-[#999999]">
              Invite code: <span className="font-mono text-[#555555]">{normalizedCode}</span>
            </p>
            {lockedInviteEmail && (
              <p className="mt-1 text-[12px] text-[#999999]">
                Email is locked to this invite.
              </p>
            )}
          </div>

          {errors.submit && (
            <div className="rounded-[8px] border border-[#E0E0E0] bg-[#F9F9F9] px-3 py-2.5 text-[13px] text-[#555555]">
              {errors.submit}
            </div>
          )}

          <Field
            label="Full name"
            value={name}
            onChange={(value) => {
              setName(value);
              setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="Enter your full name"
            error={errors.name}
          />

          <Field
            label="Email"
            type="email"
            value={registerEmail}
            onChange={(value) => {
              if (lockedInviteEmail) return;
              setEmail(value);
              setErrors((prev) => ({ ...prev, email: "" }));
            }}
            placeholder="you@example.com"
            error={errors.email}
            readOnly={Boolean(lockedInviteEmail)}
          />

          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setErrors((prev) => ({ ...prev, password: "" }));
            }}
            placeholder="At least 8 characters"
            error={errors.password}
            success={passwordStrong}
            successText="Password length looks good."
          />

          <Field
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              setErrors((prev) => ({ ...prev, confirmPassword: "" }));
            }}
            placeholder="Repeat your password"
            error={errors.confirmPassword}
            success={confirmMatches}
            successText="Passwords match."
          />

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-[8px] bg-[#0A0A0A] text-[14px] font-semibold text-[#FFFFFF] transition hover:bg-[#111111] disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="text-center text-[14px] text-[#999999]">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-[#111111] hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  type = "text",
  readOnly = false,
  success = false,
  successText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  type?: "text" | "email" | "password";
  readOnly?: boolean;
  success?: boolean;
  successText?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-medium text-[#555555]">{label}</label>
      <div className="relative">
        <input
          type={type}
          required
          readOnly={readOnly}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-11 w-full rounded-[8px] border bg-transparent px-[14px] pr-10 text-[14px] text-[#111111] outline-none transition ${
            success
              ? "border-[#22C55E]"
              : "border-[#E0E0E0] focus:border-[#111111]"
          } ${readOnly ? "text-[#555555]" : ""}`}
          placeholder={placeholder}
        />
        {success && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#16A34A]">
            <CheckIcon />
          </span>
        )}
      </div>
      {error && <p className="text-[12px] text-[#555555]">{error}</p>}
      {!error && success && successText && (
        <p className="flex items-center gap-1.5 text-[12px] text-[#16A34A]">
          <CheckIcon />
          {successText}
        </p>
      )}
    </div>
  );
}
