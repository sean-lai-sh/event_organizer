export type MessageRole = "user" | "assistant" | "tool";
export type RunStatus = "idle" | "running" | "paused_approval" | "completed" | "error";
export type ArtifactType =
  | "metric_group"
  | "table"
  | "timeline"
  | "checklist"
  | "report"
  | "chart"
  | "link_bundle";
export type RiskLevel = "low" | "medium" | "high";

export interface AgentThread {
  _id?: string;
  id: string;
  title: string;
  channel: "web" | "discord";
  lastMessage?: string;
  lastActivityAt: number;
  contextLinks?: ContextLink[];
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | FormRequestBlock
  | ChoiceRequestBlock;

export interface TextBlock {
  type: "text";
  text: string;
  format?: "plain" | "markdown";
}

export interface ToolUseBlock {
  type: "tool_use";
  name: string;
  input?: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  content: string;
}

export type QuestionEntity = "event";
export type QuestionMode = "create" | "update";
export type QuestionInputType =
  | "text"
  | "textarea"
  | "date"
  | "time"
  | "select"
  | "checkbox";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface FormRequestField {
  key: string;
  label: string;
  inputType: QuestionInputType;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | boolean;
  options?: QuestionOption[];
}

export interface FormRequestPayload {
  requestId: string;
  entity: QuestionEntity;
  mode: QuestionMode;
  title: string;
  submitLabel?: string;
  fields: FormRequestField[];
}

export interface ChoiceRequestOption {
  id: string;
  label: string;
  description?: string;
}

export interface ChoiceRequestPayload {
  requestId: string;
  entity: QuestionEntity;
  mode: QuestionMode;
  question: string;
  choices: ChoiceRequestOption[];
}

export interface FormRequestBlock {
  type: "form_request";
  payload: FormRequestPayload;
}

export interface ChoiceRequestBlock {
  type: "choice_request";
  payload: ChoiceRequestPayload;
}

export interface AgentMessage {
  id: string;
  threadId: string;
  role: MessageRole;
  content: ContentBlock[];
  artifactIds?: string[];
  createdAt: number;
  isStreaming?: boolean;
}

export interface MetricItem {
  label: string;
  value: string | number;
  delta?: string;
  deltaDirection?: "up" | "down" | "neutral";
}

export interface MetricGroupData {
  metrics: MetricItem[];
}

export interface TableData {
  columns: string[];
  rows: (string | number | null)[][];
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  notes?: string;
}

export interface ChecklistData {
  items: ChecklistItem[];
}

export interface ReportBlock {
  kind: string;
  label?: string | null;
  text?: string | null;
  mimeType?: string | null;
  dataJson?: string | null;
  url?: string | null;
}

export interface ReportData {
  summary?: string | null;
  blocks: ReportBlock[];
}

export interface AgentArtifact {
  id: string;
  threadId: string;
  type: ArtifactType;
  title: string;
  data:
    | MetricGroupData
    | TableData
    | ChecklistData
    | ReportData
    | Record<string, unknown>;
  createdAt: number;
}

export interface AgentApproval {
  id: string;
  threadId: string;
  runId: string;
  requestedAction: string;
  riskLevel: RiskLevel;
  proposedPayload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface ContextLink {
  type: "event" | "speaker" | "person" | "communication";
  id: string;
  label: string;
}

export interface AgentRun {
  id: string;
  threadId: string;
  status: RunStatus;
  currentStep?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface AgentThreadState {
  thread: AgentThread;
  runs: AgentRun[];
  messages: AgentMessage[];
  artifacts: AgentArtifact[];
  approvals: AgentApproval[];
}
