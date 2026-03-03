import { useState } from "react";
import type { FlagRow } from "../../../shared/index";

const REASON_OPTIONS = [
  { value: "accepted", label: "Accepted" },
  { value: "false_positive", label: "False Positive" },
  { value: "confirmed_with_supervisor", label: "Confirmed with Supervisor" },
  { value: "data_corrected", label: "Data Corrected" },
] as const;

interface Props {
  flags: FlagRow[];
  onConfirm: (reason: string, note: string) => void;
  onCancel: () => void;
}

export function ResolveDialog({ flags, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("accepted");
  const [note, setNote] = useState("");

  const count = flags.length;
  const title = count === 1
    ? `Resolve flag for ${flags[0].id || flags[0].check_id}`
    : `Resolve ${count} flags`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>

        <label className="block text-sm text-gray-700">
          Reason
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            {REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-gray-700">
          Note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)..."
            rows={3}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason, note.trim())}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Resolve
          </button>
        </div>
      </div>
    </div>
  );
}
