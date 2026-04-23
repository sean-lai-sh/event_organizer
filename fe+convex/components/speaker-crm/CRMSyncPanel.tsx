"use client";

/**
 * CRMSyncPanel — shows sync status for approved candidates,
 * with a sync trigger and per-record status indicators.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface SyncRecord {
  eventCandidateId: string;
  candidateId: string;
  fullName: string;
  currentTitle?: string;
  companyName?: string;
  crmRecordId?: string;
  syncedAt?: number;
}

interface CRMSyncPanelProps {
  eventId: string;
  records: SyncRecord[];
  onSync: () => Promise<{ synced: number; failed: number }>;
}

export function CRMSyncPanel({ records, onSync }: CRMSyncPanelProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<{
    synced: number;
    failed: number;
  } | null>(null);

  const synced = records.filter((r) => r.crmRecordId);
  const unsynced = records.filter((r) => !r.crmRecordId);

  async function handleSync() {
    setIsSyncing(true);
    try {
      const result = await onSync();
      setLastResult(result);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-[#111111]">
            {synced.length}/{records.length} synced to HubSpot
          </p>
          {unsynced.length > 0 && (
            <p className="text-[12px] text-[#6B6B6B]">{unsynced.length} pending sync</p>
          )}
        </div>

        <Button
          size="sm"
          variant={unsynced.length > 0 ? "default" : "outline"}
          disabled={isSyncing || records.length === 0}
          onClick={handleSync}
        >
          {isSyncing ? "Syncing…" : unsynced.length > 0 ? "Sync to HubSpot" : "Re-sync"}
        </Button>
      </div>

      {/* Result banner */}
      {lastResult && (
        <div
          className={`rounded-[8px] px-3 py-2 text-[13px] ${
            lastResult.failed > 0
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {lastResult.synced > 0 && `✓ ${lastResult.synced} synced`}
          {lastResult.failed > 0 && ` · ${lastResult.failed} failed`}
        </div>
      )}

      {/* Record list */}
      {records.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[#DDDDDD] py-10 text-center text-[13px] text-[#9B9B9B]">
          No approved candidates yet.
          <br />
          Approve candidates in the Review tab first.
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <div
              key={record.candidateId}
              className="flex items-center justify-between rounded-[8px] border border-[#EBEBEB] bg-[#FFFFFF] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#111111]">{record.fullName}</p>
                {(record.currentTitle || record.companyName) && (
                  <p className="truncate text-[11px] text-[#6B6B6B]">
                    {record.currentTitle}
                    {record.currentTitle && record.companyName ? " · " : ""}
                    {record.companyName}
                  </p>
                )}
              </div>

              <div className="shrink-0 text-right">
                {record.crmRecordId ? (
                  <div>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      Synced
                    </span>
                    <p className="mt-0.5 text-[10px] text-[#AAAAAA]">{record.crmRecordId}</p>
                  </div>
                ) : (
                  <span className="rounded-full bg-[#F0F0F0] px-2 py-0.5 text-[11px] font-medium text-[#6B6B6B]">
                    Pending
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
