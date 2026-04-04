"use client";

interface AgentEmptyStateProps {
  onPromptSelect: (prompt: string) => void;
}

const EXAMPLE_PROMPTS = [
  "Who are the top speaker prospects for the next event?",
  "Which speakers haven't responded to outreach yet?",
  "Summarize all inbound emails from this week",
  "Draft an outreach email for a confirmed speaker",
] as const;

export function AgentEmptyState({ onPromptSelect }: AgentEmptyStateProps) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[780px] flex-col items-center justify-center px-8 py-10 text-center">
      <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[#111111]">
        What do you need to know today?
      </h2>
      <p className="mt-3 max-w-[520px] text-[14px] text-[#999999]">
        Ask me about speakers, events, outreach  I&apos;ll find the answers.
      </p>

      <div className="mt-10 w-full max-w-[720px] text-left">
        <p className="mb-3 text-[12px] font-semibold tracking-[0.04em] text-[#555555]">TRY:</p>
        <div className="grid grid-cols-2 gap-3">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPromptSelect(prompt)}
              className="rounded-[10px] border border-[#E0E0E0] bg-[#FAFAFA] px-4 py-3 text-left text-[13px] leading-[1.5] text-[#333333] transition-colors duration-100 hover:bg-[#F4F4F4]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
