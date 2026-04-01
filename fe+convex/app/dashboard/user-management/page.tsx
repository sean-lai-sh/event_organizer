"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ShieldCheck, UserPlus } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/PageShell";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";

function AdminRequired() {
  return (
    <DashboardPageShell title="User Management (Admin Only)">
      <div className="flex flex-col gap-3 rounded-[14px] border border-[#E0E0E0] bg-[#F4F4F4] p-5">
        <h2 className="text-[26px] font-semibold tracking-[-1px] text-[#0A0A0A]">
          Admin access required
        </h2>
        <p className="text-[14px] leading-[1.55] text-[#7D7D7D]">
          Only admins can manage users, change roles, and control workspace access.
        </p>
      </div>
    </DashboardPageShell>
  );
}

function formatRole(role?: string | null) {
  if (!role) return "Member";
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCreatedAt(timestamp: number) {
  return new Date(timestamp).toLocaleDateString();
}

export default function UserManagementPage() {
  const currentMember = useQuery(api.eboard.getCurrentMember);
  const members = useQuery(
    api.eboard.listMembers,
    currentMember?.role === "admin" ? { includeInactive: true } : "skip"
  );
  const invites = useQuery(
    api.invites.list,
    currentMember?.role === "admin" ? { includeUsed: false } : "skip"
  );
  const setRole = useMutation(api.eboard.setRole);
  const setActive = useMutation(api.eboard.setActive);

  const [roleLoadingUserId, setRoleLoadingUserId] = useState<string | null>(null);
  const [accessLoadingUserId, setAccessLoadingUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const metrics = useMemo(() => {
    const rows = members ?? [];
    const activeMembers = rows.filter((member) => member.active);
    const admins = activeMembers.filter((member) => member.role === "admin");
    const inactiveMembers = rows.filter((member) => !member.active);
    return {
      totalUsers: rows.length,
      admins: admins.length,
      pendingAccess: invites?.length ?? 0,
      inactiveUsers: inactiveMembers.length,
      activeAdmins: admins,
    };
  }, [invites, members]);

  async function handleRoleChange(userId: string, role: string) {
    setRoleLoadingUserId(userId);
    setFeedback(null);
    setErrorMessage(null);

    try {
      await setRole({ userId, role });
      setFeedback(role === "admin" ? "Admin access updated." : "User role updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update role.");
    } finally {
      setRoleLoadingUserId(null);
    }
  }

  async function handleAccessToggle(userId: string, active: boolean) {
    setAccessLoadingUserId(userId);
    setFeedback(null);
    setErrorMessage(null);

    try {
      await setActive({ userId, active });
      setFeedback(active ? "User restored." : "User access removed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update access.");
    } finally {
      setAccessLoadingUserId(null);
    }
  }

  if (currentMember === undefined) {
    return (
      <DashboardPageShell title="User Management (Admin Only)">
        <section className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-6 text-[14px] text-[#6B6B6B]">
          Loading user management...
        </section>
      </DashboardPageShell>
    );
  }

  if (currentMember?.role !== "admin") {
    return <AdminRequired />;
  }

  return (
    <DashboardPageShell
      title="User Management (Admin Only)"
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/invites">Manage invites</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/invites">
              <UserPlus size={14} strokeWidth={2.2} />
              Invite user
            </Link>
          </Button>
        </div>
      }
    >
      {errorMessage ? (
        <section className="rounded-[8px] border border-[#F3C7CC] bg-[#FFF4F5] px-4 py-3 text-[13px] font-medium text-[#C2182B]">
          {errorMessage}
        </section>
      ) : null}

      {feedback ? (
        <section className="rounded-[8px] border border-[#D9E9D7] bg-[#F5FBF4] px-4 py-3 text-[13px] font-medium text-[#256C2E]">
          {feedback}
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "total users", value: metrics.totalUsers },
          { label: "admins", value: metrics.admins },
          { label: "pending access", value: metrics.pendingAccess },
          { label: "inactive users", value: metrics.inactiveUsers },
        ].map((metric) => (
          <div
            key={metric.label}
            className="flex flex-col gap-2 rounded-[18px] border border-[#E8E8E8] bg-[#F4F4F4] p-4"
          >
            <span className="font-[var(--font-outfit)] text-[34px] font-light leading-none tracking-[-0.04em] text-[#1F1F1F]">
              {metric.value}
            </span>
            <span className="text-[13px] font-medium text-[#767676]">{metric.label}</span>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF]">
          <div className="border-b border-[#EBEBEB] px-4 py-4">
            <h2 className="text-[15px] font-semibold text-[#111111]">User Directory</h2>
            <p className="mt-1 text-[13px] leading-[1.55] text-[#7B7B7B]">
              Review roles, update admin access, and remove people who should no longer be
              able to manage the workspace.
            </p>
          </div>

          {members === undefined ? (
            <div className="p-8 text-center text-[14px] text-[#6B6B6B]">Loading users...</div>
          ) : members.length > 0 ? (
            <Table>
              <TableHeader className="bg-[#F7F7F7]">
                <TableRow className="border-b border-[#EBEBEB] hover:bg-[#F7F7F7]">
                  <TableHead className="px-4 text-[#999999]">User</TableHead>
                  <TableHead className="px-4 text-[#999999]">Role</TableHead>
                  <TableHead className="px-4 text-[#999999]">Joined</TableHead>
                  <TableHead className="px-4 text-[#999999]">Status</TableHead>
                  <TableHead className="px-4 text-[#999999]">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isRoleLoading = roleLoadingUserId === member.userId;
                  const isAccessLoading = accessLoadingUserId === member.userId;

                  return (
                    <TableRow
                      key={member._id}
                      className="border-b border-[#F0F0F0] hover:bg-[#FAFAFA]"
                    >
                      <TableCell className="px-4 py-3.5">
                        <p className="text-[14px] font-medium text-[#111111]">
                          {member.name || "Unknown user"}
                        </p>
                        <p className="text-[12px] text-[#999999]">
                          {member.email || member.userId}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <select
                          value={member.role ?? "member"}
                          disabled={isRoleLoading}
                          onChange={(event) =>
                            void handleRoleChange(member.userId, event.target.value)
                          }
                          className="h-9 rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-3 text-[12px] font-medium text-[#111111] outline-none transition focus:border-[#111111] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-[12px] text-[#6B6B6B]">
                        {formatCreatedAt(member.created_at)}
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <span
                          className={`text-[12px] font-medium ${
                            member.active ? "text-[#15803D]" : "text-[#7B7B7B]"
                          }`}
                        >
                          {member.active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12px] text-[#6B6B6B]">
                            {formatRole(member.role)}
                          </span>
                          <button
                            type="button"
                            disabled={isAccessLoading}
                            onClick={() =>
                              void handleAccessToggle(member.userId, !member.active)
                            }
                            className="text-[12px] font-medium text-[#555555] transition hover:text-[#111111] disabled:cursor-not-allowed disabled:text-[#BBBBBB]"
                          >
                            {isAccessLoading
                              ? "Saving..."
                              : member.active
                                ? "Remove access"
                                : "Restore"}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="p-8 text-center text-[14px] text-[#6B6B6B]">No users found.</div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#111111]" strokeWidth={2.2} />
              <h2 className="text-[15px] font-semibold text-[#111111]">Admin controls</h2>
            </div>
            <p className="mt-2 text-[13px] leading-[1.55] text-[#7B7B7B]">
              Promote trusted organizers to admin or demote them back to member using the
              role selector in the table.
            </p>

            <div className="mt-4 space-y-2">
              {metrics.activeAdmins.length > 0 ? (
                metrics.activeAdmins.map((admin) => (
                  <div
                    key={admin._id}
                    className="rounded-[10px] border border-[#EBEBEB] px-3 py-2.5"
                  >
                    <p className="text-[13px] font-medium text-[#111111]">
                      {admin.name || "Unknown user"}
                    </p>
                    <p className="text-[11px] text-[#7B7B7B]">
                      {admin.email || admin.userId}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-[#7B7B7B]">No active admins found.</p>
              )}
            </div>
          </section>

          <section className="rounded-[14px] border border-[#EBEBEB] bg-[#FFFFFF] p-4">
            <h2 className="text-[15px] font-semibold text-[#111111]">Pending access</h2>
            <p className="mt-2 text-[13px] leading-[1.55] text-[#7B7B7B]">
              Outstanding invite codes waiting to be claimed.
            </p>

            <div className="mt-4 space-y-2">
              {invites === undefined ? (
                <p className="text-[12px] text-[#7B7B7B]">Loading invites...</p>
              ) : invites.length > 0 ? (
                invites.slice(0, 4).map((invite) => (
                  <div
                    key={invite._id}
                    className="rounded-[10px] border border-[#EBEBEB] px-3 py-2.5"
                  >
                    <p className="text-[13px] font-medium text-[#111111]">
                      {invite.invited_email || "Reusable invite link"}
                    </p>
                    <p className="text-[11px] text-[#7B7B7B]">
                      {invite.grants_role ? formatRole(invite.grants_role) : "Member"} access
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-[#7B7B7B]">No pending invites right now.</p>
              )}
            </div>

            <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
              <Link href="/dashboard/invites">Open invite manager</Link>
            </Button>
          </section>
        </div>
      </section>
    </DashboardPageShell>
  );
}
