import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { HistogramBin } from "../../../../shared/index";

interface Props {
  histogram: HistogramBin[];
  mean?: number | null;
  label: string;
}

export function VariableHistogramChart({ histogram, mean, label }: Props) {
  if (histogram.length === 0) {
    return (
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
        No distribution data for {label}.
      </div>
    );
  }

  const data = histogram.map((bin) => ({
    range: `${bin.bin_start.toFixed(1)}`,
    count: bin.count,
    bin_start: bin.bin_start,
    bin_end: bin.bin_end,
  }));

  // Find the bin containing the mean for the reference line
  const meanBinLabel =
    mean != null
      ? data.find((d) => mean >= d.bin_start && mean < d.bin_end)?.range ??
        data[data.length - 1]?.range
      : null;

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
            labelFormatter={(_label, payload) => {
              const item = (payload as Array<{ payload?: { bin_start: number; bin_end: number } }>)?.[0]?.payload;
              if (!item) return label;
              return `${label}: ${item.bin_start.toFixed(2)} – ${item.bin_end.toFixed(2)}`;
            }}
          />
          <Bar dataKey="count" fill="#818cf8" radius={[3, 3, 0, 0]} />
          {meanBinLabel != null && (
            <ReferenceLine
              x={meanBinLabel}
              stroke="#dc2626"
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{ value: `μ=${mean!.toFixed(1)}`, position: "top", fontSize: 11, fill: "#dc2626" }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
