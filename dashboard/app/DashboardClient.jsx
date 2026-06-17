"use client";

import React, { useState, useEffect } from "react";

export default function DashboardClient({
  initialItems,
  initialStats,
  initialScanError,
}) {
  const [oneShots, setOneShots] = useState(initialItems || []);
  const [statsData, setStatsData] = useState(
    initialStats || { totalRuns: 0, failedRuns: 0 },
  );
  const [scanError, setScanError] = useState(initialScanError || false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");

  // Preview Modal state
  const [previewItem, setPreviewItem] = useState(null);
  const [readmeContent, setReadmeContent] = useState("");
  const [loadingReadme, setLoadingReadme] = useState(false);

  // Run Modal state
  const [runningItem, setRunningItem] = useState(null);
  const [runAction, setRunAction] = useState("test");
  const [isRunning, setIsRunning] = useState(false);
  const [runOutput, setRunOutput] = useState(null);

  // Load all unique tags from one-shots
  const allTags = React.useMemo(() => {
    const tagsSet = new Set();
    oneShots.forEach((item) => {
      if (Array.isArray(item.tags)) {
        item.tags.forEach((tag) => {
          if (tag && typeof tag === "string") {
            tagsSet.add(tag);
          }
        });
      }
    });
    return Array.from(tagsSet).sort();
  }, [oneShots]);

  const handleRefresh = async () => {
    try {
      const res = await fetch("/api/scan");
      if (res.ok) {
        const data = await res.json();
        setOneShots(data);
        setScanError(false);
      } else {
        setScanError(true);
      }
    } catch (e) {
      setScanError(true);
    }

    // Also refresh stats
    try {
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) {
        const statsVal = await statsRes.json();
        setStatsData(statsVal);
      }
    } catch (e) {
      // Ignore stats fetch failure
    }
  };

  const handlePreview = async (item) => {
    setPreviewItem(item);
    setLoadingReadme(true);
    setReadmeContent("Loading README...");
    try {
      const res = await fetch(`/api/scan/${item.id}/readme`);
      if (res.ok) {
        const data = await res.json();
        setReadmeContent(data.readme || "No README content found.");
      } else {
        setReadmeContent("Error loading README.");
      }
    } catch (e) {
      setReadmeContent("Error loading README.");
    } finally {
      setLoadingReadme(false);
    }
  };

  const handleRun = async () => {
    if (!runningItem) return;
    setIsRunning(true);
    setRunOutput(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runningItem.id, action: runAction }),
      });
      const data = await res.json();
      setRunOutput(data);
    } catch (e) {
      setRunOutput({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Network error occurred while calling run endpoint.",
        error: "Execution failed",
      });
    } finally {
      setIsRunning(false);
      // Fetch updated stats
      try {
        const statsRes = await fetch("/api/stats");
        if (statsRes.ok) {
          const statsVal = await statsRes.json();
          setStatsData(statsVal);
        }
      } catch (e) {
        // Ignore
      }
    }
  };

  const filteredItems = React.useMemo(() => {
    return oneShots.filter((item) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.description && item.description.toLowerCase().includes(query));

      const matchesTag =
        !selectedTag ||
        (item.tags &&
          item.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase()));

      return matchesSearch && matchesTag;
    });
  }, [oneShots, searchQuery, selectedTag]);

  const total = statsData.totalRuns || 0;
  const failed = statsData.failedRuns || 0;
  const successRate =
    total > 0 ? Math.round(((total - failed) / total) * 100) : 100;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-800 p-6 flex flex-col border-r border-slate-700">
        <div className="flex items-center space-x-2 mb-8">
          <span className="text-xl font-bold tracking-wide text-blue-400">
            OneShotForge
          </span>
        </div>

        <nav className="flex-1 space-y-4">
          <div className="text-sm font-semibold uppercase text-slate-500 tracking-wider">
            Navigation
          </div>
          <a
            href="#"
            className="flex items-center space-x-2 text-slate-300 hover:text-white transition-colors"
          >
            <span>Dashboard</span>
          </a>
        </nav>

        {/* Stats Section */}
        <div className="mt-auto pt-6 border-t border-slate-700 space-y-3">
          <div className="text-sm font-semibold uppercase text-slate-500 tracking-wider">
            Statistics
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Total Runs:</span>
              <span className="font-mono text-blue-400">{total}</span>
            </div>
            <div className="flex justify-between">
              <span>Failed Runs:</span>
              <span className="font-mono text-red-400">{failed}</span>
            </div>
            <div className="flex justify-between border-t border-slate-700/50 pt-2">
              <span>Success Rate:</span>
              <span className="font-mono text-green-400">{successRate}%</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              OneShotForge
            </h1>
            <p className="text-slate-400 mt-1">
              Manage and run your isolated scripts and scraper tasks.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              id="refresh"
              onClick={handleRefresh}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
            >
              Refresh Scan
            </button>
          </div>
        </div>

        {/* Error Banner Container */}
        <div
          id="error-banner"
          className={`${scanError ? "" : "hidden"} mb-6 p-4 bg-red-900/50 border border-red-500 rounded text-red-200`}
        >
          Error loading scan: Failed to read one-shots directory.
        </div>

        {/* Filters and Search Bar */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="w-full md:w-1/2">
            <label htmlFor="search-input" className="sr-only">
              Search
            </label>
            <input
              id="search-input"
              type="text"
              placeholder="Search one-shots..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="w-full md:w-auto flex items-center space-x-2 overflow-x-auto">
            <span className="text-sm text-slate-400 whitespace-nowrap">
              Filter Tags:
            </span>
            <button
              onClick={() => setSelectedTag("")}
              className={`px-3 py-1 text-xs rounded transition-colors border ${
                selectedTag === ""
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600"
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1 text-xs rounded transition-colors border ${
                  selectedTag === tag
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Grid layout for one-shots */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/50 border border-slate-800 rounded-lg">
            <p className="text-slate-400">
              No one-shots found matching your filters.
            </p>
          </div>
        ) : null}

        <div
          className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${filteredItems.length === 0 ? "hidden" : ""}`}
        >
          {filteredItems.map((item) => (
            <div
              key={item.id}
              id={item.id}
              className={`${item.id} bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-bold text-slate-100">
                    {item.name}
                  </h3>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                    v{item.version}
                  </span>
                </div>
                <p className="text-slate-400 text-sm mt-2 line-clamp-3">
                  {item.description}
                </p>
              </div>

              <div className="mt-4">
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {Array.isArray(item.tags) &&
                    item.tags.map((tag) => (
                      <span
                        key={tag}
                        onClick={() => setSelectedTag(tag)}
                        className="text-xs bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded cursor-pointer hover:bg-blue-900 transition-colors"
                      >
                        {tag}
                      </span>
                    ))}
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => handlePreview(item)}
                    className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-sm font-medium rounded transition-colors text-center"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => {
                      setRunningItem(item);
                      setRunAction("test");
                      setRunOutput(null);
                      setIsRunning(false);
                    }}
                    className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-sm font-medium rounded transition-colors text-center"
                  >
                    Run Script
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-100">
                  {previewItem.name} - README
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {previewItem.path}
                </p>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-white text-lg font-semibold"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 prose prose-invert max-w-none text-slate-300">
              {loadingReadme ? (
                <div className="flex items-center justify-center py-12">
                  <span className="text-slate-400">
                    Loading README content...
                  </span>
                </div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: readmeContent }} />
              )}
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end">
              <button
                onClick={() => setPreviewItem(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Script Console Dialog */}
      {runningItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-100">
                  Run: {runningItem.name}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Execute defined package script targets
                </p>
              </div>
              <button
                onClick={() => setRunningItem(null)}
                className="text-slate-400 hover:text-white text-lg font-semibold"
                disabled={isRunning}
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 flex flex-col space-y-4">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-semibold text-slate-300">
                  Select Script Target:
                </span>
                <select
                  value={runAction}
                  onChange={(e) => setRunAction(e.target.value)}
                  disabled={isRunning}
                  className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="test">test</option>
                  <option value="start">start</option>
                </select>
                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium text-sm rounded transition-colors flex items-center space-x-2"
                >
                  {isRunning ? "Executing..." : "Run"}
                </button>
              </div>

              {/* Formatted output console */}
              <div className="flex-1 flex flex-col min-h-[300px]">
                <span className="text-xs font-semibold text-slate-400 mb-1">
                  Execution Console Log:
                </span>
                <div className="flex-1 bg-black rounded p-4 font-mono text-xs overflow-y-auto text-green-400 space-y-2 border border-slate-950">
                  {isRunning && (
                    <div className="text-yellow-400 animate-pulse">
                      &gt; Executing script target "{runAction}"... Please wait.
                    </div>
                  )}

                  {!isRunning && !runOutput && (
                    <div className="text-slate-500">
                      Console idle. Click Run to begin execution.
                    </div>
                  )}

                  {runOutput && (
                    <div className="space-y-2">
                      <div
                        className={
                          runOutput.success ? "text-green-400" : "text-red-400"
                        }
                      >
                        &gt; Execution finished with exit code:{" "}
                        {runOutput.exitCode !== null
                          ? runOutput.exitCode
                          : "Killed/Timeout"}
                      </div>

                      {runOutput.error && (
                        <div className="text-red-500 font-bold">
                          [ERROR]: {runOutput.error}
                        </div>
                      )}

                      {runOutput.stdout && (
                        <div>
                          <div className="text-slate-400 border-b border-slate-800 pb-1 mb-1 font-semibold">
                            stdout:
                          </div>
                          <pre className="whitespace-pre-wrap text-slate-300">
                            {runOutput.stdout}
                          </pre>
                        </div>
                      )}

                      {runOutput.stderr && (
                        <div>
                          <div className="text-red-400 border-b border-slate-800 pb-1 mb-1 font-semibold">
                            stderr:
                          </div>
                          <pre className="whitespace-pre-wrap text-red-300">
                            {runOutput.stderr}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end">
              <button
                onClick={() => setRunningItem(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
                disabled={isRunning}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
