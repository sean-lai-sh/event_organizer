import type {
  AgentApproval,
  AgentArtifact,
  ChoiceRequestPayload,
  AgentMessage,
  AgentRun,
  AgentThread,
  AgentThreadState,
  ContentBlock,
  FormRequestPayload,
  ReportBlock,
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

type BackendThreadState = {
  thread: BackendThread;
  runs: BackendRun[];
  messages: BackendMessage[];
  artifacts: BackendArtifact[];
  approvals: BackendApproval[];
};

type RunStreamEvent = {
  event: string;
  data: Record<string, unknown>;
};

type RunWithEventsResponse = {
  run: BackendRun & { error_message?: string | null };
  events: RunStreamEvent[];
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

function parseJson(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
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

export function mapContentBlock(block: BackendContentBlock): ContentBlock {
  if (block.kind === "text" || block.kind === "markdown") {
    return {
      type: "text",
      text: block.text ?? "",
      format: block.kind === "markdown" ? "markdown" : "plain",
    };
  }

  const data = parseJson(block.data_json);
  if (block.kind === "form_request" && data) {
    return {
      type: "form_request",
      payload: {
        requestId: String(data.request_id ?? data.requestId ?? ""),
        entity: "event",
        mode: data.mode === "update" ? "update" : "create",
        title: String(data.title ?? "Event details"),
        submitLabel: typeof data.submit_label === "string" ? data.submit_label : undefined,
        fields: Array.isArray(data.fields)
          ? data.fields.map((field) => ({
              key: String(field.key ?? ""),
              label: String(field.label ?? field.key ?? ""),
              inputType: String(field.input_type ?? field.inputType ?? "text") as FormRequestPayload["fields"][number]["inputType"],
              required: field.required === true,
              placeholder: typeof field.placeholder === "string" ? field.placeholder : undefined,
              defaultValue:
                typeof field.default_value === "string" || typeof field.default_value === "boolean"
                  ? field.default_value
                  : typeof field.defaultValue === "string" || typeof field.defaultValue === "boolean"
                    ? field.defaultValue
                    : undefined,
              options: Array.isArray(field.options)
                ? field.options.map((option: Record<string, unknown>) => ({
                    value: String(option.value ?? ""),
                    label: String(option.label ?? option.value ?? ""),
                  }))
                : undefined,
            }))
          : [],
      },
    };
  }

  if (block.kind === "choice_request" && data) {
    return {
      type: "choice_request",
      payload: {
        requestId: String(data.request_id ?? data.requestId ?? ""),
        entity: "event",
        mode: data.mode === "create" ? "create" : "update",
        question: String(data.question ?? "Choose an event"),
        choices: Array.isArray(data.choices)
          ? data.choices.map((choice) => ({
              id: String(choice.id ?? ""),
              label: String(choice.label ?? choice.id ?? ""),
              description:
                typeof choice.description === "string" ? choice.description : undefined,
            }))
          : [],
      } satisfies ChoiceRequestPayload,
    };
  }

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
        : { blocks },
    createdAt: artifact.created_at,
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

function mapRun(run: BackendRun): AgentRun {
  return {
    id: run.external_id,
    threadId: run.thread_external_id,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.completed_at ?? undefined,
  };
}

function typewriterReveal(text: string, onChunk: (text: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const words = text.split(" ");
    let revealed = "";
    let i = 0;
    // Vary speed slightly so it feels natural, not robotic
    const step = () => {
      if (i >= words.length) {
        resolve();
        return;
      }
      revealed += (i === 0 ? "" : " ") + words[i];
      onChunk(revealed);
      i++;
      // ~60-120ms per word feels natural for reading speed
      const delay = 60 + Math.random() * 40;
      setTimeout(step, delay);
    };
    step();
  });
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

export async function startRun(
  threadId: string,
  userMessage: string,
  onChunk: (text: string) => void
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

  // Find the final assistant text from events and reveal it with a typewriter animation
  const finalText = result.events
    .filter((e) => e.event === "assistant.delta")
    .map((e) => e.data.text as string)
    .filter(Boolean)
    .at(-1);

  if (finalText) {
    await typewriterReveal(finalText, onChunk);
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
  decision: "approved" | "rejected"
): Promise<void> {
  await request(`/approvals/${encodeURIComponent(approvalId)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ decision }),
  });
}
