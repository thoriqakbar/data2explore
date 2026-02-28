import type { ProfileOutput } from "../../../shared/index";

interface Props {
  filePath: string | null;
  profileResult: ProfileOutput | null;
  error: string | null;
  onSelectFile: () => void;
}

export function ImportStep({ filePath, profileResult, error, onSelectFile }: Props) {
  const isLoading = filePath !== null && profileResult === null && error === null;
  const fileName = filePath ? filePath.split(/[\\/]/).pop() : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Import Data</h2>
        <p className="text-sm text-gray-500">
          Select a survey data file to get started. Supported formats: CSV, XLSX, DTA, TXT.
        </p>
      </div>

      <button
        onClick={onSelectFile}
        disabled={isLoading}
        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
      >
        {isLoading ? "Profiling..." : "Select File"}
      </button>

      {isLoading && (
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Running profile on {fileName}...
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <p className="font-medium mb-1">Error</p>
          <pre className="whitespace-pre-wrap text-xs">{error}</pre>
        </div>
      )}

      {profileResult && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800 mb-2">{fileName}</p>
          <div className="flex gap-6 text-sm text-green-700">
            <span>{profileResult.schema_profile.column_count} columns</span>
            <span>{profileResult.schema_profile.row_count} rows</span>
          </div>
        </div>
      )}
    </div>
  );
}
