/**
 * Mock adapter for the agent workspace.
 *
 * This module stands in for real Modal + Convex endpoints while backend
 * contracts are being finalized. Replace the functions here with real API
 * calls once the Modal runtime and Convex persistence layers are ready.
 *
 * Contract surface this adapter must match:
 *   POST /agent/threads      → createThread()
 *   GET  /agent/threads      → listThreads()
 *   GET  /agent/threads/:id  → getThreadState()
 *   POST /agent/runs         → startRun()
 *   POST /agent/approvals/:id → submitApproval()
 */

import type {
  AgentThread,
  AgentMessage,
  AgentArtifact,
  AgentApproval,
  AgentRun,
} from "../types";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const THREADS: AgentThread[] = [
  {
    id: "thread-1",
    title: "Spring 2025 speaker outreach",
    channel: "web",
    lastMessage: "I found 8 candidates matching the target profile.",
    lastActivityAt: Date.now() - 1000 * 60 * 12,
    contextLinks: [{ type: "event", id: "evt-01", label: "Spring 2025" }],
  },
  {
    id: "thread-2",
    title: "Room availability check",
    channel: "web",
    lastMessage: "Staller 104 is open on April 18th.",
    lastActivityAt: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: "thread-3",
    title: "Communications review",
    channel: "discord",
    lastMessage: "Draft email ready for your review.",
    lastActivityAt: Date.now() - 1000 * 60 * 60 * 24,
  },
];

const MESSAGES: Record<string, AgentMessage[]> = {
  "thread-1": [
    {
      id: "msg-1a",
      threadId: "thread-1",
      role: "user",
      content: [{ type: "text", text: "Find speakers for the Spring 2025 event." }],
      createdAt: Date.now() - 1000 * 60 * 15,
    },
    {
      id: "msg-1b",
      threadId: "thread-1",
      role: "assistant",
      content: [
        {
          type: "tool_use",
          name: "attio_search_speakers",
          input: { status: "Prospect", limit: 20 },
        },
      ],
      createdAt: Date.now() - 1000 * 60 * 14,
    },
    {
      id: "msg-1c",
      threadId: "thread-1",
      role: "tool",
      content: [{ type: "tool_result", content: "Found 8 candidates." }],
      createdAt: Date.now() - 1000 * 60 * 14,
    },
    {
      id: "msg-1d",
      threadId: "thread-1",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "I found 8 candidates matching the target profile for Spring 2025. I've compiled their details into a table below. Three are strong fits based on previous engagement — I'd suggest starting outreach with those.",
        },
      ],
      artifactIds: ["artifact-1"],
      createdAt: Date.now() - 1000 * 60 * 12,
    },
  ],
  "thread-2": [
    {
      id: "msg-2a",
      threadId: "thread-2",
      role: "user",
      content: [{ type: "text", text: "Is Staller 104 available on April 18th?" }],
      createdAt: Date.now() - 1000 * 60 * 60 * 2 - 2000,
    },
    {
      id: "msg-2b",
      threadId: "thread-2",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Staller 104 is open on April 18th from 6:00 PM to 9:00 PM. Would you like me to prepare a room booking request?",
        },
      ],
      createdAt: Date.now() - 1000 * 60 * 60 * 2,
    },
  ],
  "thread-3": [
    {
      id: "msg-3a",
      threadId: "thread-3",
      role: "user",
      content: [{ type: "text", text: "Draft an outreach email for the shortlisted speakers." }],
      createdAt: Date.now() - 1000 * 60 * 60 * 24 - 5000,
    },
    {
      id: "msg-3b",
      threadId: "thread-3",
      role: "assistant",
      content: [
        {
          type: "text",
          text: 'Draft email ready. Subject: "Speaking Opportunity — Spring 2025 Tech Event". Should I send it to the 3 shortlisted speakers, or would you like to review first?',
        },
      ],
      createdAt: Date.now() - 1000 * 60 * 60 * 24,
    },
  ],
};

const ARTIFACTS: Record<string, AgentArtifact> = {
  "artifact-1": {
    id: "artifact-1",
    threadId: "thread-1",
    type: "table",
    title: "Speaker Candidates — Spring 2025",
    data: {
      columns: ["Name", "Title", "Status", "Fit"],
      rows: [
        ["Priya Anand", "Staff Eng, Stripe", "Prospect", "High"],
        ["Marcus Osei", "PM, Linear", "Engaged", "High"],
        ["Sara Kim", "Founder, Daylight", "Prospect", "High"],
        ["James Park", "EM, Vercel", "Prospect", "Medium"],
        ["Leila Nouri", "Designer, Figma", "Declined", "Low"],
        ["Tom Walsh", "CTO, Interval", "Prospect", "Medium"],
        ["Ana Carvalho", "Eng, Clerk", "Prospect", "Medium"],
        ["Dev Patel", "Staff Eng, Retool", "Prospect", "Low"],
      ],
    },
    createdAt: Date.now() - 1000 * 60 * 12,
  },
};

const APPROVALS: Record<string, AgentApproval[]> = {
  "thread-3": [
    {
      id: "approval-1",
      threadId: "thread-3",
      runId: "run-3",
      requestedAction: "Send outreach emails to 3 speakers",
      riskLevel: "medium",
      proposedPayload: {
        recipients: ["Priya Anand", "Marcus Osei", "Sara Kim"],
        subject: "Speaking Opportunity — Spring 2025 Tech Event",
        templateId: "outreach-v2",
      },
      status: "pending",
      createdAt: Date.now() - 1000 * 60 * 60 * 24 + 1000,
    },
  ],
};

// ---------------------------------------------------------------------------
// Adapter functions  (replace with real API calls)
// ---------------------------------------------------------------------------

export async function listThreads(): Promise<AgentThread[]> {
  await delay(120);
  return [...THREADS];
}

export async function getThreadMessages(threadId: string): Promise<AgentMessage[]> {
  await delay(80);
  return MESSAGES[threadId] ?? [];
}

export async function getThreadArtifacts(threadId: string): Promise<AgentArtifact[]> {
  await delay(60);
  const thread = THREADS.find((t) => t.id === threadId);
  if (!thread) return [];
  const msgs = MESSAGES[threadId] ?? [];
  const artifactIds = msgs.flatMap((m) => m.artifactIds ?? []);
  return artifactIds.map((id) => ARTIFACTS[id]).filter(Boolean) as AgentArtifact[];
}

export async function getThreadApprovals(threadId: string): Promise<AgentApproval[]> {
  await delay(60);
  return APPROVALS[threadId] ?? [];
}

export async function createThread(title?: string): Promise<AgentThread> {
  await delay(200);
  const thread: AgentThread = {
    id: `thread-${Date.now()}`,
    title: title ?? "New conversation",
    channel: "web",
    lastActivityAt: Date.now(),
  };
  THREADS.unshift(thread);
  MESSAGES[thread.id] = [];
  return thread;
}

/**
 * Simulates streaming a modal run response by calling onChunk incrementally.
 * Replace with SSE from GET /agent/runs/:id/stream.
 */
export async function startRun(
  threadId: string,
  userMessage: string,
  onChunk: (text: string) => void,
  onDone: (message: AgentMessage) => void,
): Promise<void> {
  const userMsg: AgentMessage = {
    id: `msg-${Date.now()}-user`,
    threadId,
    role: "user",
    content: [{ type: "text", text: userMessage }],
    createdAt: Date.now(),
  };
  if (!MESSAGES[threadId]) MESSAGES[threadId] = [];
  MESSAGES[threadId].push(userMsg);

  await delay(400);

  const reply =
    "I'm processing your request. This is a mocked response — the real Modal runtime will replace this with streamed agent output once the backend contracts are ready.";

  let accumulated = "";
  for (const char of reply) {
    accumulated += char;
    onChunk(accumulated);
    await delay(18);
  }

  const assistantMsg: AgentMessage = {
    id: `msg-${Date.now()}-assistant`,
    threadId,
    role: "assistant",
    content: [{ type: "text", text: reply }],
    createdAt: Date.now(),
  };
  MESSAGES[threadId].push(assistantMsg);

  const thread = THREADS.find((t) => t.id === threadId);
  if (thread) {
    thread.lastMessage = reply.slice(0, 80);
    thread.lastActivityAt = Date.now();
  }

  onDone(assistantMsg);
}

export async function submitApproval(
  approvalId: string,
  decision: "approved" | "rejected",
): Promise<void> {
  await delay(300);
  for (const approvals of Object.values(APPROVALS)) {
    const approval = approvals.find((a) => a.id === approvalId);
    if (approval) {
      approval.status = decision;
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
