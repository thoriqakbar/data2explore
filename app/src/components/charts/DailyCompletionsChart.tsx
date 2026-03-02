import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DailyCompletion } from "../../../../shared/index";

interface Props {
  data: DailyCompletion[];
}

export function DailyCompletionsChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
        No daily completion data available.
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11 }}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11 }}
            allowDecimals={false}
            stroke="#6366f1"
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
            labelFormatter={(label) => `Date: ${String(label)}`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            yAxisId="left"
            dataKey="count"
            name="Daily"
            fill="#a5b4fc"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="right"
            dataKey="cumulative"
            name="Cumulative"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
