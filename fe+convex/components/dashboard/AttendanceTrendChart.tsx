"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendPoint = {
  event_id: string;
  title: string;
  event_date: string;
  event_type: string;
  attendee_count: number;
};

function formatShortDate(date: string) {
  if (!date) return "TBD";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TrendPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!point) return null;

  return (
    <div
      className="rounded-[8px] border border-[#E0E0E0] bg-white p-3 shadow-none transition-all ease-out"
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "scale(1)" : "scale(0.98)",
        transitionDuration: active ? "100ms" : "80ms",
      }}
    >
      <p className="text-[12px] font-semibold text-[#111111]">{point.title}</p>
      <p className="mt-1 text-[11px] text-[#999999]">{formatShortDate(point.event_date)}</p>
      <p className="mt-2 text-[12px] text-[#4d4d4d]">{point.attendee_count} attendees</p>
    </div>
  );
}

export function AttendanceTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="rounded-[14px] border border-[#EBEBEB] bg-white p-5">
      <h2 className="mb-4 text-[15px] font-semibold text-[#111111]">Attendance over time</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid stroke="#E0E0E0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="event_date"
            tick={{ fill: "#999999", fontSize: 11 }}
            tickFormatter={formatShortDate}
            tickLine={false}
            axisLine={{ stroke: "#E0E0E0" }}
          />
          <YAxis
            tick={{ fill: "#999999", fontSize: 11 }}
            allowDecimals={false}
            tickLine={false}
            axisLine={{ stroke: "#E0E0E0" }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#DADADA", strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="attendee_count"
            stroke="#0A0A0A"
            strokeWidth={1.5}
            dot={{ fill: "#0A0A0A", r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#0A0A0A", strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
