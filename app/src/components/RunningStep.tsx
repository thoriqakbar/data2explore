export function RunningStep() {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-600 font-medium">Running summary analysis...</p>
      <p className="text-sm text-gray-400">This may take a moment for large datasets.</p>
    </div>
  );
}
