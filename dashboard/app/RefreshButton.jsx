"use client";

export default function RefreshButton() {
  return (
    <button
      id="refresh"
      onClick={() => window.location.reload()}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
    >
      Refresh Scan
    </button>
  );
}
