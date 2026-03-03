import { useState } from "react";
import { createPortal } from "react-dom";
import type { FlagRow } from "../../../shared/index";

interface Props {
  flags: FlagRow[];
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

export function ResolveDialog({ flags, onConfirm, onCancel }: Props) {
  const [note, setNote] = useState("");

  const count = flags.length;
  const title = count === 1
    ? `Resolve flag for ${flags[0].id || flags[0].check_id}`
    : `Resolve ${count} flags`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>

        <label className="block text-sm text-gray-700">
          Note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)..."
            rows={3}
            autoFocus
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
            onClick={() => onConfirm(note.trim())}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Resolve
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
