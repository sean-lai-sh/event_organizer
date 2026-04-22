"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, X } from "lucide-react";
import type {
  AgentArtifact,
  TableData,
  MetricGroupData,
  ChecklistData,
  ReportData,
} from "./types";
import { RichAgentMarkdown } from "./RichAgentMarkdown";

interface ArtifactCanvasProps {
  artifacts: AgentArtifact[];
  onClose?: () => void;
}

export function ArtifactCanvas({ artifacts, onClose }: ArtifactCanvasProps) {
  const [index, setIndex] = useState(artifacts.length - 1);

  const artifact = artifacts[index];

  if (artifacts.length === 0 || !artifact) {
    return (
      <div className="flex h-full items-center justify-center border-l border-[#EBEBEB] bg-[#FAFAFA]">
        <div className="text-center">
          <LayoutGrid className="mx-auto h-7 w-7 text-[#CFCFCF]" strokeWidth={1.5} />
          <p className="mt-3 text-[12px] text-[#BBBBBB]">Artifacts will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-[#EBEBEB] bg-[#FAFAFA]">
      {/* Header */}
      <div className="flex h-[60px] items-center justify-between border-b border-[#EBEBEB] px-4">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[12.5px] font-semibold text-[#111111]"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          >
            {artifact.title}
          </p>
          <p className="text-[11px] text-[#BBBBBB]">{artifact.type.replace("_", " ")}</p>
        </div>
        <div className="flex items-center gap-1 pl-2">
          {artifacts.length > 1 && (
            <>
              <button
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#999999] hover:bg-[#EBEBEB] disabled:opacity-30"
                aria-label="Previous artifact"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-[11px] text-[#BBBBBB]">
                {index + 1}/{artifacts.length}
              </span>
              <button
                onClick={() => setIndex((i) => Math.min(artifacts.length - 1, i + 1))}
                disabled={index === artifacts.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#999999] hover:bg-[#EBEBEB] disabled:opacity-30"
                aria-label="Next artifact"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#999999] hover:bg-[#EBEBEB]"
              aria-label="Close canvas"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Artifact body */}
      <div className="flex-1 overflow-y-auto p-4">
        <ArtifactRenderer artifact={artifact} />
      </div>
    </div>
  );
}

function ArtifactRenderer({ artifact }: { artifact: AgentArtifact }) {
  switch (artifact.type) {
    case "table":
      return <TableArtifact data={artifact.data as TableData} />;
    case "metric_group":
      return <MetricGroupArtifact data={artifact.data as MetricGroupData} />;
    case "checklist":
      return <ChecklistArtifact data={artifact.data as ChecklistData} />;
    case "report":
      return <ReportArtifact data={artifact.data as ReportData} />;
    default:
      return (
        <div className="rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] p-4">
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-[#555555]">
            {JSON.stringify(artifact.data, null, 2)}
          </pre>
        </div>
      );
  }
}

function TableArtifact({ data }: { data: TableData }) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-[#EBEBEB] bg-[#FAFAFA]">
              {data.columns.map((col) => (
                <th
                  key={col}
                  className="h-9 whitespace-nowrap px-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#999999]"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-[#F4F4F4] transition-colors duration-75 last:border-0 hover:bg-[#FAFAFA]"
              >
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2.5 text-[12.5px] text-[#333333]">
                    {cell ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricGroupArtifact({ data }: { data: MetricGroupData }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {data.metrics.map((metric, i) => (
        <div
          key={i}
          className="rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] px-3.5 py-3"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#999999]">
            {metric.label}
          </p>
          <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-[#0A0A0A]">
            {metric.value}
          </p>
          {metric.delta && (
            <p
              className={`mt-0.5 text-[11.5px] ${
                metric.deltaDirection === "up"
                  ? "text-[#555555]"
                  : metric.deltaDirection === "down"
                    ? "text-[#999999]"
                    : "text-[#BBBBBB]"
              }`}
            >
              {metric.delta}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ChecklistArtifact({ data }: { data: ChecklistData }) {
  const [items, setItems] = useState(data.items);

  function toggle(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] p-4 text-[13px] text-[#555555]">
        No action items available.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => toggle(item.id)}
          className="flex w-full items-start gap-3 rounded-[8px] border border-transparent px-3 py-2.5 text-left transition-colors duration-100 hover:border-[#EBEBEB] hover:bg-[#FFFFFF]"
        >
          <div
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-100 ${
              item.checked
                ? "border-[#0A0A0A] bg-[#0A0A0A]"
                : "border-[#CFCFCF] bg-transparent"
            }`}
          >
            {item.checked && (
              <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-none stroke-white stroke-[1.8]">
                <path d="M1 4l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div>
            <p
              className={`text-[13px] leading-snug ${
                item.checked ? "text-[#BBBBBB] line-through" : "text-[#111111]"
              }`}
            >
              {item.label}
            </p>
            {item.notes && (
              <p className="mt-0.5 text-[11.5px] text-[#999999]">{item.notes}</p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function ReportArtifact({ data }: { data: ReportData }) {
  const body = data.blocks
    .filter((block) => (block.kind === "text" || block.kind === "markdown") && block.text)
    .map((block) => block.text)
    .join("\n\n");

  return (
    <div className="space-y-3 rounded-[8px] border border-[#E0E0E0] bg-[#FFFFFF] p-4">
      {data.summary && (
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#999999]">
          {data.summary}
        </p>
      )}
      {body ? (
        <RichAgentMarkdown markdown={body} variant="canvas" />
      ) : (
        <div className="text-[13px] leading-[1.65] text-[#222222]">
          No report content available.
        </div>
      )}
    </div>
  );
}
