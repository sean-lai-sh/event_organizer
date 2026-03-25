"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DashboardPageShell } from "@/components/dashboard/PageShell";

// ─── small atoms ────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button
      onClick={copy}
      className="text-xs font-medium text-neutral-400 transition hover:text-neutral-700"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function StatusPill({ invite }: { invite: { used_at?: number; expires_at?: number } }) {
  if (invite.used_at)
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500">
        Used
      </span>
    );
  if (invite.expires_at && invite.expires_at < Date.now())
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-500">
        Expired
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
      Active
    </span>
  );
}

// ─── revoke modal ────────────────────────────────────────────────────────────

function RevokeModal({
  email,
  onConfirm,
  onCancel,
  loading,
}: {
  email: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-neutral-900">Revoke invite?</h2>
        <p className="mt-2 text-sm text-neutral-500">
          The invite for <span className="font-medium text-neutral-700">{email}</span> will be
          permanently deleted. They won't be able to sign up with this code.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="h-9 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? "Revoking…" : "Revoke invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

type CreatedInvite = { code: string; email: string };

export default function InvitesPage() {
  const [showAll, setShowAll] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<{
    id: Id<"invites">;
    email: string;
  } | null>(null);
  const [revoking, setRevoking] = useState(false);

  const invites = useQuery(api.invites.list, { includeUsed: showAll });
  const createInvite = useMutation(api.invites.create);
  const revokeInvite = useMutation(api.invites.revoke);

  const signupBase =
    typeof window !== "undefined" ? `${window.location.origin}/signup` : "/signup";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const email = formEmail.trim();
    if (!email) return;
    setCreating(true);
    setFormError("");
    setCreated(null);
    try {
      const code = await createInvite({ invited_email: email });
      setCreated({ code, email });
      setFormEmail("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeInvite({ id: revokeTarget.id });
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  }

  return (
    <>
      {revokeTarget && (
        <RevokeModal
          email={revokeTarget.email}
          onConfirm={handleRevoke}
          onCancel={() => setRevokeTarget(null)}
          loading={revoking}
        />
      )}

      <DashboardPageShell
        title="Invites"
        action={
          <button
            onClick={() => {
              setShowForm((v) => !v);
              setCreated(null);
              setFormError("");
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
          >
            <span className="text-base leading-none">+</span>
            New invite
          </button>
        }
      >
        {/* ── create form ── */}
        {showForm && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="mb-4 text-sm font-semibold text-neutral-900">Send invite</p>

            {created ? (
              <div className="space-y-3">
                <p className="text-sm text-neutral-500">
                  Invite created for{" "}
                  <span className="font-medium text-neutral-800">{created.email}</span>.
                </p>

                <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <span className="font-mono text-sm font-semibold tracking-widest text-neutral-900">
                    {created.code}
                  </span>
                  <CopyButton text={created.code} label="Copy code" />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <span className="truncate font-mono text-xs text-neutral-400">
                    {signupBase}?code={created.code}
                  </span>
                  <CopyButton
                    text={`${signupBase}?code=${created.code}`}
                    label="Copy link"
                  />
                </div>

                <button
                  onClick={() => setCreated(null)}
                  className="text-xs text-neutral-400 transition hover:text-neutral-600"
                >
                  Send another
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <label className="block text-xs font-medium text-neutral-500">
                    Member email
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => {
                      setFormEmail(e.target.value);
                      setFormError("");
                    }}
                    placeholder="member@example.com"
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-transparent px-3.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-neutral-800"
                    autoFocus
                  />
                  {formError && (
                    <p className="text-xs text-red-500">{formError}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="h-10 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-500 transition hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="h-10 rounded-lg bg-neutral-900 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
                  >
                    {creating ? "Creating…" : "Generate"}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {/* ── filter tabs ── */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-3">
          <div className="flex gap-1.5">
            {(["Active", "All"] as const).map((label) => {
              const active = label === "All" ? showAll : !showAll;
              return (
                <button
                  key={label}
                  onClick={() => setShowAll(label === "All")}
                  className={`h-8 rounded-md px-3 text-xs font-medium transition ${
                    active
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-500 hover:bg-neutral-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── table ── */}
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {invites === undefined ? (
            <p className="p-8 text-center text-sm text-neutral-400">Loading…</p>
          ) : invites.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-400">
              No invites yet — create one to onboard your first member.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    {["Invited", "Code", "Status", "Sent by", "Used by", ""].map((h) => (
                      <th
                        key={h}
                        className="h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-neutral-400 last:text-right"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {invites.map((invite) => (
                    <tr key={invite._id} className="group hover:bg-neutral-50">
                      {/* email */}
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-medium text-neutral-800">
                          {invite.invited_email ?? (
                            <span className="font-normal text-neutral-400">—</span>
                          )}
                        </span>
                      </td>

                      {/* code */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-sm font-semibold tracking-wider text-neutral-700">
                          {invite.code}
                        </span>
                      </td>

                      {/* status */}
                      <td className="px-4 py-3.5">
                        <StatusPill invite={invite} />
                      </td>

                      {/* created by */}
                      <td className="px-4 py-3.5 text-sm text-neutral-500">
                        {invite.created_by_email ?? (
                          <span className="text-neutral-300">system</span>
                        )}
                      </td>

                      {/* used by */}
                      <td className="px-4 py-3.5 text-sm text-neutral-500">
                        {invite.used_by_email ?? (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>

                      {/* actions */}
                      <td className="px-4 py-3.5 text-right">
                        {!invite.used_at && (
                          <div className="flex items-center justify-end gap-4 opacity-0 transition group-hover:opacity-100">
                            <CopyButton text={invite.code} label="Copy code" />
                            <CopyButton
                              text={`${signupBase}?code=${invite.code}`}
                              label="Copy link"
                            />
                            <button
                              onClick={() =>
                                setRevokeTarget({
                                  id: invite._id,
                                  email: invite.invited_email ?? invite.code,
                                })
                              }
                              className="text-xs font-medium text-red-400 transition hover:text-red-600"
                            >
                              Revoke
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </DashboardPageShell>
    </>
  );
}
