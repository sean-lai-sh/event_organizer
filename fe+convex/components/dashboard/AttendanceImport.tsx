"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CsvPreviewRow = {
  email: string;
  name?: string;
  valid: boolean;
};

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function buildPreview(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [] as CsvPreviewRow[];

  const parsedLines = lines.map(parseCsvLine);
  const hasHeader = !parsedLines[0]?.[0]?.includes("@");
  const startIndex = hasHeader ? 1 : 0;

  return parsedLines.slice(startIndex).map((cells) => {
    const email = (cells[0] ?? "").trim().toLowerCase();
    const name = (cells[1] ?? "").trim() || undefined;
    return {
      email,
      name,
      valid: email.includes("@"),
    };
  });
}

function resetState(setters: Array<() => void>) {
  setters.forEach((reset) => reset());
}

export function AttendanceImport({
  triggerLabel = "Import CSV",
  triggerVariant = "default",
}: {
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
}) {
  const events = useQuery(api.events.listEvents, {});
  const importAttendanceBatch = useMutation(api.attendance.importAttendanceBatch);

  const [open, setOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [fileName, setFileName] = useState("");
  const [previewRows, setPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  useEffect(() => {
    if (!open) {
      resetState([
        () => setSelectedEventId(""),
        () => setFileName(""),
        () => setPreviewRows([]),
        () => setIsImporting(false),
        () => setResultMessage(""),
      ]);
    }
  }, [open]);

  const validRows = useMemo(
    () => previewRows.filter((row) => row.valid).map(({ email, name }) => ({ email, name })),
    [previewRows]
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResultMessage("");

    const text = await file.text();
    setPreviewRows(buildPreview(text));
  }

  async function handleImport() {
    if (!selectedEventId || validRows.length === 0) return;

    try {
      setIsImporting(true);
      const result = await importAttendanceBatch({
        event_id: selectedEventId as Id<"events">,
        rows: validRows,
      });
      const message = `${result.imported} imported, ${result.duplicates} already existed`;
      setResultMessage(message);
      toast.success(message);
      window.setTimeout(() => setOpen(false), 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      toast.error(message);
      setResultMessage(message);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        className="gap-2 transition-transform duration-[120ms] ease-out active:scale-[0.97]"
        onClick={() => setOpen(true)}
      >
        <Upload className="h-3.5 w-3.5" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[720px] data-open:duration-[200ms] data-open:ease-out data-closed:duration-[120ms] data-closed:ease-out">
          <DialogHeader>
            <DialogTitle>Import attendance</DialogTitle>
            <DialogDescription>
              Upload a CSV with <span className="font-medium text-[#555555]">email,name</span> rows.
              The first row is treated as a header when it does not contain an email.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-[13px] font-medium text-[#555555]">Event</span>
              <select
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(event.target.value)}
                className="h-11 rounded-[8px] border border-[#E0E0E0] bg-white px-3 text-[13px] text-[#111111] outline-none focus:border-[#C8C8C8]"
              >
                <option value="">Select an event</option>
                {(events ?? []).map((event) => (
                  <option key={event._id} value={event._id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-[13px] font-medium text-[#555555]">CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="h-11 rounded-[8px] border border-[#E0E0E0] bg-white px-3 py-2 text-[13px] text-[#111111] file:mr-3 file:rounded-[6px] file:border-0 file:bg-[#F4F4F4] file:px-3 file:py-1.5 file:text-[12px] file:font-medium"
              />
              {fileName ? <span className="text-[12px] text-[#999999]">{fileName}</span> : null}
            </label>

            <div className="rounded-[10px] border border-[#E0E0E0] bg-white">
              <div className="flex items-center justify-between border-b border-[#EBEBEB] px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-[#111111]">Preview</p>
                  <p className="text-[12px] text-[#999999]">First 5 rows. Invalid emails are ignored.</p>
                </div>
                {previewRows.length > 0 ? (
                  <span className="text-[12px] text-[#999999]">{validRows.length} valid rows</span>
                ) : null}
              </div>

              {previewRows.length > 0 ? (
                <div className="px-4 py-3">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#999999]">
                        <th className="pb-2">Email</th>
                        <th className="pb-2">Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 5).map((row, index) => (
                        <tr key={`${row.email}-${index}`} className="border-t border-[#F0F0F0] first:border-t-0">
                          <td
                            className={[
                              "py-2 pr-3 text-[13px]",
                              row.valid ? "text-[#111111]" : "text-[#999999] line-through",
                            ].join(" ")}
                          >
                            {row.email || "Invalid row"}
                          </td>
                          <td className="py-2 text-[13px] text-[#6B6B6B]">{row.name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewRows.length > 5 ? (
                    <p className="mt-3 text-[12px] text-[#999999]">and {previewRows.length - 5} more</p>
                  ) : null}
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-[13px] text-[#999999]">
                  Choose an event and upload a CSV to preview rows.
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="items-center justify-between">
            <div className="text-[12px] text-[#999999]">{resultMessage || ""}</div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isImporting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={!selectedEventId || validRows.length === 0 || isImporting}
                className="transition-transform duration-[120ms] ease-out active:scale-[0.97]"
              >
                {isImporting ? "Importing…" : "Import attendance"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
