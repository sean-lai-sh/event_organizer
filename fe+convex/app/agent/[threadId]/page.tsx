import { AgentShell } from "../AgentShell";

export default async function AgentThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <AgentShell activeThreadId={threadId} />;
}
