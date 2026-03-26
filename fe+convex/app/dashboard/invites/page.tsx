"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Eye, EyeOff, Copy, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Types ───────────────────────────────────────────────────────────────────

type InviteRow = {
  _id: Id<"invites">;
  code: string;
  invited_email?: string | null;
  used_at?: number | null;
  expires_at?: number | null;
  max_uses?: number | null;
  use_count?: number | null;
  grants_role?: string | null;
};

type InviteType = "code" | "link";
type CreatedInvite = { code: string; label: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

type StatusVariant = "active" | "exhausted" | "expired" | "used";

function inviteStatus(invite: InviteRow): StatusVariant {
  if (invite.max_uses != null) {
    return (invite.use_count ?? 0) >= invite.max_uses ? "exhausted" : "active";
  }
  if (invite.used_at) return "used";
  if (invite.expires_at && invite.expires_at < Date.now()) return "expired";
  return "active";
}

function inviteStateLabel(invite: InviteRow): string {
  if (invite.max_uses != null) {
    const used = invite.use_count ?? 0;
    if (used >= invite.max_uses) return "Exhausted";
    return `${used} / ${invite.max_uses} uses`;
  }
  if (invite.used_at) return "Used";
  if (invite.expires_at && invite.expires_at < Date.now()) return "Expired";
  return "Active";
}

function isRevokable(invite: InviteRow): boolean {
  if (invite.max_uses != null) return (invite.use_count ?? 0) < invite.max_uses;
  return !invite.used_at;
}

const statusDot: Record<StatusVariant, string> = {
  active: "bg-emerald-500",
  used: "bg-red-400",
  exhausted: "bg-red-400",
  expired: "bg-[#d0d0d0]",
};

const statusText: Record<StatusVariant, string> = {
  active: "text-[#0a0a0a]",
  used: "text-[#8d8d8d]",
  exhausted: "text-[#8d8d8d]",
  expired: "text-[#b0b0b0]",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyIconButton({
  text,
  label,
  tooltip,
}: {
  text: string;
  label?: string;
  tooltip?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    const id = toast.success(label ?? "Copied to clipboard", {
      cancel: { label: "Dismiss", onClick: () => toast.dismiss(id) },
    });
  }

  const btn = (
    <button
      type="button"
      onClick={copy}
      className="flex h-6 w-6 items-center justify-center rounded text-[#b0b0b0] transition hover:text-[#4d4d4d]"
    >
      {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />}
    </button>
  );

  if (!tooltip) return btn;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : tooltip}</TooltipContent>
    </Tooltip>
  );
}

function RevealCell({
  code,
  revealed,
  onToggle,
}: {
  code: string;
  revealed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {revealed ? (
        <>
          <span className="font-mono text-[12px] tracking-widest text-[#202020]">{code}</span>
          <CopyIconButton text={code} label="Code copied" tooltip="Copy code" />
        </>
      ) : (
        <span className="font-mono text-[13px] tracking-widest text-[#c0c0c0] select-none">
          {"•".repeat(8)}
        </span>
      )}
      <button
        type="button"
        onClick={onToggle}
        className="ml-0.5 flex h-6 w-6 items-center justify-center rounded text-[#c0c0c0] transition hover:text-[#4d4d4d]"
        title={revealed ? "Hide code" : "Reveal code"}
      >
        {revealed ? <EyeOff size={13} strokeWidth={2} /> : <Eye size={13} strokeWidth={2} />}
      </button>
    </div>
  );
}

function RevokeDialog({
  open,
  label,
  onConfirm,
  onOpenChange,
  loading,
}: {
  open: boolean;
  label: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-[22px] font-semibold tracking-[-0.6px]">Revoke invite?</DialogTitle>
          <DialogDescription className="mt-1 text-[14px] leading-[1.55] text-[#7d7d7d]">
            The invite for <span className="font-medium text-[#4d4d4d]">{label}</span> will be permanently
            deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={loading}>
            {loading ? "Revoking..." : "Revoke"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminRequired() {
  return (
    <DashboardPageShell title="Invites">
      <div className="flex flex-col gap-3 rounded-[14px] border border-[#E0E0E0] bg-[#F4F4F4] p-5">
        <h2 className="text-[26px] font-semibold tracking-[-1px] text-[#0A0A0A]">Admin access required</h2>
        <p className="text-[14px] leading-[1.55] text-[#7d7d7d]">
          Only admins can manage invites. Contact your admin to get access.
        </p>
      </div>
    </DashboardPageShell>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function InvitesSkeleton() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-[#E0E0E0] bg-white">
      <div className="border-b border-[#E0E0E0] px-3 py-2.5">
        <div className="flex gap-6">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-[#F0F0F0] px-3 py-3">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-3.5 w-10" />
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvitesPage() {
  const member = useQuery(api.eboard.getCurrentMember);

  const [showAll, setShowAll] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [inviteType, setInviteType] = useState<InviteType>("code");
  const [formEmail, setFormEmail] = useState("");
  const [grantAdmin, setGrantAdmin] = useState(false);
  const [linkRole, setLinkRole] = useState("member");
  const [maxUses, setMaxUses] = useState("1");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<{ id: Id<"invites">; label: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

  const allInvites = useQuery(api.invites.list, { includeUsed: true });
  const invites = showAll
    ? allInvites
    : allInvites?.filter((i) => inviteStatus(i as InviteRow) === "active");
  const createInvite = useMutation(api.invites.create);
  const revokeInvite = useMutation(api.invites.revoke);

  const signupBase =
    typeof window !== "undefined" ? `${window.location.origin}/signup` : "/signup";

  function toggleRevealed(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (member === undefined) {
    return (
      <DashboardPageShell title="Invites">
        <InvitesSkeleton />
      </DashboardPageShell>
    );
  }

  if (member?.role !== "admin") return <AdminRequired />;

  function resetCreateState() {
    setInviteType("code");
    setFormEmail("");
    setGrantAdmin(false);
    setLinkRole("member");
    setMaxUses("1");
    setFormError("");
    setCreated(null);
  }

  function handleCreateModalChange(nextOpen: boolean) {
    setCreateModalOpen(nextOpen);
    if (!nextOpen) resetCreateState();
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setFormError("");
    setCreated(null);

    try {
      if (inviteType === "code") {
        const email = formEmail.trim();
        if (!email) {
          setFormError("Email is required");
          setCreating(false);
          return;
        }
        const code = await createInvite({
          invited_email: email,
          grants_role: grantAdmin ? "admin" : undefined,
        });
        setCreated({ code, label: email });
        setFormEmail("");
      } else {
        const uses = parseInt(maxUses, 10);
        if (!uses || uses < 1) {
          setFormError("Number of uses must be at least 1");
          setCreating(false);
          return;
        }
        const code = await createInvite({ grants_role: linkRole, max_uses: uses });
        setCreated({ code, label: `${linkRole} · ${uses} use${uses !== 1 ? "s" : ""}` });
      }
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
    <TooltipProvider delayDuration={300}>
    <>
      <RevokeDialog
        open={Boolean(revokeTarget)}
        label={revokeTarget?.label ?? ""}
        onConfirm={handleRevoke}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        loading={revoking}
      />

      {/* Create modal */}
      <Dialog open={createModalOpen} onOpenChange={handleCreateModalChange}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Send invite</DialogTitle>
            <DialogDescription>
              Generate a code locked to one email, or a reusable invite link.
            </DialogDescription>
          </DialogHeader>

          {created ? (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] font-medium text-[#4d4d4d]">
                Invite created — <span className="text-[#202020]">{created.label}</span>.
              </p>

              <div className="flex items-center justify-between rounded-[8px] border border-[#E0E0E0] bg-white px-3 py-2.5">
                <span className="font-mono text-[13px] font-semibold tracking-widest text-[#202020]">
                  {created.code}
                </span>
                <div className="flex items-center gap-2">
                  <CopyIconButton text={created.code} label="Invite code copied" />
                  <span className="text-[11px] text-[#c0c0c0]">code</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-[8px] border border-[#E0E0E0] bg-white px-3 py-2.5">
                <span className="truncate font-mono text-[12px] text-[#8d8d8d]">
                  {signupBase}?code={created.code}
                </span>
                <div className="flex items-center gap-2">
                  <CopyIconButton text={`${signupBase}?code=${created.code}`} label="Invite link copied" />
                  <span className="text-[11px] text-[#c0c0c0]">link</span>
                </div>
              </div>

              <DialogFooter className="mt-2">
                <Button type="button" variant="outline" onClick={resetCreateState}>
                  Create another
                </Button>
                <Button type="button" onClick={() => setCreateModalOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <Tabs
                value={inviteType}
                onValueChange={(v) => { setInviteType(v as InviteType); setFormError(""); }}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="code" className="flex-1">Invite code</TabsTrigger>
                  <TabsTrigger value="link" className="flex-1">Invite link</TabsTrigger>
                </TabsList>

                <TabsContent value="code" className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-[#555555]">Member email</label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => { setFormEmail(e.target.value); setFormError(""); }}
                      placeholder="member@example.com"
                      autoFocus
                      className="h-11 w-full rounded-[8px] border border-[#E0E0E0] bg-white px-[14px] text-[14px] text-[#111111] placeholder:text-[#BBBBBB] outline-none transition focus:border-[#111111]"
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={grantAdmin}
                      onChange={(e) => setGrantAdmin(e.target.checked)}
                      className="h-4 w-4 rounded-[4px] border border-[#E0E0E0] accent-[#0A0A0A]"
                    />
                    <span className="text-[13px] text-[#4d4d4d]">Grant admin access</span>
                  </label>
                </TabsContent>

                <TabsContent value="link" className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-[#555555]">Base role after signup</label>
                    <select
                      value={linkRole}
                      onChange={(e) => setLinkRole(e.target.value)}
                      className="h-11 w-full rounded-[8px] border border-[#E0E0E0] bg-white px-[14px] text-[14px] text-[#111111] outline-none transition focus:border-[#111111]"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[13px] font-medium text-[#555555]">Number of uses</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={maxUses}
                      onChange={(e) => { setMaxUses(e.target.value); setFormError(""); }}
                      className="h-11 w-full rounded-[8px] border border-[#E0E0E0] bg-white px-[14px] text-[14px] text-[#111111] outline-none transition focus:border-[#111111]"
                    />
                  </div>
                </TabsContent>
              </Tabs>

              {formError && <p className="text-[12px] text-[#8d8d8d]">{formError}</p>}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Generate"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Main page */}
      <DashboardPageShell
        title="Invites"
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => { resetCreateState(); setCreateModalOpen(true); }}
            className="gap-1.5"
          >
            <Plus size={14} strokeWidth={2.5} />
            New invite
          </Button>
        }
      >
        <Tabs
          value={showAll ? "all" : "active"}
          onValueChange={(v) => setShowAll(v === "all")}
          className="w-full"
        >
          <div className="flex items-center justify-between gap-4 pb-3">
            <p className="text-[14px] leading-[1.55] text-[#7d7d7d]">
              Codes are single-use; links can be reused up to their limit.
            </p>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </div>

          {(["active", "all"] as const).map((tab) => (
            <TabsContent key={tab} value={tab}>
              {invites === undefined ? (
                <InvitesSkeleton />
              ) : invites.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-[#b0b0b0]">
                  No invites yet — create one to onboard your first member.
                </p>
              ) : (
                <div className="overflow-hidden rounded-[10px] border border-[#E0E0E0] bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-[#E0E0E0]">
                        <TableHead className="w-8 pl-4" />
                        <TableHead>For / Type</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="pr-4 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invites.map((invite) => {
                        const status = inviteStatus(invite as InviteRow);
                        const stateLabel = inviteStateLabel(invite as InviteRow);
                        const revokable = isRevokable(invite as InviteRow);
                        const isLink = invite.max_uses != null;
                        const label = isLink
                          ? `Link · ${invite.max_uses} use${invite.max_uses !== 1 ? "s" : ""}`
                          : (invite.invited_email ?? "—");
                        const revealed = revealedIds.has(invite._id);

                        return (
                          <TableRow key={invite._id} className="border-b border-[#F0F0F0]">
                            <TableCell className="pl-4">
                              <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${statusDot[status]}`} />
                            </TableCell>

                            <TableCell>
                              <span className="text-[13px] font-medium text-[#202020]">{label}</span>
                            </TableCell>

                            <TableCell>
                              <RevealCell
                                code={invite.code}
                                revealed={revealed}
                                onToggle={() => toggleRevealed(invite._id)}
                              />
                            </TableCell>

                            <TableCell>
                              {invite.grants_role === "admin" ? (
                                <span className="inline-flex items-center rounded-full bg-[#0a0a0a] px-2 py-0.5 text-[11px] font-medium text-white">
                                  Admin
                                </span>
                              ) : invite.grants_role ? (
                                <span className="text-[12px] text-[#4d4d4d]">{invite.grants_role}</span>
                              ) : (
                                <span className="text-[12px] text-[#c0c0c0]">—</span>
                              )}
                            </TableCell>

                            <TableCell>
                              <span className={`text-[12px] font-medium ${statusText[status]}`}>
                                {stateLabel}
                              </span>
                            </TableCell>

                            <TableCell className="pr-4">
                              <div className="flex items-center justify-end gap-3">
                                {revokable && (
                                  <CopyIconButton
                                    text={`${signupBase}?code=${invite.code}`}
                                    label="Invite link copied"
                                    tooltip="Copy invitation"
                                  />
                                )}
                                {revokable && (
                                  <button
                                    type="button"
                                    onClick={() => setRevokeTarget({ id: invite._id, label })}
                                    className="text-[12px] font-medium text-[#c0c0c0] transition hover:text-[#8d8d8d]"
                                  >
                                    Revoke
                                  </button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </DashboardPageShell>
    </>
    </TooltipProvider>
  );
}
