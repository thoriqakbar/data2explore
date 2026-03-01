import { useState } from "react";
import type { CheckOutput, PerformanceOutput, ProfileOutput, SummaryOutput } from "../../../shared/index";
import { SurveyPerformanceTab } from "./tabs/SurveyPerformanceTab";
import { SummaryDistributionsTab } from "./tabs/SummaryDistributionsTab";
import { DataQualityTab } from "./tabs/DataQualityTab";
import { OverviewTab } from "./tabs/OverviewTab";

type TabId = "performance" | "summary" | "quality" | "overview";

const TABS: { id: TabId; label: string }[] = [
  { id: "performance", label: "Survey Performance" },
  { id: "summary", label: "Summary & Distributions" },
  { id: "quality", label: "Data Quality" },
  { id: "overview", label: "Overview" },
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
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("performance");
  const [linkedEnumerator, setLinkedEnumerator] = useState<string | null>(null);

  const handleSelectEnumerator = (id: string) => {
    setLinkedEnumerator(id);
    setActiveTab("quality");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Results</h2>
        <p className="text-sm text-gray-500">
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
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "performance" && (
          <SurveyPerformanceTab performanceResult={performanceResult} checkFlags={checkResult?.flags ?? []} onSelectEnumerator={handleSelectEnumerator} />
        )}
        {activeTab === "summary" && (
          <SummaryDistributionsTab profileResult={profileResult} summaryResult={summaryResult} />
        )}
        {activeTab === "quality" && (
          <DataQualityTab checkResult={checkResult} onExportFlags={onExportFlags} initialEnumerator={linkedEnumerator} />
        )}
        {activeTab === "overview" && (
          <OverviewTab checkResult={checkResult} performanceResult={performanceResult} onNavigateToPerformance={() => setActiveTab("performance")} />
        )}
      </div>

      {/* Action buttons — always visible */}
      <div className="flex gap-3 pt-2 border-t border-gray-200">
        {onExportReport && (
          <button
            onClick={onExportReport}
            disabled={exporting}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
          >
            {exporting ? "Exporting..." : "Export Report"}
          </button>
        )}
        <button
          onClick={onStartOver}
          className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
