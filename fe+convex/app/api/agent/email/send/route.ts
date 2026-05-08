import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { AgentMailClient } from "agentmail";
import { api } from "@/convex/_generated/api";

export const dynamic = "force-dynamic";

interface ValidatedSession {
  userId: string;
}

/**
 * Validate the Better Auth session by hitting the auth get-session endpoint
 * with the request's cookies. Mere presence of a session cookie (the
 * `getSessionCookie` helper) is not sufficient — that only checks for a
 * cookie, not a live session.
 */
async function validateSession(
  request: NextRequest
): Promise<ValidatedSession | null> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const url = new URL("/api/auth/get-session", request.url);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { cookie },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as
    | { user?: { id?: unknown } }
    | null;
  const userId = data?.user?.id;
  return typeof userId === "string" && userId.length > 0
    ? { userId }
    : null;
}

interface SendBody {
  draft_id?: unknown;
  to_name?: unknown;
  to_email?: unknown;
  subject?: unknown;
  body?: unknown;
  from_name?: unknown;
  from_email?: unknown;
  signature?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function convex() {
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
}

function agentToken(): string | undefined {
  return process.env.AGENT_SERVICE_TOKEN;
}

export async function POST(request: NextRequest) {
  // Real Better Auth session validation. Cookie-presence checks (as used by
  // middleware.ts as a perf optimization) are not sufficient here — this
  // route triggers outbound email, so we need a live, server-validated
  // session and an active admin membership before proceeding.
  const session = await validateSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = agentToken();
  if (!token) {
    return NextResponse.json(
      { error: "AGENT_SERVICE_TOKEN is not configured on the server" },
      { status: 500 }
    );
  }

  const sb = convex();
  let isAdmin: boolean;
  try {
    isAdmin = await sb.query(api.eboard.isAdminByUserId, {
      userId: session.userId,
      _agent_token: token,
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const draftId = asString(body.draft_id);
  const toName = asString(body.to_name);
  const toEmail = asString(body.to_email);
  const subject = asString(body.subject);
  const messageBody = asString(body.body);
  const signature = asString(body.signature);

  if (!draftId || !toEmail || !subject || !messageBody) {
    return NextResponse.json(
      {
        error:
          "draft_id, to_email, subject, and body are required",
      },
      { status: 400 }
    );
  }

  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AGENTMAIL_API_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  const inboxId =
    process.env.AGENTMAIL_INBOX_ID ?? "events-technyu@agentmail.to";

  // Step 1: persist the latest in-card field values before locking the draft.
  // The FE blurs and immediately POSTs, so an in-flight `updateDraftFields`
  // mutation may lose the race against `markSending` and silently fail
  // (status check rejects edits to non-`draft` rows). Doing the field
  // update server-side, before the lock, removes that race.
  try {
    await sb.mutation(api.emailDrafts.updateDraftFields, {
      external_id: draftId,
      to_name: toName,
      to_email: toEmail,
      subject,
      body: messageBody,
      _agent_token: token,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "failed",
        error:
          err instanceof Error
            ? err.message
            : "Could not persist draft fields",
      },
      { status: 409 }
    );
  }

  // Step 2: flip the draft to "sending" so the FE card shows progress.
  // If this fails (e.g. already sending / terminal status), we don't
  // attempt the send. `markSending` only accepts rows still in `draft`,
  // which is the lock against double-submits.
  try {
    await sb.mutation(api.emailDrafts.markSending, {
      external_id: draftId,
      sent_by_user_id: session.userId,
      _agent_token: token,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "failed",
        error: err instanceof Error ? err.message : "Could not mark draft as sending",
      },
      { status: 409 }
    );
  }

  // Step 3: send via AgentMail.
  const client = new AgentMailClient({ apiKey });
  const fullText = signature
    ? `${messageBody.trimEnd()}\n\n${signature}`
    : messageBody;

  try {
    const recipient = toName ? `${toName} <${toEmail}>` : toEmail;
    const result = await client.inboxes.messages.send(inboxId, {
      to: recipient,
      subject,
      text: fullText,
      labels: ["outreach"],
    });

    await sb.mutation(api.emailDrafts.markSent, {
      external_id: draftId,
      agentmail_message_id: result.messageId,
      sent_at: Date.now(),
      _agent_token: token,
    });

    return NextResponse.json({
      status: "sent",
      message_id: result.messageId,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AgentMail send failed";
    try {
      await sb.mutation(api.emailDrafts.markFailed, {
        external_id: draftId,
        error_message: message,
        _agent_token: token,
      });
    } catch {
      /* swallow — Convex unavailable; original error still surfaces */
    }
    return NextResponse.json({ status: "failed", error: message }, { status: 502 });
  }
}
