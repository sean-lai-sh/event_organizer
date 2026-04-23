import type {
  AgentApproval,
  AgentArtifact,
  AgentMessage,
  AgentRun,
  AgentThread,
  AgentThreadState,
  AgentTraceStep,
  ContentBlock,
  ReportBlock,
  TraceStepKind,
} from "../types";

type BackendThread = {
  external_id: string;
  channel: "web" | "discord";
  title?: string | null;
  summary?: string | null;
  last_message_at?: number | null;
  last_run_started_at?: number | null;
  updated_at: number;
};

type BackendRun = {
  external_id: string;
  thread_external_id: string;
  status: AgentRun["status"];
  started_at: number;
  completed_at?: number | null;
};

type BackendContentBlock = {
  kind: string;
  label?: string | null;
  text?: string | null;
  mime_type?: string | null;
  data_json?: string | null;
  url?: string | null;
};

type BackendMessage = {
  external_id: string;
  thread_external_id: string;
  role: string;
  status?: string | null;
  plain_text?: string | null;
  content_blocks: BackendContentBlock[];
  created_at: number;
};

type BackendArtifact = {
  external_id: string;
  thread_external_id: string;
  kind: AgentArtifact["type"];
  title?: string | null;
  summary?: string | null;
  content_blocks: BackendContentBlock[];
  created_at: number;
};

type BackendApproval = {
  external_id: string;
  thread_external_id: string;
  run_external_id: string;
  title: string;
  payload_json?: string | null;
  status: AgentApproval["status"];
  risk_level: AgentApproval["riskLevel"];
  requested_at: number;
};

type BackendTrace = {
  external_id: string;
  run_external_id: string;
  kind: string;
  sequence_number: number;
  summary: string;
  detail_json?: string | null;
  status: string;
  created_at: number;
};

type BackendThreadState = {
  thread: BackendThread;
  runs: BackendRun[];
  messages: BackendMessage[];
  artifacts: BackendArtifact[];
  approvals: BackendApproval[];
  traces?: BackendTrace[];
};

type RunStreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

// Kept for backward compatibility with existing web callers.
type RunWithEventsResponse = {
  run: BackendRun & { error_message?: string | null };
  events: RunStreamEvent[];
  traces?: BackendTrace[];
};

const API_BASE = "/api/agent";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Agent request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function parseJson<T>(value?: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapThread(thread: BackendThread): AgentThread {
  return {
    id: thread.external_id,
    title: thread.title ?? "New conversation",
    channel: thread.channel,
    lastMessage: thread.summary ?? undefined,
    lastActivityAt:
      thread.last_message_at ?? thread.last_run_started_at ?? thread.updated_at,
  };
}

function mapContentBlock(block: BackendContentBlock): ContentBlock {
  if (block.kind === "text" || block.kind === "markdown") {
    return {
      type: "text",
      text: block.text ?? "",
      format: block.kind === "markdown" ? "markdown" : "plain",
    };
  }

  const data = parseJson<Record<string, unknown>>(block.data_json);
  if (block.kind === "tool_use") {
    return {
      type: "tool_use",
      name: block.label ?? "tool",
      input: data ?? undefined,
    };
  }

  return {
    type: "tool_result",
    content: block.text ?? block.label ?? block.kind,
  };
}

function mapMessage(message: BackendMessage): AgentMessage {
  const content = message.content_blocks.map(mapContentBlock);
  return {
    id: message.external_id,
    threadId: message.thread_external_id,
    role: message.role === "tool" ? "tool" : message.role === "user" ? "user" : "assistant",
    content:
      content.length > 0
        ? content
        : [{ type: "text", text: message.plain_text ?? "" }],
    createdAt: message.created_at,
    isStreaming: message.status === "streaming",
  };
}

function mapArtifact(artifact: BackendArtifact): AgentArtifact {
  const blocks: ReportBlock[] = artifact.content_blocks.map((block) => ({
    kind: block.kind,
    label: block.label,
    text: block.text,
    mimeType: block.mime_type,
    dataJson: block.data_json,
    url: block.url,
  }));

  return {
    id: artifact.external_id,
    threadId: artifact.thread_external_id,
    type: artifact.kind,
    title: artifact.title ?? "Artifact",
    data:
      artifact.kind === "report"
        ? {
            summary: artifact.summary ?? null,
            blocks,
          }
        : artifact.kind === "checklist"
          ? mapChecklistArtifact(blocks)
        : { blocks },
    createdAt: artifact.created_at,
  };
}

function mapChecklistArtifact(blocks: ReportBlock[]) {
  const payload = blocks.find((block) => block.kind === "checklist_data")?.dataJson;
  const parsed = parseJson<{ items?: Array<Record<string, unknown>> }>(payload);
  if (parsed?.items && Array.isArray(parsed.items)) {
    return {
      items: parsed.items
        .map((item, index) => normalizeChecklistItem(item, index))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    };
  }

  const items = blocks
    .filter((block) => block.kind === "text" && block.text)
    .flatMap((block) => (block.text ?? "").split("\n"))
    .map((line) => line.replace(/^\s*[-*+]\s+/, "").trim())
    .filter(Boolean)
    .map((label, index) => ({
      id: `todo_${index + 1}`,
      label,
      checked: false,
    }));

  return { items };
}

function normalizeChecklistItem(item: Record<string, unknown>, index: number) {
  if (typeof item.label !== "string" || item.label.trim().length === 0) {
    return null;
  }

  return {
    id: typeof item.id === "string" && item.id.trim().length > 0 ? item.id : `todo_${index + 1}`,
    label: item.label.trim(),
    checked: item.checked === true,
    notes: typeof item.notes === "string" ? item.notes : undefined,
  };
}

function mapApproval(approval: BackendApproval): AgentApproval {
  return {
    id: approval.external_id,
    threadId: approval.thread_external_id,
    runId: approval.run_external_id,
    requestedAction: approval.title,
    riskLevel: approval.risk_level,
    proposedPayload: parseJson(approval.payload_json) ?? {},
    status: approval.status,
    createdAt: approval.requested_at,
  };
}

function mapTrace(trace: BackendTrace): AgentTraceStep {
  return {
    id: trace.external_id,
    runId: trace.run_external_id,
    kind: trace.kind as TraceStepKind,
    sequenceNumber: trace.sequence_number,
    summary: trace.summary,
    detailJson: trace.detail_json,
    status: trace.status,
    createdAt: trace.created_at,
  };
}

function mapRun(run: BackendRun): AgentRun {
  return {
    id: run.external_id,
    threadId: run.thread_external_id,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.completed_at ?? undefined,
  };
}

export async function listThreads(): Promise<AgentThread[]> {
  const threads = await request<BackendThread[]>("/threads");
  return threads.map(mapThread);
}

export async function getThreadState(threadId: string): Promise<AgentThreadState> {
  const state = await request<BackendThreadState>(
    `/threads/${encodeURIComponent(threadId)}`
  );

  return {
    thread: mapThread(state.thread),
    runs: state.runs.map(mapRun),
    messages: state.messages.map(mapMessage),
    artifacts: state.artifacts.map(mapArtifact),
    approvals: state.approvals.map(mapApproval),
    traces: (state.traces ?? []).map(mapTrace),
  };
}

export async function getThreadMessages(threadId: string): Promise<AgentMessage[]> {
  const state = await getThreadState(threadId);
  return state.messages;
}

export async function getThreadArtifacts(threadId: string): Promise<AgentArtifact[]> {
  const state = await getThreadState(threadId);
  return state.artifacts;
}

export async function getThreadApprovals(threadId: string): Promise<AgentApproval[]> {
  const state = await getThreadState(threadId);
  return state.approvals;
}

export async function createThread(title?: string): Promise<AgentThread> {
  const thread = await request<BackendThread>("/threads", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      channel: "web",
      title: title ?? "New conversation",
    }),
  });
  return mapThread(thread);
}

/**
 * Start a run against the backend. The backend now persists streaming assistant
 * messages into Convex in real time, so the UI should rely on reactive
 * `useQuery` subscriptions to render live updates rather than local typewriter
 * replay. This function fires the POST and throws on error but does not
 * attempt local text animation.
 */
export async function startRun(
  threadId: string,
  userMessage: string,
): Promise<void> {
  const result = await request<RunWithEventsResponse>("/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      input_text: userMessage,
      trigger_source: "web",
    }),
  });

  if (result.run.error_message) {
    throw new Error(result.run.error_message);
  }
}

export async function renameThread(
  threadId: string,
  title: string
): Promise<AgentThread> {
  const thread = await request<BackendThread>(
    `/threads/${encodeURIComponent(threadId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }
  );
  return mapThread(thread);
}

export async function deleteThread(threadId: string): Promise<void> {
  await request<void>(`/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
}

export async function submitApproval(
  approvalId: string,
  decision: "approved" | "rejected",
  overrideArgs?: Record<string, unknown>,
): Promise<void> {
  await request(`/approvals/${encodeURIComponent(approvalId)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      decision,
      ...(overrideArgs && Object.keys(overrideArgs).length > 0 ? { override_args: overrideArgs } : {}),
    }),
  });
}
