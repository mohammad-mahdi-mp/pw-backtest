import { ChevronDown } from "lucide-react";
import { useUIStore, type BottomTab } from "@/stores/ui";
import { TradePanel } from "@/components/bottom/TradePanel";
import { AccountPanel } from "@/components/bottom/AccountPanel";
import { BacktestPanel } from "@/components/bottom/BacktestPanel";
import { PineEditor } from "@/components/pine-editor/PineEditor";
import { cn } from "@/lib/utils";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "trade", label: "Trade" },
  { id: "pine", label: "Pine Editor" },
  { id: "backtest", label: "Backtest" },
  { id: "account", label: "Account" },
];

export function BottomPanel() {
  const { bottomTab, setBottomTab, toggleBottomPanel } = useUIStore();

  return (
    <div
      className={cn(
        "shrink-0 flex flex-col bg-tvpanel border-t border-tvborder",
        bottomTab === "backtest" ? "h-[400px]" : "h-[240px]"
      )}
    >
      {/* Tab header */}
      <div className="h-[30px] shrink-0 flex items-end px-1 border-b border-tvborder">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setBottomTab(t.id)}
            className={cn(
              "px-3 h-[29px] text-[12px] font-semibold rounded-t transition-colors",
              bottomTab === t.id
                ? "text-[#d1d4dc] border-b-2 border-primary"
                : "text-[#787b86] hover:text-[#d1d4dc]"
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => toggleBottomPanel(false)}
          className="h-6 px-2 mb-0.5 flex items-center gap-1 text-[11px] text-[#787b86] hover:text-[#d1d4dc]"
          title="Collapse panel"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {bottomTab === "trade" && <TradePanel />}
        {bottomTab === "pine" && <PineEditor />}
        {bottomTab === "backtest" && <BacktestPanel />}
        {bottomTab === "account" && <AccountPanel />}
      </div>
    </div>
  );
}
