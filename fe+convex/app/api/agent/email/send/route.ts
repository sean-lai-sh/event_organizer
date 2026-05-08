import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { getSessionCookie } from "better-auth/cookies";
import { AgentMailClient } from "agentmail";
import { api } from "@/convex/_generated/api";

export const dynamic = "force-dynamic";

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
  // Better Auth session check — same lightweight pattern used by middleware.ts.
  // Without this, an unauthenticated POST could trigger an outbound send.
  if (!getSessionCookie(request)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  const sb = convex();
  const token = agentToken();

  // Step 1: flip the draft to "sending" so the FE card shows progress.
  // If this fails (e.g. terminal status), we don't attempt the send.
  try {
    await sb.mutation(api.emailDrafts.markSending, {
      external_id: draftId,
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

  // Step 2: send via AgentMail.
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
