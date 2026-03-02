import { useState } from "react";
import type { CheckOutput, FlagDecision, FlagRow, PerformanceOutput, ProfileOutput, SummaryOutput } from "../../../shared/index";
import { SurveyPerformanceTab } from "./tabs/SurveyPerformanceTab";
import { SummaryDistributionsTab } from "./tabs/SummaryDistributionsTab";
import { DataQualityTab } from "./tabs/DataQualityTab";
import { OverviewTab } from "./tabs/OverviewTab";

type TabId = "performance" | "summary" | "quality" | "overview";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Survey Performance" },
  { id: "summary", label: "Summary & Distributions" },
  { id: "quality", label: "Data Quality" },
];

interface Props {
  profileResult: ProfileOutput;
  summaryResult: SummaryOutput;
  checkResult?: CheckOutput | null;
  performanceResult?: PerformanceOutput | null;
  onStartOver: () => void;
  onExportReport?: () => void;
  onExportFlags?: (content: string) => void;
  exporting?: boolean;
  onResolveFlags?: (flags: FlagRow[]) => void;
  onUnresolveFlags?: (flags: FlagRow[]) => void;
  onImportReviewedCsv?: () => void;
  onExportDofile?: () => void;
  suppressedFlags?: FlagRow[];
  decisions?: Record<string, FlagDecision>;
}

export function ResultsStep({
  profileResult,
  summaryResult,
  checkResult,
  performanceResult,
  onStartOver,
  onExportReport,
  onExportFlags,
  exporting,
  onResolveFlags,
  onUnresolveFlags,
  onImportReviewedCsv,
  onExportDofile,
  suppressedFlags,
  decisions,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [linkedEnumerator, setLinkedEnumerator] = useState<string | null>(null);

  const handleSelectEnumerator = (id: string) => {
    setLinkedEnumerator(id);
    setActiveTab("quality");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Results</h2>
        <p className="text-sm text-slate-500">
          Survey performance, summary distributions, and data quality checks.
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-btn px-4 py-2.5 text-sm font-medium ${
                activeTab === tab.id
                  ? "tab-btn-active text-indigo-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div key={activeTab} className="tab-content-enter">
        {activeTab === "performance" && (
          <SurveyPerformanceTab performanceResult={performanceResult} checkFlags={checkResult?.flags ?? []} onSelectEnumerator={handleSelectEnumerator} />
        )}
        {activeTab === "summary" && (
          <SummaryDistributionsTab profileResult={profileResult} summaryResult={summaryResult} />
        )}
        {activeTab === "quality" && (
          <DataQualityTab
            checkResult={checkResult}
            onExportFlags={onExportFlags}
            initialEnumerator={linkedEnumerator}
            onResolveFlags={onResolveFlags}
            onUnresolveFlags={onUnresolveFlags}
            onImportReviewedCsv={onImportReviewedCsv}
            onExportDofile={onExportDofile}
            suppressedFlags={suppressedFlags}
            decisions={decisions}
          />
        )}
        {activeTab === "overview" && (
          <OverviewTab checkResult={checkResult} performanceResult={performanceResult} onNavigateToPerformance={() => setActiveTab("performance")} />
        )}
      </div>

      {/* Action buttons — always visible */}
      <div className="flex gap-3 pt-3 border-t border-gray-200">
        {onExportReport && (
          <button
            onClick={onExportReport}
            disabled={exporting}
            className="btn-primary px-5 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
          >
            {exporting ? "Exporting..." : "Export Report"}
          </button>
        )}
        <button
          onClick={onStartOver}
          className="btn-secondary px-5 py-2.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 font-medium text-sm border border-gray-200"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
