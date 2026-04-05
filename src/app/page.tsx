"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import qaData from "@/data/qa.json";
import glossaryData from "@/data/glossary.json";
import {
  type BuildingInput,
  type FaceInput,
  type CostConfig,
  type EstimateResult,
  type FeasibilityItem,
  type ScenarioResult,
  type AccessLevel,
  type InspectionMethod,
  type SalesPriceMode,
  type FutureOverrides,
  DEFAULT_CONFIG,
  DEFAULT_FUTURE_OVERRIDES,
  applyFutureOverrides,
  PRESETS,
  createDefaultFace,
  calculateEstimate,
  calculateHeightSensitivity,
  DEFAULT_AREA_PER_METER,
} from "@/lib/estimate-engine";

// --- Helpers ---

function yen(n: number): string {
  return n.toLocaleString("ja-JP") + " 円";
}

function pct(n: number): string {
  return n.toFixed(1) + "%";
}

// Kana normalization for glossary/QA search
function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

const ACCESS_LABELS: Record<AccessLevel, { symbol: string; label: string; color: string; bg: string }> = {
  "drone-possible": { symbol: "○", label: "ラインドローンシステムで実施可能", color: "text-green-600", bg: "bg-green-50 border-green-300" },
  "drone-impossible": { symbol: "×", label: "ラインドローンシステムで実施不可", color: "text-red-600", bg: "bg-red-50 border-red-300" },
};

const METHOD_LABELS: Record<InspectionMethod, string> = {
  infrared: "赤外線",
  percussion: "打診",
  visual: "目視",
};

// --- Base Components ---

function FeasibilityBadge({ level }: { level: "ok" | "warning" | "blocker" }) {
  const styles = { ok: "bg-green-100 text-green-800 border-green-300", warning: "bg-yellow-100 text-yellow-800 border-yellow-300", blocker: "bg-red-100 text-red-800 border-red-300" };
  const labels = { ok: "OK", warning: "注意", blocker: "不可" };
  return <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded border ${styles[level]}`}>{labels[level]}</span>;
}

function FeasibilityPanel({ items }: { items: FeasibilityItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <FeasibilityBadge level={item.level} />
          <span className="text-sm">{item.message}</span>
        </div>
      ))}
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-lg border border-border">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
        <span className="text-sm font-bold text-text-secondary">{title}</span>
        <span className={`text-xs text-text-muted transition-transform ${open ? "rotate-90" : ""}`}>&#9654;</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function CostRow({ label, value, bold, sub }: { label: string; value: number; bold?: boolean; sub?: string }) {
  return (
    <tr className={`border-b border-border ${bold ? "bg-gray-50" : ""}`}>
      <td className={`py-1.5 ${bold ? "font-bold" : ""} whitespace-nowrap`}>{label}</td>
      <td className={`py-1.5 text-right ${bold ? "font-bold" : ""} whitespace-nowrap`}>
        {yen(value)}
        {sub && <div className="text-xs text-text-muted font-normal">{sub}</div>}
      </td>
    </tr>
  );
}

function ConstantField({ label, value, unit, onChange, isDefault }: { label: string; value: number; unit: string; onChange: (v: number) => void; isDefault: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`w-24 border rounded px-1.5 py-0.5 text-right text-xs ${isDefault ? "border-border bg-white" : "border-yellow-400 bg-yellow-50"}`} />
        <span className="text-text-muted text-xs whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );
}

// --- Face Summary Table ---

function FaceSummaryTable({ result }: { result: EstimateResult }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-border">
            <th className="text-left py-2 font-medium text-text-secondary">面</th>
            <th className="text-center py-2 font-medium text-text-secondary">判定</th>
            <th className="text-left py-2 font-medium text-text-secondary">手法</th>
            <th className="text-right py-2 font-medium text-text-secondary">面積</th>
            <th className="text-left py-2 font-medium text-text-secondary pl-3">注記</th>
          </tr>
        </thead>
        <tbody>
          {result.faceResults.map((fr, i) => {
            const access = ACCESS_LABELS[fr.accessLevel];
            return (
              <tr key={i} className="border-b border-border">
                <td className="py-2 font-medium">{fr.name}</td>
                <td className="py-2 text-center"><span className={`text-lg font-bold ${access.color}`}>{access.symbol}</span></td>
                <td className="py-2">{METHOD_LABELS[fr.inspectionMethod]}</td>
                <td className="py-2 text-right">{fr.area.toLocaleString()} m2</td>
                <td className="py-2 text-text-muted pl-3">{fr.note || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Comparison Bar ---

function ComparisonBar({ result }: { result: EstimateResult }) {
  const maxVal = Math.max(result.comparison.dronePrice, result.comparison.ropeAccessPrice, 1);
  const dronePct = (result.comparison.dronePrice / maxVal) * 100;
  const ropePct = (result.comparison.ropeAccessPrice / maxVal) * 100;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>ドローン調査（提案価格）</span>
          <span className="font-bold">{yen(result.comparison.dronePrice)}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${dronePct}%` }} />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>ロープアクセス（全面）</span>
          <span className="font-bold">{yen(result.comparison.ropeAccessPrice)}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden">
          <div className="h-full bg-gray-400 rounded-full transition-all duration-500" style={{ width: `${ropePct}%` }} />
        </div>
      </div>
      <div className="text-center">
        <span className={`text-sm font-bold ${result.comparison.savings >= 0 ? "text-positive" : "text-negative"}`}>
          {result.comparison.savings >= 0 ? "削減額: " : "超過額: "}
          {yen(Math.abs(result.comparison.savings))}（{pct(Math.abs(result.comparison.savingsPercent))}）
        </span>
      </div>
    </div>
  );
}

// --- Scenario Card ---

function ScenarioCard({ scenario, label, config }: { scenario: ScenarioResult; label: string; config: CostConfig }) {
  const irRate = config.irAnalysis.outsourceCostPerM2;
  const irArea = scenario.droneArea + scenario.groundIRArea;
  const ropeArea = scenario.ropeAccessArea;

  return (
    <div className="bg-white rounded-lg border border-border p-4">
      <h3 className="text-sm font-bold text-text-secondary mb-3">{label}</h3>
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">原価内訳</h4>
          <table className="w-full text-sm">
            <tbody>
              <CostRow label="人件費" value={scenario.costBreakdown.personnel}
                sub={`${config.fixedPersonnelCostPerDay.toLocaleString()}円/日 × ${scenario.surveyDays}日`} />
              <CostRow label="機材費" value={scenario.costBreakdown.equipment}
                sub={`UAV損料 + 車両 + IR機材（${scenario.surveyDays}日）`} />
              <CostRow label="赤外線解析費" value={scenario.costBreakdown.irAnalysis}
                sub={irArea > 0 ? `${irArea.toLocaleString()}m2 × ${irRate}円/m2` : "対象なし"} />
              <CostRow label="ロープアクセス外注" value={scenario.costBreakdown.ropeAccessSubcontract}
                sub={ropeArea > 0 ? `${ropeArea.toLocaleString()}m2 × ${config.ropeAccessOutsourcePerM2}円/m2` : "対象なし"} />
              <CostRow label="報告書費" value={scenario.costBreakdown.reportFee} />
              <CostRow label="原価合計" value={scenario.costBreakdown.totalCost} bold />
            </tbody>
          </table>
        </div>
        <div>
          <h4 className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">
            {config.salesPriceMode === "unit-price" ? "面積単価ベース" : "積み上げ"}販売価格
          </h4>
          <table className="w-full text-sm">
            <tbody>
              <CostRow label="直接業務費（人件費+機材）" value={scenario.costBreakdown.directBusinessCost} />
              <CostRow label="一般管理費等（42.1%）" value={scenario.costBreakdown.overhead} />
              <CostRow label="外部委託費" value={scenario.costBreakdown.externalCommission} />
              <CostRow label="販売価格" value={scenario.salesPrice} bold />
            </tbody>
          </table>
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted text-xs">粗利（販売 − 原価）</span>
              <span className={`font-bold ${scenario.grossProfit >= 0 ? "text-positive" : "text-negative"}`}>{yen(scenario.grossProfit)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted text-xs pl-2">粗利率</span>
              <span className={`text-sm ${scenario.grossProfitRate >= 0 ? "text-positive" : "text-negative"}`}>{pct(scenario.grossProfitRate)}</span>
            </div>
            <div className="flex justify-between text-sm pt-1 border-t border-dashed border-gray-100">
              <span className="text-text-muted text-xs">販管費（{config.sgaRatePercent}%）</span>
              <span className="text-sm text-text-muted">{yen(scenario.sgaCost)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted text-xs">営業利益（粗利 − 販管費）</span>
              <span className={`font-bold ${scenario.operatingProfit >= 0 ? "text-positive" : "text-negative"}`}>{yen(scenario.operatingProfit)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted text-xs pl-2">営業利益率</span>
              <span className={`text-sm ${scenario.operatingProfitRate >= 0 ? "text-positive" : "text-negative"}`}>{pct(scenario.operatingProfitRate)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Height × Face Count Sensitivity Table ---

function HeightSensitivityTable({ config, areaPerMeter }: { config: CostConfig; areaPerMeter: number }) {
  const sensitivity = useMemo(
    () => calculateHeightSensitivity(config, [30, 50, 70, 90, 110, 130, 150], [0, 1, 2, 3, 4], areaPerMeter),
    [config, areaPerMeter]
  );

  const [displayMode, setDisplayMode] = useState<"price" | "profit" | "vs-rope">("profit");

  const faceLabels: Record<number, string> = { 0: "全面ロープ", 1: "1面ドローン", 2: "2面ドローン", 3: "3面ドローン", 4: "全面ドローン" };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-muted">表示:</span>
        {(["price", "profit", "vs-rope"] as const).map((mode) => (
          <button key={mode} onClick={() => setDisplayMode(mode)}
            className={`text-xs px-2 py-0.5 rounded border ${displayMode === mode ? "bg-accent text-white border-accent" : "border-border text-text-muted hover:border-accent"}`}>
            {mode === "price" ? "積み上げ価格" : mode === "profit" ? "営業利益率" : "従来比（削減率）"}
          </button>
        ))}
        <span className="text-xs text-text-muted ml-auto">{areaPerMeter}m2/m換算</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-border px-2 py-2 text-left font-medium text-text-secondary whitespace-nowrap">高さ / 面積</th>
              {sensitivity.faceCounts.map((fc) => (
                <th key={fc} className="border border-border px-2 py-2 text-center font-medium text-text-secondary whitespace-nowrap">
                  {faceLabels[fc] ?? `${fc}面`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sensitivity.rows.map((row) => (
              <tr key={row.height} className="border-b border-border hover:bg-gray-50">
                <td className="border border-border px-2 py-2 font-medium whitespace-nowrap">
                  <div>{row.height}m</div>
                  <div className="text-text-muted font-normal">{row.totalArea.toLocaleString()}m2</div>
                </td>
                {row.faceResults.map((fr) => {
                  const isViable = fr.isViable;
                  const bgClass = isViable ? "bg-green-50" : "bg-red-50";
                  const textClass = isViable ? "text-green-700" : "text-red-700";

                  let mainValue: string;
                  let subValue: string;
                  if (displayMode === "price") {
                    mainValue = `${Math.round(fr.stackupPrice / 10000)}万円`;
                    subValue = `原価 ${Math.round(fr.totalCost / 10000)}万`;
                  } else if (displayMode === "profit") {
                    mainValue = `${fr.operatingProfitRate.toFixed(1)}%`;
                    subValue = `粗利 ${fr.grossProfitRate.toFixed(1)}%`;
                  } else {
                    mainValue = fr.ropeDiscountRate >= 0 ? `▲${fr.ropeDiscountRate.toFixed(1)}%` : `+${Math.abs(fr.ropeDiscountRate).toFixed(1)}%`;
                    subValue = `ロープ ${Math.round(fr.ropeAccessPrice / 10000)}万`;
                  }

                  return (
                    <td key={fr.droneCount} className={`border border-border px-2 py-2 text-center ${bgClass}`}>
                      <div className={`font-bold ${textClass}`}>{mainValue}</div>
                      <div className="text-text-muted">{subValue}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">
        ※ 緑=営業利益黒字・赤=赤字。ドローン面数は4面均等配分で試算。積み上げモード（販売単価 = 直接業務費×1.421 + 外部委託）で計算。
      </p>
    </div>
  );
}

// --- Face Editor ---

function FaceEditor({ face, index, onChange, onRemove }: { face: FaceInput; index: number; onChange: (index: number, face: FaceInput) => void; onRemove: (index: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const update = (patch: Partial<FaceInput>) => onChange(index, { ...face, ...patch });
  const access = ACCESS_LABELS[face.accessLevel];

  return (
    <div className={`border rounded-lg p-3 ${access.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-lg font-bold ${access.color} shrink-0`}>{access.symbol}</span>
        <input type="text" value={face.name} onChange={(e) => update({ name: e.target.value })}
          className="font-bold text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 w-16" />
        <input type="number" value={face.area || ""} onChange={(e) => {
          const area = Number(e.target.value) || 0;
          const patch: Partial<FaceInput> = { area };
          if (face.accessLevel === "drone-impossible") patch.ropeAccessArea = area;
          update(patch);
        }} className="w-20 border border-border rounded px-2 py-1 text-sm bg-white" placeholder="面積" />
        <span className="text-xs text-text-muted">m2</span>
        <select value={face.accessLevel} onChange={(e) => {
          const level = e.target.value as AccessLevel;
          const patch: Partial<FaceInput> = { accessLevel: level };
          if (level === "drone-impossible") { patch.inspectionMethod = "percussion"; patch.ropeAccessArea = face.area; }
          else { patch.inspectionMethod = "infrared"; patch.ropeAccessArea = 0; }
          update(patch);
        }} className="text-xs border border-border rounded px-1 py-1 bg-white">
          <option value="drone-possible">実施可能</option>
          <option value="drone-impossible">実施不可</option>
        </select>
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-text-muted hover:text-accent">{expanded ? "閉じる" : "詳細"}</button>
          <button onClick={() => onRemove(index)} className="text-xs text-text-muted hover:text-negative">削除</button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <label className="text-xs text-text-muted">検査方法</label>
              <select value={face.inspectionMethod} onChange={(e) => update({ inspectionMethod: e.target.value as InspectionMethod })}
                className="w-full border border-border rounded px-2 py-1 text-sm bg-white">
                <option value="infrared">赤外線</option>
                <option value="percussion">打診</option>
                <option value="visual">目視</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted">地上IR面積 (m2)</label>
              <input type="number" value={face.groundIRArea || ""} onChange={(e) => update({ groundIRArea: Number(e.target.value) || 0 })}
                className="w-full border border-border rounded px-2 py-1 text-sm bg-white" />
            </div>
          </div>
          {face.accessLevel === "drone-impossible" && (
            <div className="text-sm">
              <label className="text-xs text-text-muted">ロープアクセス面積 (m2)</label>
              <input type="number" value={face.ropeAccessArea || ""} onChange={(e) => update({ ropeAccessArea: Number(e.target.value) || 0 })}
                className="w-full border border-border rounded px-2 py-1 text-sm bg-white" />
            </div>
          )}
          <div className="text-sm">
            <label className="text-xs text-text-muted">注記</label>
            <input type="text" value={face.note} onChange={(e) => update({ note: e.target.value })}
              placeholder="例: 大通りに面しているためドローン不可"
              className="w-full border border-border rounded px-2 py-1 text-sm bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Config Editor ---

function SliderField({ label, value, onChange, min, max, step, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-xs font-medium text-text-secondary">{label}</label>
        <div className="flex items-center gap-1">
          <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
            className="w-16 border border-border rounded px-1 py-0.5 text-sm text-right" />
          <span className="text-xs text-text-muted">{unit}</span>
        </div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-accent" />
      <div className="flex justify-between text-xs text-text-muted">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

function ConfigEditor({ config, onChange, onReset }: { config: CostConfig; onChange: (config: CostConfig) => void; onReset: () => void }) {
  const [showConstants, setShowConstants] = useState(false);
  const isStackup = config.salesPriceMode === "stackup";

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-sm font-bold text-accent">Step 2: 販売価格モードと単価設定</h3>
          <button onClick={onReset} className="text-xs px-2 py-0.5 border border-border rounded hover:bg-gray-50">リセット</button>
        </div>

        {/* 販売価格モード切り替え */}
        <div className="mb-3 bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-text-secondary mb-2">販売価格の算出方法</p>
          <div className="flex gap-2">
            {(["stackup", "unit-price"] as SalesPriceMode[]).map((mode) => (
              <button key={mode} onClick={() => onChange({ ...config, salesPriceMode: mode })}
                className={`flex-1 text-xs py-1.5 px-2 rounded border font-medium transition-colors ${
                  config.salesPriceMode === mode ? "bg-accent text-white border-accent" : "border-border text-text-muted hover:border-accent"
                }`}>
                {mode === "stackup" ? "積み上げ（推奨）" : "面積単価"}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-1.5">
            {isStackup
              ? "直接業務費 × 1.421（一般管理費等）+ 外部委託費 で自動算出"
              : "ドローン面積 × 設定単価 + 解析面積 × 設定単価 で算出"}
          </p>
        </div>

        {/* 積み上げモード: ロープアクセス単価のみ調整 */}
        {isStackup && (
          <div className="space-y-4">
            <SliderField label="ロープアクセス 顧客単価（従来工法比較用）" value={config.ropeAccessPricePerM2}
              onChange={(v) => onChange({ ...config, ropeAccessPricePerM2: v })} min={300} max={800} step={10} unit="円/m2" />
          </div>
        )}

        {/* 面積単価モード: 単価設定 */}
        {!isStackup && (
          <div className="space-y-4">
            <SliderField label="ドローン赤外線調査 単価" value={config.unitPriceDronePerM2}
              onChange={(v) => onChange({ ...config, unitPriceDronePerM2: v })} min={100} max={500} step={10} unit="円/m2" />
            <SliderField label="解析 単価" value={config.unitPriceAnalysisPerM2}
              onChange={(v) => onChange({ ...config, unitPriceAnalysisPerM2: v })} min={30} max={200} step={5} unit="円/m2" />
            <SliderField label="ロープアクセス 顧客単価" value={config.ropeAccessPricePerM2}
              onChange={(v) => onChange({ ...config, ropeAccessPricePerM2: v })} min={300} max={800} step={10} unit="円/m2" />
          </div>
        )}
      </div>

      {/* 上級者向け: 原価パラメータ */}
      <div className="border-t border-border pt-3">
        <button onClick={() => setShowConstants(!showConstants)} className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary">
          <span className={`transition-transform ${showConstants ? "rotate-90" : ""}`}>&#9654;</span>
          原価パラメータ（上級者向け）
        </button>
        {showConstants && (
          <div className="mt-3 space-y-3 text-xs">
            <div className="bg-gray-50 rounded p-3">
              <h4 className="font-bold text-text-secondary mb-1">人件費（販売単価・国交省R7 / 時）</h4>
              <p className="text-xs text-text-muted mb-2">1日 = 8時間換算。原価単価はStep 3で調整</p>
              <div className="space-y-1.5">
                <ConstantField label="現場責任者 ×1" value={config.personnelSalesRates.siteManager} unit="円/h"
                  isDefault={config.personnelSalesRates.siteManager === DEFAULT_CONFIG.personnelSalesRates.siteManager}
                  onChange={(v) => {
                    const rates = { ...config.personnelSalesRates, siteManager: v };
                    const cnt = config.personnelCount;
                    const daily = Math.round((rates.siteManager * cnt.siteManager + rates.pilot * cnt.pilot + rates.photographer * cnt.photographer + rates.assistantOrTechB * cnt.assistantOrTechB) * 8);
                    onChange({ ...config, personnelSalesRates: rates, fixedPersonnelSalesPerDay: daily });
                  }} />
                <ConstantField label="操縦士 ×1" value={config.personnelSalesRates.pilot} unit="円/h"
                  isDefault={config.personnelSalesRates.pilot === DEFAULT_CONFIG.personnelSalesRates.pilot}
                  onChange={(v) => {
                    const rates = { ...config.personnelSalesRates, pilot: v };
                    const cnt = config.personnelCount;
                    const daily = Math.round((rates.siteManager * cnt.siteManager + rates.pilot * cnt.pilot + rates.photographer * cnt.photographer + rates.assistantOrTechB * cnt.assistantOrTechB) * 8);
                    onChange({ ...config, personnelSalesRates: rates, fixedPersonnelSalesPerDay: daily });
                  }} />
                <ConstantField label="撮影士 ×1" value={config.personnelSalesRates.photographer} unit="円/h"
                  isDefault={config.personnelSalesRates.photographer === DEFAULT_CONFIG.personnelSalesRates.photographer}
                  onChange={(v) => {
                    const rates = { ...config.personnelSalesRates, photographer: v };
                    const cnt = config.personnelCount;
                    const daily = Math.round((rates.siteManager * cnt.siteManager + rates.pilot * cnt.pilot + rates.photographer * cnt.photographer + rates.assistantOrTechB * cnt.assistantOrTechB) * 8);
                    onChange({ ...config, personnelSalesRates: rates, fixedPersonnelSalesPerDay: daily });
                  }} />
                <ConstantField label="助手/技師B ×2" value={config.personnelSalesRates.assistantOrTechB} unit="円/h(1人)"
                  isDefault={config.personnelSalesRates.assistantOrTechB === DEFAULT_CONFIG.personnelSalesRates.assistantOrTechB}
                  onChange={(v) => {
                    const rates = { ...config.personnelSalesRates, assistantOrTechB: v };
                    const cnt = config.personnelCount;
                    const daily = Math.round((rates.siteManager * cnt.siteManager + rates.pilot * cnt.pilot + rates.photographer * cnt.photographer + rates.assistantOrTechB * cnt.assistantOrTechB) * 8);
                    onChange({ ...config, personnelSalesRates: rates, fixedPersonnelSalesPerDay: daily });
                  }} />
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-border font-bold text-text-secondary">
                販売人件費計: {config.fixedPersonnelSalesPerDay.toLocaleString()}円/日
              </div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <h4 className="font-bold text-text-secondary mb-2">機材・解析</h4>
              <div className="space-y-1.5">
                <ConstantField label="UAV損料（初日）" value={config.equipment.uavFirstDay} unit="円/日"
                  isDefault={config.equipment.uavFirstDay === DEFAULT_CONFIG.equipment.uavFirstDay}
                  onChange={(v) => onChange({ ...config, equipment: { ...config.equipment, uavFirstDay: v } })} />
                <ConstantField label="UAV損料（2日目〜）" value={config.equipment.uavSubsequentPerDay} unit="円/日"
                  isDefault={config.equipment.uavSubsequentPerDay === DEFAULT_CONFIG.equipment.uavSubsequentPerDay}
                  onChange={(v) => onChange({ ...config, equipment: { ...config.equipment, uavSubsequentPerDay: v } })} />
                <ConstantField label="車両損料" value={config.equipment.vehiclePerDay} unit="円/日"
                  isDefault={config.equipment.vehiclePerDay === DEFAULT_CONFIG.equipment.vehiclePerDay}
                  onChange={(v) => onChange({ ...config, equipment: { ...config.equipment, vehiclePerDay: v } })} />
                <ConstantField label="IRカメラ" value={config.equipment.irCameraPerDay} unit="円/日"
                  isDefault={config.equipment.irCameraPerDay === DEFAULT_CONFIG.equipment.irCameraPerDay}
                  onChange={(v) => onChange({ ...config, equipment: { ...config.equipment, irCameraPerDay: v } })} />
                <ConstantField label="外注解析" value={config.irAnalysis.outsourceCostPerM2} unit="円/m2"
                  isDefault={config.irAnalysis.outsourceCostPerM2 === DEFAULT_CONFIG.irAnalysis.outsourceCostPerM2}
                  onChange={(v) => onChange({ ...config, irAnalysis: { ...config.irAnalysis, outsourceCostPerM2: v } })} />
                <ConstantField label="自社解析" value={config.irAnalysis.internalCostPerM2} unit="円/m2"
                  isDefault={config.irAnalysis.internalCostPerM2 === DEFAULT_CONFIG.irAnalysis.internalCostPerM2}
                  onChange={(v) => onChange({ ...config, irAnalysis: { ...config.irAnalysis, internalCostPerM2: v } })} />
              </div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <h4 className="font-bold text-text-secondary mb-2">調査能力・外注費</h4>
              <div className="space-y-1.5">
                <ConstantField label="調査能力（ドローン）" value={config.droneCapacityPerHour} unit="m2/h"
                  isDefault={config.droneCapacityPerHour === DEFAULT_CONFIG.droneCapacityPerHour}
                  onChange={(v) => onChange({ ...config, droneCapacityPerHour: v })} />
                <ConstantField label="調査能力（地上IR）" value={config.groundIRCapacityPerHour} unit="m2/h"
                  isDefault={config.groundIRCapacityPerHour === DEFAULT_CONFIG.groundIRCapacityPerHour}
                  onChange={(v) => onChange({ ...config, groundIRCapacityPerHour: v })} />
                <ConstantField label="飛行作業時間/日" value={config.workHoursPerDay} unit="h"
                  isDefault={config.workHoursPerDay === DEFAULT_CONFIG.workHoursPerDay}
                  onChange={(v) => onChange({ ...config, workHoursPerDay: v })} />
                <ConstantField label="ロープアクセス外注（打診）" value={config.ropeAccessOutsourcePerM2} unit="円/m2"
                  isDefault={config.ropeAccessOutsourcePerM2 === DEFAULT_CONFIG.ropeAccessOutsourcePerM2}
                  onChange={(v) => onChange({ ...config, ropeAccessOutsourcePerM2: v })} />
                <ConstantField label="報告書作成費" value={config.reportFee} unit="円/件"
                  isDefault={config.reportFee === DEFAULT_CONFIG.reportFee}
                  onChange={(v) => onChange({ ...config, reportFee: v })} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Self-Improvement Simulation ---

function SelfImprovementSection({ config, futureOverrides, onChange, onReset }: {
  config: CostConfig;
  futureOverrides: FutureOverrides;
  onChange: (ov: FutureOverrides) => void;
  onReset: () => void;
}) {
  const futureConfig = useMemo(() => applyFutureOverrides(config, futureOverrides), [config, futureOverrides]);

  return (
    <div className="space-y-3">
      <div className="bg-green-50 border border-green-200 rounded p-3 text-xs text-green-800">
        <p className="font-medium mb-1">この設定が「将来（自社化後）」シナリオに反映されます</p>
        <p className="text-green-700">「シナリオ比較」タブで現状との差額を確認できます。最も効果が大きいのは解析内製化です。</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 p-2 rounded border border-border">
          <div>
            <div className="text-sm font-medium">解析費（外注→内製化）</div>
            <div className="text-xs text-text-muted">最大インパクト: {(config.irAnalysis.outsourceCostPerM2 - config.irAnalysis.internalCostPerM2).toLocaleString()}円/m2 削減</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{config.irAnalysis.outsourceCostPerM2}円/m2 →</span>
            <input type="number" value={futureOverrides.irAnalysisCostPerM2}
              onChange={(e) => onChange({ ...futureOverrides, irAnalysisCostPerM2: Number(e.target.value) || 0 })}
              className={`w-16 border rounded px-1.5 py-0.5 text-sm text-right ${futureOverrides.irAnalysisCostPerM2 !== config.irAnalysis.outsourceCostPerM2 ? "border-green-400 bg-green-50 text-green-800" : "border-border"}`} />
            <span className="text-xs text-text-muted">円/m2</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 p-2 rounded border border-border">
          <div>
            <div className="text-sm font-medium">UAV機材費（自社保有）</div>
            <div className="text-xs text-text-muted">初日: {config.equipment.uavFirstDay.toLocaleString()}円 → 減価償却費に変更</div>
          </div>
          <div className="flex items-center gap-2">
            <input type="number" value={futureOverrides.uavFirstDay ?? config.equipment.uavFirstDay}
              onChange={(e) => onChange({ ...futureOverrides, uavFirstDay: Number(e.target.value) || 0 })}
              className={`w-20 border rounded px-1.5 py-0.5 text-sm text-right ${futureOverrides.uavFirstDay !== undefined && futureOverrides.uavFirstDay !== config.equipment.uavFirstDay ? "border-green-400 bg-green-50 text-green-800" : "border-border"}`} />
            <span className="text-xs text-text-muted">円/日</span>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded p-2 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-text-muted">将来時の人件費（原価）</span>
          <span className="font-medium">{futureConfig.fixedPersonnelCostPerDay.toLocaleString()}円/日</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-text-muted">将来時の解析費</span>
          <span className="font-medium">{futureOverrides.irAnalysisCostPerM2}円/m2</span>
        </div>
      </div>

      <button onClick={onReset} className="w-full text-xs py-1 border border-border rounded text-text-muted hover:bg-gray-50">
        デフォルトに戻す
      </button>
    </div>
  );
}

// --- Q&A Types and Component ---

type QAItem = {
  ステータス: string;
  "No.": string;
  カテゴリ: string;
  想定質問: string;
  "回答のポイント（初期案）": string;
  想定されるタイミング: string;
};

type CustomQAItem = {
  id: string;
  カテゴリ: string;
  想定質問: string;
  回答ポイント: string;
  isCustom: true;
};

function QATab() {
  const baseItems: QAItem[] = ((qaData as { 想定QA: QAItem[] }).想定QA ?? []).filter((item) => item["No."] && item.想定質問);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("すべて");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("qa-checked") || "[]")); } catch { return new Set(); }
  });
  const [checkCounts, setCheckCounts] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("qa-check-counts") || "{}"); } catch { return {}; }
  });
  const [customItems, setCustomItems] = useState<CustomQAItem[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("qa-custom") || "[]"); } catch { return []; }
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newQ, setNewQ] = useState({ カテゴリ: "", 想定質問: "", 回答ポイント: "" });
  const [showFrequent, setShowFrequent] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("qa-checked", JSON.stringify([...checkedIds])); } catch {}
  }, [checkedIds]);

  useEffect(() => {
    try { localStorage.setItem("qa-check-counts", JSON.stringify(checkCounts)); } catch {}
  }, [checkCounts]);

  useEffect(() => {
    try { localStorage.setItem("qa-custom", JSON.stringify(customItems)); } catch {}
  }, [customItems]);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else {
        next.add(id);
        setCheckCounts((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
      }
      return next;
    });
  };

  const addCustom = () => {
    if (!newQ.想定質問.trim()) return;
    const item: CustomQAItem = { id: `custom-${Date.now()}`, ...newQ, isCustom: true };
    setCustomItems((prev) => [...prev, item]);
    setNewQ({ カテゴリ: "", 想定質問: "", 回答ポイント: "" });
    setShowAddForm(false);
  };

  const removeCustom = (id: string) => setCustomItems((prev) => prev.filter((i) => i.id !== id));

  const allIds = useMemo(() => new Set([...baseItems.map((i) => i["No."]), ...customItems.map((i) => i.id)]), [baseItems, customItems]);
  const categories = useMemo(() => {
    const cats = Array.from(new Set([...baseItems.map((i) => i.カテゴリ), ...customItems.map((i) => i.カテゴリ)])).filter(Boolean);
    return ["すべて", ...cats];
  }, [baseItems, customItems]);

  const normalizedSearch = normalizeForSearch(search);

  const filteredBase = useMemo(() => baseItems.filter((item) => {
    const matchCat = activeCategory === "すべて" || item.カテゴリ === activeCategory;
    const matchFreq = !showFrequent || checkedIds.has(item["No."]) || (checkCounts[item["No."]] || 0) > 0;
    const matchSearch = normalizedSearch === "" ||
      normalizeForSearch(item.想定質問).includes(normalizedSearch) ||
      normalizeForSearch(item["回答のポイント（初期案）"]).includes(normalizedSearch) ||
      normalizeForSearch(item.カテゴリ).includes(normalizedSearch);
    return matchCat && matchSearch && matchFreq;
  }), [baseItems, activeCategory, normalizedSearch, showFrequent, checkedIds, checkCounts]);

  const filteredCustom = useMemo(() => customItems.filter((item) => {
    const matchCat = activeCategory === "すべて" || item.カテゴリ === activeCategory;
    const matchSearch = normalizedSearch === "" ||
      normalizeForSearch(item.想定質問).includes(normalizedSearch) ||
      normalizeForSearch(item.回答ポイント).includes(normalizedSearch);
    return matchCat && matchSearch;
  }), [customItems, activeCategory, normalizedSearch]);

  const frequentItems = useMemo(() => Object.entries(checkCounts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5), [checkCounts]);

  const categoryColors: Record<string, string> = {
    コスト: "bg-blue-100 text-blue-700 border-blue-200", 品質: "bg-green-100 text-green-700 border-green-200",
    技術: "bg-purple-100 text-purple-700 border-purple-200", 法規制: "bg-orange-100 text-orange-700 border-orange-200",
    安全: "bg-red-100 text-red-700 border-red-200", 工程: "bg-yellow-100 text-yellow-700 border-yellow-200",
    契約: "bg-pink-100 text-pink-700 border-pink-200",
  };
  const getCategoryStyle = (cat: string) => categoryColors[cat] ?? "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex gap-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="質問・カテゴリを検索..."
          className="flex-1 border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
        <button onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs px-3 py-2 border border-accent text-accent rounded-lg hover:bg-accent hover:text-white transition-colors whitespace-nowrap">
          + Q&A追加
        </button>
      </div>

      {showAddForm && (
        <div className="bg-gray-50 rounded-lg border border-border p-4 space-y-2">
          <p className="text-xs font-medium text-text-secondary">カスタムQ&Aを追加</p>
          <input type="text" value={newQ.カテゴリ} onChange={(e) => setNewQ({ ...newQ, カテゴリ: e.target.value })} placeholder="カテゴリ"
            className="w-full border border-border rounded px-3 py-1.5 text-sm" />
          <input type="text" value={newQ.想定質問} onChange={(e) => setNewQ({ ...newQ, 想定質問: e.target.value })} placeholder="想定質問 *"
            className="w-full border border-border rounded px-3 py-1.5 text-sm" />
          <textarea value={newQ.回答ポイント} onChange={(e) => setNewQ({ ...newQ, 回答ポイント: e.target.value })} placeholder="回答のポイント"
            rows={2} className="w-full border border-border rounded px-3 py-1.5 text-sm resize-none" />
          <div className="flex gap-2">
            <button onClick={addCustom} className="text-xs px-3 py-1 bg-accent text-white rounded hover:bg-accent/90">保存</button>
            <button onClick={() => setShowAddForm(false)} className="text-xs px-3 py-1 border border-border rounded">キャンセル</button>
          </div>
        </div>
      )}

      {frequentItems.length > 0 && (
        <div>
          <button onClick={() => setShowFrequent(!showFrequent)} className="text-xs text-text-muted hover:text-accent flex items-center gap-1">
            <span className={`transition-transform ${showFrequent ? "rotate-90" : ""}`}>&#9654;</span>
            よく確認される質問 TOP{frequentItems.length}
          </button>
          {showFrequent && (
            <div className="mt-2 space-y-1">
              {frequentItems.map(([id, count]) => {
                const item = baseItems.find((i) => i["No."] === id);
                if (!item) return null;
                return (
                  <div key={id} className="flex items-center gap-2 text-xs text-text-secondary">
                    <span className="bg-accent text-white rounded-full px-1.5 py-0.5 font-bold">{count}</span>
                    <span>{item.想定質問}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              activeCategory === cat ? "bg-accent text-white border-accent" : "border-border text-text-muted hover:border-accent hover:text-accent"
            }`}>{cat}</button>
        ))}
      </div>
      <p className="text-xs text-text-muted">{filteredBase.length + filteredCustom.length} 件（チェック済: {checkedIds.size}件）</p>

      <div className="space-y-3">
        {filteredCustom.map((item) => (
          <div key={item.id} className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded font-medium">カスタム</span>
              {item.カテゴリ && <span className={`text-xs px-2 py-0.5 rounded border font-medium ${getCategoryStyle(item.カテゴリ)}`}>{item.カテゴリ}</span>}
              <button onClick={() => removeCustom(item.id)} className="ml-auto text-xs text-red-400 hover:text-red-600">削除</button>
            </div>
            <p className="text-sm font-semibold text-text-primary">Q. {item.想定質問}</p>
            {item.回答ポイント && <p className="text-sm text-text-secondary pl-3 border-l-2 border-yellow-400/40">{item.回答ポイント}</p>}
          </div>
        ))}
        {filteredBase.map((item) => (
          <div key={item["No."]} className={`bg-white rounded-lg border p-4 space-y-2 ${checkedIds.has(item["No."]) ? "border-accent/40 bg-accent/5" : "border-border"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => toggleCheck(item["No."])} title="確認済みにする"
                className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${checkedIds.has(item["No."]) ? "bg-accent border-accent text-white" : "border-gray-300 hover:border-accent"}`}>
                {checkedIds.has(item["No."]) && <span className="text-xs">✓</span>}
              </button>
              <span className="text-xs text-text-muted font-mono">#{item["No."]}</span>
              <span className={`text-xs px-2 py-0.5 rounded border font-medium ${getCategoryStyle(item.カテゴリ)}`}>{item.カテゴリ}</span>
              {item.想定されるタイミング && (
                <span className="text-xs px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">{item.想定されるタイミング}</span>
              )}
              {(checkCounts[item["No."]] || 0) > 0 && (
                <span className="ml-auto text-xs text-text-muted">{checkCounts[item["No."]]}回確認</span>
              )}
            </div>
            <p className="text-sm font-semibold text-text-primary leading-relaxed">Q. {item.想定質問}</p>
            {item["回答のポイント（初期案）"] && (
              <p className="text-sm text-text-secondary leading-relaxed pl-3 border-l-2 border-accent/40">{item["回答のポイント（初期案）"]}</p>
            )}
          </div>
        ))}
        {filteredBase.length === 0 && filteredCustom.length === 0 && (
          <p className="text-sm text-text-muted text-center py-12">該当する質問が見つかりませんでした</p>
        )}
      </div>
    </div>
  );
}

// --- Glossary ---

type GlossaryItem = {
  カテゴリ: string;
  用語: string;
  reading?: string;
  回答作成ステータス: string;
  意味: string;
  使用例: string;
};

function GlossaryAccordion({ category, terms, forceOpen }: { category: string; terms: GlossaryItem[]; forceOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  return (
    <div className="bg-white rounded-lg border border-border overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left">
        <span className="text-sm font-bold text-text-secondary">{category}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-gray-100 text-text-muted px-2 py-0.5 rounded-full">{terms.length}</span>
          <span className={`text-xs text-text-muted transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}>&#9654;</span>
        </div>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {terms.map((term, i) => (
              <div key={i} className="border border-border rounded-md px-3 py-2 hover:bg-gray-50">
                <p className="text-sm font-bold text-text-primary leading-tight">
                  {term.用語}
                  {term.reading && <span className="text-xs text-text-muted font-normal ml-1">（{term.reading}）</span>}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">{term.意味}</p>
                {term.使用例 && <p className="text-xs text-text-muted italic mt-1 opacity-80">例: {term.使用例}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GlossaryTab() {
  const allTerms: GlossaryItem[] = (glossaryData as { 不動産用語集: GlossaryItem[] }).不動産用語集 ?? [];
  const [search, setSearch] = useState("");

  const normalizedSearch = normalizeForSearch(search);

  const filtered = useMemo(() => {
    if (normalizedSearch === "") return allTerms;
    return allTerms.filter((item) => {
      const searchable = [
        item.用語,
        item.reading ?? "",
        item.意味,
        item.カテゴリ,
        item.使用例 ?? "",
      ].map(normalizeForSearch).join(" ");
      return searchable.includes(normalizedSearch);
    });
  }, [allTerms, normalizedSearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, GlossaryItem[]>();
    for (const item of filtered) {
      const cat = item.カテゴリ || "その他";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [filtered]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="用語・意味・カテゴリを検索（かな/カナ/漢字・大文字小文字区別なし）..."
        className="w-full border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
      <p className="text-xs text-text-muted">全 {filtered.length} 件 / {grouped.size} カテゴリ</p>
      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([category, terms]) => (
          <GlossaryAccordion key={category} category={category} terms={terms} forceOpen={normalizedSearch.length > 0} />
        ))}
        {grouped.size === 0 && <p className="text-sm text-text-muted text-center py-12">該当する用語が見つかりませんでした</p>}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function EstimatePage() {
  const [activeTab, setActiveTab] = useState<"estimate" | "qa" | "glossary">("estimate");
  const [areaInputMode, setAreaInputMode] = useState<"direct" | "calc">("direct");
  const [perimeterInput, setPerimeterInput] = useState(0);

  const [building, setBuilding] = useState<BuildingInput>({
    name: "",
    totalArea: 3000,
    height: 30,
    faces: [
      createDefaultFace("北面", 900),
      createDefaultFace("東面", 600),
      createDefaultFace("南面", 900),
      createDefaultFace("西面", 600),
    ],
  });

  const [config, setConfig] = useState<CostConfig>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("drone-estimate-config");
        const ver = localStorage.getItem("drone-estimate-config-ver");
        if (saved && ver === "5") return JSON.parse(saved) as CostConfig;
        localStorage.removeItem("drone-estimate-config");
      } catch {}
    }
    return { ...DEFAULT_CONFIG };
  });

  const [showFaces, setShowFaces] = useState(false);
  const [areaPerMeter, setAreaPerMeter] = useState(DEFAULT_AREA_PER_METER);

  useEffect(() => {
    try {
      localStorage.setItem("drone-estimate-config", JSON.stringify(config));
      localStorage.setItem("drone-estimate-config-ver", "5");
    } catch {}
  }, [config]);

  const [futureOverrides, setFutureOverrides] = useState<FutureOverrides>({ ...DEFAULT_FUTURE_OVERRIDES });

  const result = useMemo(() => calculateEstimate(building, config, futureOverrides), [building, config, futureOverrides]);
  const futureConfig = useMemo(() => applyFutureOverrides(config, futureOverrides), [config, futureOverrides]);

  const applyPreset = useCallback((presetIndex: number) => {
    const p = PRESETS[presetIndex];
    setBuilding({ name: p.name, totalArea: p.totalArea, height: p.height, faces: p.faces.map((f) => ({ ...f })) });
  }, []);

  const updateFace = useCallback((index: number, face: FaceInput) => {
    setBuilding((prev) => {
      const faces = [...prev.faces];
      faces[index] = face;
      const totalArea = faces.reduce((s, f) => s + f.area, 0);
      return { ...prev, faces, totalArea };
    });
  }, []);

  const removeFace = useCallback((index: number) => {
    setBuilding((prev) => {
      const faces = prev.faces.filter((_, i) => i !== index);
      const totalArea = faces.reduce((s, f) => s + f.area, 0);
      return { ...prev, faces, totalArea };
    });
  }, []);

  const addFace = useCallback(() => {
    setBuilding((prev) => ({ ...prev, faces: [...prev.faces, createDefaultFace(`面${prev.faces.length + 1}`, 0)] }));
  }, []);

  // 高さ×周長モードで面積を計算
  const handleCalcAreaUpdate = useCallback((height: number, perimeter: number) => {
    const newTotal = Math.round(height * perimeter);
    if (newTotal <= 0) return;
    const currentSum = building.faces.reduce((s, f) => s + f.area, 0);
    let newFaces: FaceInput[];
    if (currentSum === 0 || building.faces.length === 0) {
      const long = Math.round(newTotal * 0.3);
      const short = Math.round(newTotal * 0.2);
      newFaces = [createDefaultFace("北面", long), createDefaultFace("東面", short), createDefaultFace("南面", long), createDefaultFace("西面", short)];
    } else {
      const ratio = newTotal / currentSum;
      newFaces = building.faces.map((f) => ({
        ...f, area: Math.round(f.area * ratio),
        ropeAccessArea: f.accessLevel === "drone-impossible" ? Math.round(f.area * ratio) : f.ropeAccessArea,
      }));
    }
    setBuilding((prev) => ({ ...prev, height, totalArea: newTotal, faces: newFaces }));
  }, [building.faces]);

  const overallBg = { ok: "bg-green-50 border-green-200", warning: "bg-yellow-50 border-yellow-200", blocker: "bg-red-50 border-red-200" };
  const overallLabel = { ok: "飛行可能", warning: "条件付き飛行可能", blocker: "飛行不可" };

  return (
    <div className="min-h-screen">
      <header className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">ミラテクドローン 見積もりシミュレーター</h1>
            <p className="text-sm text-blue-200 mt-0.5">ドローン外壁調査の概算見積もりを即時算出</p>
          </div>
          <a href="#results" className="lg:hidden text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors">結果を見る</a>
        </div>
      </header>

      <nav className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-0">
            {([{ key: "estimate", label: "見積もり" }, { key: "qa", label: "想定Q&A" }, { key: "glossary", label: "用語集" }] as const).map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
                }`}>{tab.label}</button>
            ))}
          </div>
        </div>
      </nav>

      {activeTab === "qa" && <QATab />}
      {activeTab === "glossary" && <GlossaryTab />}

      {activeTab === "estimate" && (
        <>
        <main className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Input Form */}
            <div className="lg:col-span-2 space-y-4">
              {/* Presets */}
              <div className="bg-white rounded-lg border border-border p-4">
                <h2 className="text-sm font-bold text-text-secondary mb-3">クイックプリセット</h2>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p, i) => (
                    <button key={i} onClick={() => applyPreset(i)}
                      className="text-xs px-3 py-1.5 border border-accent text-accent rounded-full hover:bg-accent hover:text-white transition-colors">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Building Info */}
              <div className="bg-white rounded-lg border-2 border-accent/30 p-4">
                <h2 className="text-sm font-bold text-accent mb-1">Step 1: ビル情報を入力</h2>
                <p className="text-xs text-text-muted mb-3">入力すると右側に見積もり結果が表示されます</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-text-muted">ビル名</label>
                    <input type="text" value={building.name} onChange={(e) => setBuilding({ ...building, name: e.target.value })}
                      placeholder="例: 新宿オフィスビル" className="w-full border border-border rounded px-3 py-2 text-sm" />
                  </div>

                  {/* 面積入力モード */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-text-muted">総外壁面積の入力方法</label>
                      <div className="flex rounded border border-gray-200 text-xs overflow-hidden">
                        <button onClick={() => setAreaInputMode("direct")}
                          className={`px-2 py-0.5 ${areaInputMode === "direct" ? "bg-accent text-white" : "text-text-muted hover:bg-gray-50"}`}>直接入力</button>
                        <button onClick={() => setAreaInputMode("calc")}
                          className={`px-2 py-0.5 ${areaInputMode === "calc" ? "bg-accent text-white" : "text-text-muted hover:bg-gray-50"}`}>高さ×外壁長</button>
                      </div>
                    </div>

                    {areaInputMode === "direct" ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-text-muted">総外壁面積 (m2)</label>
                          <input type="number" value={building.totalArea || ""} onChange={(e) => {
                            const newTotal = Number(e.target.value) || 0;
                            const currentSum = building.faces.reduce((s, f) => s + f.area, 0);
                            let newFaces: FaceInput[];
                            if (currentSum === 0 || building.faces.length === 0) {
                              const long = Math.round(newTotal * 0.3); const short = Math.round(newTotal * 0.2);
                              newFaces = [createDefaultFace("北面", long), createDefaultFace("東面", short), createDefaultFace("南面", long), createDefaultFace("西面", short)];
                            } else {
                              const ratio = newTotal / currentSum;
                              newFaces = building.faces.map((f) => ({ ...f, area: Math.round(f.area * ratio), ropeAccessArea: f.accessLevel === "drone-impossible" ? Math.round(f.area * ratio) : f.ropeAccessArea }));
                            }
                            setBuilding({ ...building, totalArea: newTotal, faces: newFaces });
                          }} className="w-full border border-border rounded px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-text-muted">高さ (m) 参考</label>
                          <input type="number" value={building.height || ""} onChange={(e) => setBuilding({ ...building, height: Number(e.target.value) || 0 })}
                            className="w-full border border-border rounded px-3 py-2 text-sm bg-gray-50" />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-text-muted">建物高さ (m)</label>
                            <input type="number" value={building.height || ""} onChange={(e) => {
                              const h = Number(e.target.value) || 0;
                              setBuilding((prev) => ({ ...prev, height: h }));
                              if (perimeterInput > 0) handleCalcAreaUpdate(h, perimeterInput);
                            }} className="w-full border border-border rounded px-3 py-2 text-sm" />
                          </div>
                          <div>
                            <label className="text-xs text-text-muted">外壁延長 (m)</label>
                            <input type="number" value={perimeterInput || ""} onChange={(e) => {
                              const p = Number(e.target.value) || 0;
                              setPerimeterInput(p);
                              if (building.height > 0) handleCalcAreaUpdate(building.height, p);
                            }} className="w-full border border-border rounded px-3 py-2 text-sm" placeholder="例: 100" />
                          </div>
                        </div>
                        <div className="text-xs text-text-muted bg-gray-50 rounded px-2 py-1">
                          総外壁面積 = {building.height}m × {perimeterInput}m = <span className="font-bold text-text-primary">{(building.height * perimeterInput).toLocaleString()} m2</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Face detail */}
              <div className="bg-white rounded-lg border border-border p-4">
                <div className="flex justify-between items-center mb-3">
                  <button onClick={() => setShowFaces(!showFaces)} className="flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-primary">
                    <span className={`transition-transform text-xs ${showFaces ? "rotate-90" : ""}`}>&#9654;</span>
                    各面の詳細調整
                    <span className="text-xs font-normal text-text-muted">（{building.faces.length}面 / 総面積から自動配分済み）</span>
                  </button>
                  {showFaces && (
                    <button onClick={addFace} className="text-xs px-2 py-1 border border-accent text-accent rounded hover:bg-accent hover:text-white transition-colors">+ 面を追加</button>
                  )}
                </div>
                {showFaces && (
                  <>
                    <div className="space-y-3">
                      {building.faces.map((face, i) => (
                        <FaceEditor key={i} face={face} index={i} onChange={updateFace} onRemove={removeFace} />
                      ))}
                    </div>
                    {building.faces.length === 0 && <p className="text-sm text-text-muted text-center py-4">面が設定されていません</p>}
                  </>
                )}
              </div>

              {/* Config */}
              <div className="bg-white rounded-lg border border-border p-4">
                <ConfigEditor config={config} onChange={setConfig} onReset={() => setConfig({ ...DEFAULT_CONFIG })} />
              </div>

              {/* 自社化シミュレーション */}
              <div className="bg-white rounded-lg border-2 border-green-200 p-4">
                <h3 className="text-sm font-bold text-green-700 mb-1">Step 3: 自社化シミュレーション</h3>
                <p className="text-xs text-text-muted mb-3">「将来（自社化後）」シナリオのコストを設定します</p>
                <SelfImprovementSection
                  config={config}
                  futureOverrides={futureOverrides}
                  onChange={setFutureOverrides}
                  onReset={() => setFutureOverrides({ ...DEFAULT_FUTURE_OVERRIDES })}
                />
              </div>
            </div>

            {/* Right: Results */}
            <div id="results" className="lg:col-span-3 space-y-4">
              {building.faces.length === 0 ? (
                <div className="bg-gray-50 rounded-lg border border-border p-8 text-center">
                  <p className="text-text-muted">左側で面を追加すると、見積もり結果がここに表示されます</p>
                </div>
              ) : (
                <>
                {/* Hero: 見積金額 */}
                <div className="bg-white rounded-xl border-2 border-accent/30 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-muted">飛行可否:</span>
                      <FeasibilityBadge level={result.feasibility.overall} />
                      <span className="text-sm font-medium">{overallLabel[result.feasibility.overall]}</span>
                    </div>
                    <div className="text-sm text-text-muted">
                      調査日数: <span className="font-bold text-text-primary">{result.current.surveyDays}日</span>
                      <span className="text-xs ml-1">（{result.current.shootingHours.toFixed(1)}h）</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-text-muted mb-0.5">
                      {config.salesPriceMode === "unit-price" ? "面積単価モード" : "積み上げモード"} | ドローン外壁調査 概算見積
                    </div>
                    <div className="text-4xl font-bold text-primary tracking-tight">
                      {result.current.salesPrice.toLocaleString("ja-JP")}<span className="text-lg ml-1">円</span>
                    </div>
                    <div className="text-sm text-text-muted mt-1">
                      {result.current.perM2.sales} 円/m2 | 総面積 {building.totalArea.toLocaleString()} m2
                      {config.salesPriceMode === "stackup" && (
                        <span className="ml-2 text-xs">（面積単価換算: {result.current.impliedDroneUnitPrice}円/m2）</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
                    <div className="text-center">
                      <div className="text-xs text-text-muted">原価合計</div>
                      <div className="text-sm font-bold">{yen(result.current.costBreakdown.totalCost)}</div>
                      <div className="text-xs text-text-muted">{result.current.perM2.cost} 円/m2</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-text-muted">粗利</div>
                      <div className={`text-sm font-bold ${result.current.grossProfit >= 0 ? "text-positive" : "text-negative"}`}>{yen(result.current.grossProfit)}</div>
                      <div className={`text-xs ${result.current.grossProfitRate >= 0 ? "text-positive" : "text-negative"}`}>{pct(result.current.grossProfitRate)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-text-muted">営業利益</div>
                      <div className={`text-sm font-bold ${result.current.operatingProfit >= 0 ? "text-positive" : "text-negative"}`}>{yen(result.current.operatingProfit)}</div>
                      <div className="text-xs text-text-muted">{result.current.perM2.operatingProfit} 円/m2</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-text-muted">営業利益率</div>
                      <div className={`text-sm font-bold ${result.current.operatingProfitRate >= 0 ? "text-positive" : "text-negative"}`}>{pct(result.current.operatingProfitRate)}</div>
                      <div className="text-xs text-text-muted">販管費{config.sgaRatePercent}%控除後</div>
                    </div>
                  </div>
                </div>

                {/* ロープアクセスとの比較 */}
                <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl border border-accent/20 p-5">
                  <h3 className="text-sm font-bold text-text-secondary mb-1">従来工法（ロープアクセス）との比較</h3>
                  <p className="text-xs text-text-muted mb-4">全面をロープアクセスで実施した場合との価格差</p>
                  <ComparisonBar result={result} />
                </div>

                {/* 面積内訳 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg border border-border p-3 text-center">
                    <div className="text-xs text-text-muted">ドローン調査</div>
                    <div className="text-lg font-bold text-accent">{result.droneArea.toLocaleString()} <span className="text-xs font-normal">m2</span></div>
                  </div>
                  <div className="bg-white rounded-lg border border-border p-3 text-center">
                    <div className="text-xs text-text-muted">地上IR調査</div>
                    <div className="text-lg font-bold text-positive">{result.groundIRArea.toLocaleString()} <span className="text-xs font-normal">m2</span></div>
                  </div>
                  <div className="bg-white rounded-lg border border-border p-3 text-center">
                    <div className="text-xs text-text-muted">ロープアクセス</div>
                    <div className="text-lg font-bold text-negative">{result.ropeAccessArea.toLocaleString()} <span className="text-xs font-normal">m2</span></div>
                  </div>
                </div>

                {/* 算出ロジック */}
                <CollapsibleSection title="算出ロジックの説明" defaultOpen={false}>
                  <div className="text-xs text-text-secondary space-y-2">
                    <div>
                      <p className="font-bold mb-1">1. 調査日数の決定</p>
                      <p className="text-text-muted">調査時間 = ドローン面積 / {config.droneCapacityPerHour}m2/h。調査日数 = ceil(調査時間 / {config.workHoursPerDay}h/日) ×（最低1日）</p>
                    </div>
                    <div>
                      <p className="font-bold mb-1">2. 原価積算（コスト単価ベース）</p>
                      <p className="text-text-muted">人件費（原価: {config.fixedPersonnelCostPerDay.toLocaleString()}円/日）+ 機材費 + 外部委託費（解析 + ロープ外注 + 報告書）= 合計原価</p>
                    </div>
                    <div>
                      <p className="font-bold mb-1">3. 積み上げ販売価格</p>
                      <p className="text-text-muted">（人件費[販売: {config.fixedPersonnelSalesPerDay.toLocaleString()}円/日] + 機材費）× {1 + config.overheadRatePercent / 100}（一般管理費等{config.overheadRatePercent}%）+ 外部委託費</p>
                    </div>
                    <div>
                      <p className="font-bold mb-1">4. 利益計算</p>
                      <p className="text-text-muted">粗利 = 販売価格 − 原価。販管費 = 販売価格 × {config.sgaRatePercent}%。営業利益 = 粗利 − 販管費</p>
                    </div>
                  </div>
                </CollapsibleSection>

                {/* 飛行可否警告 */}
                {result.feasibility.overall !== "ok" && (
                  <div className={`rounded-lg border p-4 ${overallBg[result.feasibility.overall]}`}>
                    <FeasibilityPanel items={result.feasibility.items} />
                  </div>
                )}

                {/* 面別判定 */}
                <CollapsibleSection title="調査方法の面別判定" defaultOpen={true}>
                  <p className="text-xs text-text-muted mb-2">各面のラインドローンシステム適用可否と調査手法の一覧</p>
                  <FaceSummaryTable result={result} />
                </CollapsibleSection>

                {/* 感度分析: 高さ × 実施面数 */}
                <CollapsibleSection title="感度分析（建物高さ × ドローン実施面数）" defaultOpen={false}>
                  <div className="mb-3 flex items-center gap-3">
                    <label className="text-xs text-text-muted">面積換算係数</label>
                    <input type="number" value={areaPerMeter} onChange={(e) => setAreaPerMeter(Number(e.target.value) || DEFAULT_AREA_PER_METER)}
                      className="w-20 border border-border rounded px-2 py-0.5 text-sm text-right" />
                    <span className="text-xs text-text-muted">m2/m（高さ1mあたりの外壁面積）</span>
                  </div>
                  <HeightSensitivityTable config={config} areaPerMeter={areaPerMeter} />
                </CollapsibleSection>

                {/* シナリオ比較 */}
                <CollapsibleSection title="シナリオ比較（外注 vs 自社化）" defaultOpen={false}>
                  <div className="mb-3 bg-green-50 border border-green-200 rounded p-3 text-xs text-green-800">
                    <span className="font-medium">Step 3で設定した「自社化後」コストを使って比較しています。</span>
                    解析費: {config.irAnalysis.outsourceCostPerM2}円/m2 → {futureOverrides.irAnalysisCostPerM2}円/m2
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <ScenarioCard scenario={result.current} label="現状（解析外注）" config={config} />
                    <ScenarioCard scenario={result.future} label="将来（自社化後）" config={futureConfig} />
                  </div>
                  {result.future.operatingProfit > result.current.operatingProfit && (
                    <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-center">
                      <span className="font-bold text-positive">自社化による改善効果: </span>
                      営業利益 +{yen(result.future.operatingProfit - result.current.operatingProfit)}
                      （{pct(result.current.operatingProfitRate)} → {pct(result.future.operatingProfitRate)}）
                    </div>
                  )}
                </CollapsibleSection>
                </>
              )}
            </div>
          </div>
        </main>

        <div className="max-w-7xl mx-auto px-4 mt-4 no-print">
          <button onClick={() => window.print()}
            className="text-sm px-4 py-2 border border-accent text-accent rounded hover:bg-accent hover:text-white transition-colors">
            印刷 / PDF保存
          </button>
        </div>
        </>
      )}

      <footer className="border-t border-border mt-8 py-4">
        <p className="text-center text-xs text-text-muted">
          ミラテクドローン 見積もりシミュレーター v3.0 —
          価格モデル_外壁点検_v07準拠。概算見積もり用。正式見積もりは現地調査後に作成します。
        </p>
      </footer>
    </div>
  );
}
