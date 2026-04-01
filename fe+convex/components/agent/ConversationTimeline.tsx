"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentMessage, AgentApproval, AgentThread } from "./types";
import { MessageBubble } from "./MessageBubble";
import { ApprovalCard } from "./ApprovalCard";
import { AgentInput } from "./AgentInput";
import {
  getThreadMessages,
  getThreadApprovals,
  startRun,
} from "./adapters/mock";

interface ConversationTimelineProps {
  thread: AgentThread | null;
  onArtifactsChange?: () => void;
}

export function ConversationTimeline({ thread, onArtifactsChange }: ConversationTimelineProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!thread) {
      setMessages([]);
      setApprovals([]);
      setLoaded(true);
      return;
    }

    if (thread.id === threadIdRef.current) return;
    threadIdRef.current = thread.id;
    setLoaded(false);
    setMessages([]);
    setApprovals([]);
    setStreamingText(null);

    Promise.all([getThreadMessages(thread.id), getThreadApprovals(thread.id)]).then(
      ([msgs, apps]) => {
        if (threadIdRef.current !== thread.id) return;
        setMessages(msgs);
        setApprovals(apps);
        setLoaded(true);
      },
    );
  }, [thread]);

  // Scroll to bottom when messages change or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  async function handleSend(text: string) {
    if (!thread || isRunning) return;
    setIsRunning(true);
    setStreamingText("");

    // Optimistically show user message
    const optimisticUser: AgentMessage = {
      id: `opt-user-${Date.now()}`,
      threadId: thread.id,
      role: "user",
      content: [{ type: "text", text }],
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      await startRun(
        thread.id,
        text,
        (chunk) => setStreamingText(chunk),
        (done) => {
          setStreamingText(null);
          // Replace optimistic user message with real messages from adapter
          setMessages((prev) => {
            const withoutOptimistic = prev.filter((m) => m.id !== optimisticUser.id);
            return [...withoutOptimistic, optimisticUser, done];
          });
          onArtifactsChange?.();
        },
      );
    } finally {
      setIsRunning(false);
      setStreamingText(null);
    }
  }

  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  if (!thread) {
    return (
      <div className="flex flex-1 flex-col">
        <EmptyThreadState />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {!loaded ? (
          <MessageSkeletons />
        ) : messages.length === 0 && !isRunning ? (
          <ThreadEmptyState threadTitle={thread.title} />
        ) : (
          <div className="mx-auto max-w-[700px] space-y-4 px-5 py-5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Streaming assistant message */}
            {isRunning && streamingText !== null && (
              <div className="flex gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A0A0A]">
                  <span className="text-[9px] font-bold text-white">AI</span>
                </div>
                <div className="max-w-[78%]">
                  <div className="rounded-[12px] rounded-tl-[4px] bg-[#F4F4F4] px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-[#111111]">
                    {streamingText || (
                      <span className="flex items-center gap-1.5">
                        <ThinkingDots />
                      </span>
                    )}
                    {streamingText && (
                      <>
                        {" "}
                        <span
                          className="inline-block h-[13px] w-[2px] translate-y-[1px] rounded-full bg-[#555555] opacity-60"
                          style={{ animation: "cursorBlink 900ms ease-in-out infinite" }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Pending approvals */}
            {pendingApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onDecision={() => {
                  setApprovals((prev) =>
                    prev.map((a) =>
                      a.id === approval.id ? { ...a, status: "approved" } : a,
                    ),
                  );
                }}
              />
            ))}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <AgentInput
        onSubmit={handleSend}
        disabled={isRunning}
        placeholder={isRunning ? "Agent is working…" : "Message the agent…"}
      />

      <style>{`
        @keyframes cursorBlink {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[#BBBBBB]"
          style={{
            animation: "dotPulse 1.2s ease-in-out infinite",
            animationDelay: `${i * 200}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  );
}

function MessageSkeletons() {
  return (
    <div className="mx-auto max-w-[700px] space-y-4 px-5 py-5">
      {[70, 55, 80].map((w, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
          <div
            className="h-9 animate-pulse rounded-[12px] bg-[#F0F0F0]"
            style={{ width: `${w}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyThreadState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-[13px] text-[#BBBBBB]">Select a conversation or start a new one.</p>
    </div>
  );
}

function ThreadEmptyState({ threadTitle }: { threadTitle: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-[13.5px] font-medium text-[#333333]">{threadTitle}</p>
      <p className="text-[12.5px] text-[#BBBBBB]">Send a message to get started.</p>
    </div>
  );
}
