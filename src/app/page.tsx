"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import qaData from "@/data/qa.json";
import glossaryData from "@/data/glossary.json";
import {
  type BuildingInput,
  type FaceInput,
  type CostConfig,
  type EstimateResult,
  type FeasibilityItem,
  type ScenarioResult,
  type SensitivityResult,
  type AccessLevel,
  type InspectionMethod,
  DEFAULT_CONFIG,
  type FutureOverrides,
  DEFAULT_FUTURE_OVERRIDES,
  applyFutureOverrides,
  PRESETS,
  createDefaultFace,
  calculateEstimate,
  calculateSensitivity,
} from "@/lib/estimate-engine";

// --- Helpers ---

function yen(n: number): string {
  return n.toLocaleString("ja-JP") + " 円";
}

function pct(n: number): string {
  return n.toFixed(1) + "%";
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

// --- Components ---

function FeasibilityBadge({ level }: { level: "ok" | "warning" | "blocker" }) {
  const styles = {
    ok: "bg-green-100 text-green-800 border-green-300",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-300",
    blocker: "bg-red-100 text-red-800 border-red-300",
  };
  const labels = { ok: "OK", warning: "注意", blocker: "不可" };
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-bold rounded border ${styles[level]}`}
    >
      {labels[level]}
    </span>
  );
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

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-border p-4 text-center">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${color ?? "text-text-primary"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-text-muted mt-1">{sub}</div>}
    </div>
  );
}

function FutureRow({
  label,
  unit,
  current,
  value,
  onChange,
  percentMode,
}: {
  label: string;
  unit: string;
  current: number;
  value: number;
  onChange: (v: number) => void;
  percentMode: boolean;
}) {
  const changed = value !== current;
  const pct = current > 0 ? Math.round((value / current) * 100) : 100;
  const diffPct = pct - 100;

  const handleChange = (raw: number) => {
    if (percentMode) {
      onChange(Math.round(current * raw / 100));
    } else {
      onChange(raw);
    }
  };

  const displayValue = percentMode ? pct : value;

  return (
    <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 text-sm">
      <span className="text-text-primary">
        {label}
        <span className="text-xs text-text-muted ml-1">{unit}</span>
      </span>
      <span className="text-right text-text-muted tabular-nums">{current.toLocaleString()}</span>
      <div className="flex flex-col items-end gap-0.5">
        <input
          type="number"
          value={displayValue}
          onChange={(e) => handleChange(Number(e.target.value) || 0)}
          className={`w-full border rounded px-1.5 py-0.5 text-sm text-right tabular-nums ${
            changed
              ? "border-green-400 bg-green-50 font-medium text-green-800"
              : "border-gray-200 bg-white"
          }`}
        />
        {changed && !percentMode && (
          <span className={`text-xs tabular-nums ${diffPct < 0 ? "text-positive" : "text-negative"}`}>
            {diffPct > 0 ? "+" : ""}{diffPct}%
          </span>
        )}
        {changed && percentMode && (
          <span className="text-xs text-text-muted tabular-nums">
            {value.toLocaleString()}{unit.split("/")[0].replace(/[^円a-z]/gi, "").trim() || "円"}
          </span>
        )}
      </div>
    </div>
  );
}

function ComparisonBar({ result }: { result: EstimateResult }) {
  const maxVal = Math.max(
    result.comparison.dronePrice,
    result.comparison.ropeAccessPrice,
    1
  );
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
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${dronePct}%` }}
          />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>ロープアクセス（全面）</span>
          <span className="font-bold">
            {yen(result.comparison.ropeAccessPrice)}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden">
          <div
            className="h-full bg-gray-400 rounded-full transition-all duration-500"
            style={{ width: `${ropePct}%` }}
          />
        </div>
      </div>
      <div className="text-center">
        <span
          className={`text-sm font-bold ${result.comparison.savings >= 0 ? "text-positive" : "text-negative"}`}
        >
          {result.comparison.savings >= 0 ? "削減額: " : "超過額: "}
          {yen(Math.abs(result.comparison.savings))}（
          {pct(Math.abs(result.comparison.savingsPercent))}）
        </span>
      </div>
    </div>
  );
}

// --- Scenario Card (Left=原価, Right=見積もり) ---

function ScenarioCard({ scenario, label, surveyDays, config, irArea, ropeArea }: {
  scenario: ScenarioResult;
  label: string;
  surveyDays: number;
  config: CostConfig;
  irArea: number;
  ropeArea: number;
}) {
  const irRate = label.includes("自社") ? config.irAnalysis.internalCostPerM2 : config.irAnalysis.outsourceCostPerM2;
  const equipPerDay = config.equipment.drone + config.equipment.irCamera + config.equipment.lineDroneSystem + config.equipment.vehicle + config.equipment.misc;

  return (
    <div className="bg-white rounded-lg border border-border p-4">
      <h3 className="text-sm font-bold text-text-secondary mb-3">{label}</h3>
      <div className="space-y-4">
        {/* 原価内訳 */}
        <div>
          <h4 className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">
            原価内訳
          </h4>
          <table className="w-full text-sm">
            <tbody>
              <CostRow label="人件費" value={scenario.costBreakdown.personnel}
                sub={`5名 x ${config.teamCostPerDay.toLocaleString()}円/日 x ${surveyDays}日`} />
              <CostRow label="機材費" value={scenario.costBreakdown.equipment}
                sub={`${equipPerDay.toLocaleString()}円/日 x ${surveyDays}日`} />
              <CostRow label="赤外線解析費" value={scenario.costBreakdown.irAnalysis}
                sub={irArea > 0 ? `${irArea.toLocaleString()}m2 x ${irRate}円/m2` : "対象なし"} />
              <CostRow label="交通費" value={scenario.costBreakdown.transportation}
                sub={`${config.transportationPerDay.toLocaleString()}円/日 x ${surveyDays}日`} />
              <CostRow label="ロープアクセス外注" value={scenario.costBreakdown.ropeAccessSubcontract}
                sub={ropeArea > 0 ? `${ropeArea.toLocaleString()}m2 x ${config.ropeAccessPercussionPerM2}円/m2` : "対象なし"} />
              <CostRow label="直接原価 小計" value={scenario.costBreakdown.directCost} bold />
              <CostRow label="一般管理費" value={scenario.costBreakdown.adminCost}
                sub={`直接原価 x ${config.adminRatePercent}%`} />
              <CostRow label="原価合計" value={scenario.costBreakdown.totalCost} bold />
            </tbody>
          </table>
        </div>

        {/* お客様向け見積もり */}
        <div>
          <h4 className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">
            お客様向け見積もり
          </h4>
          <table className="w-full text-sm">
            <tbody>
              {scenario.customerEstimate.droneIRFee > 0 && (
                <CostRow label="ドローン赤外線調査" value={scenario.customerEstimate.droneIRFee}
                  sub={`${Math.round(scenario.customerEstimate.droneIRFee / config.unitPricePerM2).toLocaleString()}m2 x ${config.unitPricePerM2}円/m2`} />
              )}
              {scenario.customerEstimate.groundIRFee > 0 && (
                <CostRow label="地上赤外線" value={scenario.customerEstimate.groundIRFee}
                  sub={`${Math.round(scenario.customerEstimate.groundIRFee / config.unitPricePerM2).toLocaleString()}m2 x ${config.unitPricePerM2}円/m2`} />
              )}
              {scenario.customerEstimate.ropePercussionFee > 0 && (
                <CostRow label="ロープアクセス打診" value={scenario.customerEstimate.ropePercussionFee}
                  sub={`${Math.round(scenario.customerEstimate.ropePercussionFee / config.ropeAccessPricePerM2).toLocaleString()}m2 x ${config.ropeAccessPricePerM2}円/m2`} />
              )}
              <CostRow label="見積もり合計" value={scenario.customerEstimate.totalEstimate} bold />
            </tbody>
          </table>

          {/* Profit summary */}
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted text-xs">粗利（売上－直接原価）</span>
              <span className={`font-bold ${scenario.grossProfit >= 0 ? "text-positive" : "text-negative"}`}>
                {yen(scenario.grossProfit)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted text-xs pl-2">粗利率</span>
              <span className={`text-sm ${scenario.grossProfitRate >= 0 ? "text-positive" : "text-negative"}`}>
                {pct(scenario.grossProfitRate)}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-1 border-t border-dashed border-gray-100">
              <span className="text-text-muted text-xs">営業利益（粗利－一般管理費）</span>
              <span className={`font-bold ${scenario.profit >= 0 ? "text-positive" : "text-negative"}`}>
                {yen(scenario.profit)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted text-xs pl-2">営業利益率</span>
              <span className={`text-sm ${scenario.profitRate >= 0 ? "text-positive" : "text-negative"}`}>
                {pct(scenario.profitRate)}
              </span>
            </div>
          </div>
        </div>
      </div>
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

// --- Collapsible Section ---

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-lg border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-bold text-text-secondary">{title}</span>
        <span className={`text-xs text-text-muted transition-transform ${open ? "rotate-90" : ""}`}>
          &#9654;
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
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
                <td className="py-2 text-center">
                  <span className={`text-lg font-bold ${access.color}`}>
                    {access.symbol}
                  </span>
                </td>
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

// --- Sensitivity Analysis Table ---

function SensitivityTable({
  building,
  config,
}: {
  building: BuildingInput;
  config: CostConfig;
}) {
  const sensitivity = useMemo(
    () =>
      calculateSensitivity(building, config, {
        min: 150,
        max: 400,
        step: 50,
      }),
    [building, config]
  );

  if (sensitivity.rows.length === 0) return null;

  return (
    <div>
      <p className="text-xs text-text-muted mb-3">
        販売単価とドローン適用面数による利益シミュレーション（現在の単価: {config.unitPricePerM2}円/m2）
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="text-left py-2 px-2 font-medium text-text-secondary whitespace-nowrap">
                販売単価
              </th>
              {sensitivity.scenarios.map((s) => (
                <th
                  key={s}
                  className="text-center py-2 px-2 font-medium text-text-secondary whitespace-nowrap"
                >
                  <div>{s}</div>
                  <div className="text-xs font-normal text-text-muted">販売価格 / 利益</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sensitivity.rows.map((row) => {
              const isCurrentPrice = row.unitPrice === config.unitPricePerM2;
              return (
                <tr
                  key={row.unitPrice}
                  className={`border-b border-border ${isCurrentPrice ? "bg-accent/10 font-bold" : ""}`}
                >
                  <td className="py-2 px-2 whitespace-nowrap">
                    {row.unitPrice}円/m2
                    {isCurrentPrice && (
                      <span className="ml-1 text-xs text-accent">← 現在</span>
                    )}
                  </td>
                  {row.scenarios.map((sc) => (
                    <td key={sc.label} className="py-2 px-2 text-center">
                      <div className="text-xs text-text-muted mb-0.5">
                        {sc.salesPrice.toLocaleString("ja-JP")}円
                      </div>
                      <div
                        className={`rounded px-2 py-1 ${sc.profit >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                      >
                        <div className="text-xs">
                          {sc.profit >= 0 ? "+" : ""}
                          {sc.profit.toLocaleString("ja-JP")}円
                        </div>
                        <div className="text-xs opacity-75">
                          ({sc.profitRate.toFixed(1)}%)
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted mt-2">
        ※ 利益 = 販売価格 - 原価（解析外注時）。ロープアクセス面は500円/m2で計算。
      </p>
    </div>
  );

}

// --- Face Editor ---

function FaceEditor({
  face,
  index,
  onChange,
  onRemove,
}: {
  face: FaceInput;
  index: number;
  onChange: (index: number, face: FaceInput) => void;
  onRemove: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const update = (patch: Partial<FaceInput>) => {
    onChange(index, { ...face, ...patch });
  };

  const access = ACCESS_LABELS[face.accessLevel];

  return (
    <div className={`border rounded-lg p-3 ${access.bg}`}>
      {/* Row 1: 面名 + 面積 + ドローン可否 + 削除 */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-lg font-bold ${access.color} shrink-0`}>
          {access.symbol}
        </span>
        <input
          type="text"
          value={face.name}
          onChange={(e) => update({ name: e.target.value })}
          className="font-bold text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 w-16"
        />
        <input
          type="number"
          value={face.area || ""}
          onChange={(e) => {
            const area = Number(e.target.value) || 0;
            const patch: Partial<FaceInput> = { area };
            if (face.accessLevel === "drone-impossible") {
              patch.ropeAccessArea = area;
            }
            update(patch);
          }}
          className="w-20 border border-border rounded px-2 py-1 text-sm bg-white"
          placeholder="面積"
        />
        <span className="text-xs text-text-muted">m2</span>
        <select
          value={face.accessLevel}
          onChange={(e) => {
            const level = e.target.value as AccessLevel;
            const patch: Partial<FaceInput> = { accessLevel: level };
            if (level === "drone-impossible") {
              patch.inspectionMethod = "percussion";
              patch.ropeAccessArea = face.area;
            } else {
              patch.inspectionMethod = "infrared";
              patch.ropeAccessArea = 0;
            }
            update(patch);
          }}
          className="text-xs border border-border rounded px-1 py-1 bg-white"
        >
          <option value="drone-possible">実施可能</option>
          <option value="drone-impossible">実施不可</option>
        </select>
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-text-muted hover:text-accent"
            title="詳細設定"
          >
            {expanded ? "閉じる" : "詳細"}
          </button>
          <button
            onClick={() => onRemove(index)}
            className="text-xs text-text-muted hover:text-negative"
          >
            削除
          </button>
        </div>
      </div>

      {/* Expanded: 詳細設定 */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <label className="text-xs text-text-muted">検査方法</label>
              <select
                value={face.inspectionMethod}
                onChange={(e) =>
                  update({ inspectionMethod: e.target.value as InspectionMethod })
                }
                className="w-full border border-border rounded px-2 py-1 text-sm bg-white"
              >
                <option value="infrared">赤外線</option>
                <option value="percussion">打診</option>
                <option value="visual">目視</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted">地上IR面積 (m2)</label>
              <input
                type="number"
                value={face.groundIRArea || ""}
                onChange={(e) =>
                  update({ groundIRArea: Number(e.target.value) || 0 })
                }
                className="w-full border border-border rounded px-2 py-1 text-sm bg-white"
              />
            </div>
          </div>
          {face.accessLevel === "drone-impossible" && (
            <div className="text-sm">
              <label className="text-xs text-text-muted">ロープアクセス面積 (m2)</label>
              <input
                type="number"
                value={face.ropeAccessArea || ""}
                onChange={(e) =>
                  update({ ropeAccessArea: Number(e.target.value) || 0 })
                }
                className="w-full border border-border rounded px-2 py-1 text-sm bg-white"
              />
            </div>
          )}
          <div className="text-sm">
            <label className="text-xs text-text-muted">注記</label>
            <input
              type="text"
              value={face.note}
              onChange={(e) => update({ note: e.target.value })}
              placeholder="例: 大通りに面しているためドローン不可"
              className="w-full border border-border rounded px-2 py-1 text-sm bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Config Editor ---

// Slider + number input for adjustable values
function SliderField({
  label,
  value,
  onChange: onChangeVal,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-xs font-medium text-text-secondary">{label}</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            onChange={(e) => onChangeVal(Number(e.target.value) || 0)}
            className="w-16 border border-border rounded px-1 py-0.5 text-sm text-right"
          />
          <span className="text-xs text-text-muted">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChangeVal(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-accent"
      />
      <div className="flex justify-between text-xs text-text-muted">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function ConstantField({
  label,
  value,
  unit,
  onChange: onChangeVal,
  isDefault,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
  isDefault: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-muted shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChangeVal(Number(e.target.value) || 0)}
          className={`w-20 border rounded px-1.5 py-0.5 text-right text-xs ${isDefault ? "border-border bg-white" : "border-yellow-400 bg-yellow-50"}`}
        />
        <span className="text-text-muted text-xs whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );
}

function ConfigEditor({
  config,
  onChange,
  onReset,
}: {
  config: CostConfig;
  onChange: (config: CostConfig) => void;
  onReset: () => void;
}) {
  const [showConstants, setShowConstants] = useState(false);

  return (
    <div className="space-y-4">
      {/* 変数: スライダーで調整可能 */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-sm font-bold text-accent">Step 2: 単価を調整</h3>
          <button
            onClick={onReset}
            className="text-xs px-2 py-0.5 border border-border rounded hover:bg-gray-50"
          >
            リセット
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">面積あたりの顧客への販売単価を設定</p>
        <div className="space-y-4">
          <SliderField
            label="ドローン調査 販売単価"
            value={config.unitPricePerM2}
            onChange={(v) => onChange({ ...config, unitPricePerM2: v })}
            min={100}
            max={500}
            step={10}
            unit="円/m2"
          />
          <SliderField
            label="ロープアクセス 顧客単価"
            value={config.ropeAccessPricePerM2}
            onChange={(v) => onChange({ ...config, ropeAccessPricePerM2: v })}
            min={300}
            max={800}
            step={10}
            unit="円/m2"
          />
          <SliderField
            label="一般管理費率"
            value={config.adminRatePercent}
            onChange={(v) => onChange({ ...config, adminRatePercent: v })}
            min={5}
            max={40}
            step={1}
            unit="%"
          />
        </div>
      </div>

      {/* 定数: 折りたたみ・編集可能 */}
      <div className="border-t border-border pt-3">
        <button
          onClick={() => setShowConstants(!showConstants)}
          className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary"
        >
          <span className={`transition-transform ${showConstants ? "rotate-90" : ""}`}>
            &#9654;
          </span>
          原価パラメータ（上級者向け）
        </button>
        {showConstants && (
          <div className="mt-3 space-y-3 text-xs">
            <div className="bg-gray-50 rounded p-3">
              <h4 className="font-bold text-text-secondary mb-1">人件費（国交省R7準拠・販売想定）</h4>
              <p className="text-xs text-text-muted mb-2">実際の原価は「自社化シミュレーション」で調整</p>
              <div className="space-y-1.5">
                <ConstantField label="現場責任者 x1" value={config.personnelDetail.siteManager} unit="円/日"
                  isDefault={config.personnelDetail.siteManager === DEFAULT_CONFIG.personnelDetail.siteManager}
                  onChange={(v) => {
                    const personnelDetail = { ...config.personnelDetail, siteManager: v };
                    const teamCostPerDay = personnelDetail.siteManager + personnelDetail.pilot + personnelDetail.photographer + personnelDetail.assistantOrTechB * 2;
                    onChange({ ...config, personnelDetail, teamCostPerDay });
                  }} />
                <ConstantField label="操縦士 x1" value={config.personnelDetail.pilot} unit="円/日"
                  isDefault={config.personnelDetail.pilot === DEFAULT_CONFIG.personnelDetail.pilot}
                  onChange={(v) => {
                    const personnelDetail = { ...config.personnelDetail, pilot: v };
                    const teamCostPerDay = personnelDetail.siteManager + personnelDetail.pilot + personnelDetail.photographer + personnelDetail.assistantOrTechB * 2;
                    onChange({ ...config, personnelDetail, teamCostPerDay });
                  }} />
                <ConstantField label="撮影士 x1" value={config.personnelDetail.photographer} unit="円/日"
                  isDefault={config.personnelDetail.photographer === DEFAULT_CONFIG.personnelDetail.photographer}
                  onChange={(v) => {
                    const personnelDetail = { ...config.personnelDetail, photographer: v };
                    const teamCostPerDay = personnelDetail.siteManager + personnelDetail.pilot + personnelDetail.photographer + personnelDetail.assistantOrTechB * 2;
                    onChange({ ...config, personnelDetail, teamCostPerDay });
                  }} />
                <ConstantField label="助手/技師B x2" value={config.personnelDetail.assistantOrTechB} unit="円/日(1人)"
                  isDefault={config.personnelDetail.assistantOrTechB === DEFAULT_CONFIG.personnelDetail.assistantOrTechB}
                  onChange={(v) => {
                    const personnelDetail = { ...config.personnelDetail, assistantOrTechB: v };
                    const teamCostPerDay = personnelDetail.siteManager + personnelDetail.pilot + personnelDetail.photographer + personnelDetail.assistantOrTechB * 2;
                    onChange({ ...config, personnelDetail, teamCostPerDay });
                  }} />
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-border font-bold text-text-secondary">
                チーム合計: {config.teamCostPerDay.toLocaleString()}円/日（5名）
              </div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <h4 className="font-bold text-text-secondary mb-2">機材・解析</h4>
              <div className="space-y-1.5">
                <ConstantField label="ドローン損料" value={config.equipment.drone} unit="円/日"
                  isDefault={config.equipment.drone === DEFAULT_CONFIG.equipment.drone}
                  onChange={(v) => onChange({ ...config, equipment: { ...config.equipment, drone: v } })} />
                <ConstantField label="IRカメラ" value={config.equipment.irCamera} unit="円/日"
                  isDefault={config.equipment.irCamera === DEFAULT_CONFIG.equipment.irCamera}
                  onChange={(v) => onChange({ ...config, equipment: { ...config.equipment, irCamera: v } })} />
                <ConstantField label="車両損料" value={config.equipment.vehicle} unit="円/日"
                  isDefault={config.equipment.vehicle === DEFAULT_CONFIG.equipment.vehicle}
                  onChange={(v) => onChange({ ...config, equipment: { ...config.equipment, vehicle: v } })} />
                <ConstantField label="その他機材" value={config.equipment.misc} unit="円/日"
                  isDefault={config.equipment.misc === DEFAULT_CONFIG.equipment.misc}
                  onChange={(v) => onChange({ ...config, equipment: { ...config.equipment, misc: v } })} />
                <ConstantField label="外注解析" value={config.irAnalysis.outsourceCostPerM2} unit="円/m2"
                  isDefault={config.irAnalysis.outsourceCostPerM2 === DEFAULT_CONFIG.irAnalysis.outsourceCostPerM2}
                  onChange={(v) => onChange({ ...config, irAnalysis: { ...config.irAnalysis, outsourceCostPerM2: v } })} />
                <ConstantField label="自社解析" value={config.irAnalysis.internalCostPerM2} unit="円/m2"
                  isDefault={config.irAnalysis.internalCostPerM2 === DEFAULT_CONFIG.irAnalysis.internalCostPerM2}
                  onChange={(v) => onChange({ ...config, irAnalysis: { ...config.irAnalysis, internalCostPerM2: v } })} />
              </div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <h4 className="font-bold text-text-secondary mb-2">その他</h4>
              <div className="space-y-1.5">
                <ConstantField label="交通費" value={config.transportationPerDay} unit="円/日"
                  isDefault={config.transportationPerDay === DEFAULT_CONFIG.transportationPerDay}
                  onChange={(v) => onChange({ ...config, transportationPerDay: v })} />
                <ConstantField label="ロープ下請単価" value={config.ropeAccessPercussionPerM2} unit="円/m2"
                  isDefault={config.ropeAccessPercussionPerM2 === DEFAULT_CONFIG.ropeAccessPercussionPerM2}
                  onChange={(v) => onChange({ ...config, ropeAccessPercussionPerM2: v })} />
                <ConstantField label="調査能力(ドローン)" value={config.droneCapacityPerDay} unit="m2/日"
                  isDefault={config.droneCapacityPerDay === DEFAULT_CONFIG.droneCapacityPerDay}
                  onChange={(v) => onChange({ ...config, droneCapacityPerDay: v })} />
                <ConstantField label="調査能力(地上IR)" value={config.groundIRCapacityPerDay} unit="m2/日"
                  isDefault={config.groundIRCapacityPerDay === DEFAULT_CONFIG.groundIRCapacityPerDay}
                  onChange={(v) => onChange({ ...config, groundIRCapacityPerDay: v })} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Types for Q&A and Glossary data ---

type QAItem = {
  ステータス: string;
  "No.": string;
  カテゴリ: string;
  想定質問: string;
  "回答のポイント（初期案）": string;
  想定されるタイミング: string;
};

type GlossaryItem = {
  カテゴリ: string;
  用語: string;
  回答作成ステータス: string;
  意味: string;
  使用例: string;
};

// --- QA Tab Component ---

function QATab() {
  const items: QAItem[] = ((qaData as { 想定QA: QAItem[] }).想定QA ?? []).filter(item => item["No."] && item.想定質問);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("すべて");

  const categories = useMemo(() => {
    const cats = Array.from(new Set(items.map((i) => i.カテゴリ))).filter(Boolean);
    return ["すべて", ...cats];
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchCat = activeCategory === "すべて" || item.カテゴリ === activeCategory;
      const matchSearch =
        search === "" ||
        item.想定質問.includes(search) ||
        item["回答のポイント（初期案）"].includes(search) ||
        item.カテゴリ.includes(search);
      return matchCat && matchSearch;
    });
  }, [items, activeCategory, search]);

  const categoryColors: Record<string, string> = {
    コスト: "bg-blue-100 text-blue-700 border-blue-200",
    品質: "bg-green-100 text-green-700 border-green-200",
    技術: "bg-purple-100 text-purple-700 border-purple-200",
    法規制: "bg-orange-100 text-orange-700 border-orange-200",
    安全: "bg-red-100 text-red-700 border-red-200",
    工程: "bg-yellow-100 text-yellow-700 border-yellow-200",
    契約: "bg-pink-100 text-pink-700 border-pink-200",
  };

  const getCategoryStyle = (cat: string) =>
    categoryColors[cat] ?? "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="質問・カテゴリを検索..."
          className="w-full border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              activeCategory === cat
                ? "bg-accent text-white border-accent"
                : "border-border text-text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="text-xs text-text-muted">{filtered.length} 件</p>

      {/* Q&A Cards */}
      <div className="space-y-3">
        {filtered.map((item) => (
          <div
            key={item["No."]}
            className="bg-white rounded-lg border border-border p-4 space-y-2"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-text-muted font-mono">#{item["No."]}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded border font-medium ${getCategoryStyle(item.カテゴリ)}`}
              >
                {item.カテゴリ}
              </span>
              {item.想定されるタイミング && (
                <span className="text-xs px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">
                  {item.想定されるタイミング}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-text-primary leading-relaxed">
              Q. {item.想定質問}
            </p>
            {item["回答のポイント（初期案）"] && (
              <p className="text-sm text-text-secondary leading-relaxed pl-3 border-l-2 border-accent/40">
                {item["回答のポイント（初期案）"]}
              </p>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-text-muted text-center py-12">該当する質問が見つかりませんでした</p>
        )}
      </div>
    </div>
  );
}

// --- Glossary Accordion Section ---

function GlossaryAccordion({ category, terms, forceOpen }: { category: string; terms: GlossaryItem[]; forceOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;

  return (
    <div className="bg-white rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
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
                <p className="text-sm font-bold text-text-primary leading-tight">{term.用語}</p>
                <p className="text-xs text-text-secondary mt-0.5">{term.意味}</p>
                {term.使用例 && (
                  <p className="text-xs text-text-muted italic mt-1 opacity-80">例: {term.使用例}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Glossary Tab Component ---
// Note: qa.json 用語集 and glossary.json 不動産用語集 are nearly identical.
// Using glossary.json as unified source (has 打鍵 with reading).

function GlossaryTab() {
  const allTerms: GlossaryItem[] = (glossaryData as { 不動産用語集: GlossaryItem[] }).不動産用語集 ?? [];
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (search === "") return allTerms;
    return allTerms.filter(
      (item) =>
        item.用語.includes(search) ||
        item.意味.includes(search) ||
        item.カテゴリ.includes(search)
    );
  }, [allTerms, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, GlossaryItem[]>();
    for (const item of filtered) {
      const cat = item.カテゴリ || "その他";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [filtered]);

  const isSearching = search.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="用語・意味・カテゴリを検索..."
        className="w-full border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
      />

      <p className="text-xs text-text-muted">全 {filtered.length} 件 / {grouped.size} カテゴリ</p>

      <div className="space-y-2">
        {Array.from(grouped.entries()).map(([category, terms]) => (
          <GlossaryAccordion key={category} category={category} terms={terms} forceOpen={isSearching} />
        ))}
        {grouped.size === 0 && (
          <p className="text-sm text-text-muted text-center py-12">該当する用語が見つかりませんでした</p>
        )}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function EstimatePage() {
  const [activeTab, setActiveTab] = useState<"estimate" | "qa" | "glossary">("estimate");

  const [building, setBuilding] = useState<BuildingInput>({
    name: "",
    totalArea: 3000,
    floors: 8,
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
        if (saved && ver === "4") return JSON.parse(saved) as CostConfig;
        // Clear outdated config (e.g. old 210 yen default)
        localStorage.removeItem("drone-estimate-config");
      } catch {}
    }
    return { ...DEFAULT_CONFIG };
  });
  const [showFaces, setShowFaces] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("drone-estimate-config", JSON.stringify(config));
      localStorage.setItem("drone-estimate-config-ver", "4");
    } catch {}
  }, [config]);

  const [futureOverrides, setFutureOverrides] = useState<FutureOverrides>({ ...DEFAULT_FUTURE_OVERRIDES });
  const [futurePercentMode, setFuturePercentMode] = useState(false);

  const result = useMemo(
    () => calculateEstimate(building, config, futureOverrides),
    [building, config, futureOverrides]
  );

  // 将来シナリオ用の適用済みconfig（ScenarioCardの計算根拠表示用）
  const futureConfig = useMemo(
    () => applyFutureOverrides(config, futureOverrides),
    [config, futureOverrides]
  );

  const applyPreset = useCallback(
    (presetIndex: number) => {
      const p = PRESETS[presetIndex];
      setBuilding({
        name: p.name,
        totalArea: p.totalArea,
        floors: p.floors,
        height: p.height,
        faces: p.faces.map((f) => ({ ...f })),
      });
    },
    []
  );

  const updateFace = useCallback(
    (index: number, face: FaceInput) => {
      setBuilding((prev) => {
        const faces = [...prev.faces];
        faces[index] = face;
        const totalArea = faces.reduce((s, f) => s + f.area, 0);
        return { ...prev, faces, totalArea };
      });
    },
    []
  );

  const removeFace = useCallback((index: number) => {
    setBuilding((prev) => {
      const faces = prev.faces.filter((_, i) => i !== index);
      const totalArea = faces.reduce((s, f) => s + f.area, 0);
      return { ...prev, faces, totalArea };
    });
  }, []);

  const addFace = useCallback(() => {
    setBuilding((prev) => ({
      ...prev,
      faces: [
        ...prev.faces,
        createDefaultFace(`面${prev.faces.length + 1}`, 0),
      ],
    }));
  }, []);

  const overallBg = {
    ok: "bg-green-50 border-green-200",
    warning: "bg-yellow-50 border-yellow-200",
    blocker: "bg-red-50 border-red-200",
  };

  const overallLabel = {
    ok: "飛行可能",
    warning: "条件付き飛行可能",
    blocker: "飛行不可",
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">
              ミラテクドローン 見積もりシミュレーター
            </h1>
            <p className="text-sm text-blue-200 mt-0.5">
              ドローン外壁調査の概算見積もりを即時算出
            </p>
          </div>
          <a
            href="#results"
            className="lg:hidden text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors"
          >
            結果を見る
          </a>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-0">
            {(
              [
                { key: "estimate", label: "見積もり" },
                { key: "qa", label: "想定Q&A" },
                { key: "glossary", label: "用語集" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? "border-accent text-accent"
                    : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Tab Content */}
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
              <h2 className="text-sm font-bold text-text-secondary mb-3">
                クイックプリセット
              </h2>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => applyPreset(i)}
                    className="text-xs px-3 py-1.5 border border-accent text-accent rounded-full hover:bg-accent hover:text-white transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Building Info */}
            <div className="bg-white rounded-lg border-2 border-accent/30 p-4">
              <h2 className="text-sm font-bold text-accent mb-1">
                Step 1: ビル情報を入力
              </h2>
              <p className="text-xs text-text-muted mb-3">入力すると右側に見積もり結果が表示されます</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-text-muted">ビル名</label>
                  <input
                    type="text"
                    value={building.name}
                    onChange={(e) =>
                      setBuilding({ ...building, name: e.target.value })
                    }
                    placeholder="例: 新宿オフィスビル"
                    className="w-full border border-border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-text-muted">
                      総外壁面積 (m2)
                    </label>
                    <input
                      type="number"
                      value={building.totalArea || ""}
                      onChange={(e) => {
                        const newTotal = Number(e.target.value) || 0;
                        const currentSum = building.faces.reduce((s, f) => s + f.area, 0);
                        let newFaces: FaceInput[];
                        if (currentSum === 0 || building.faces.length === 0) {
                          // 面が空 or 面積合計0 → 4面を自動生成（長辺:短辺 = 3:2）
                          const long = Math.round(newTotal * 0.3);
                          const short = Math.round(newTotal * 0.2);
                          newFaces = [
                            createDefaultFace("北面", long),
                            createDefaultFace("東面", short),
                            createDefaultFace("南面", long),
                            createDefaultFace("西面", short),
                          ];
                        } else {
                          const ratio = newTotal / currentSum;
                          newFaces = building.faces.map((f) => ({
                            ...f,
                            area: Math.round(f.area * ratio),
                            ropeAccessArea: f.accessLevel === "drone-impossible" ? Math.round(f.area * ratio) : f.ropeAccessArea,
                          }));
                        }
                        setBuilding({
                          ...building,
                          totalArea: newTotal,
                          faces: newFaces,
                        });
                      }}
                      className="w-full border border-border rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">階数</label>
                    <input
                      type="number"
                      value={building.floors || ""}
                      onChange={(e) =>
                        setBuilding({
                          ...building,
                          floors: Number(e.target.value) || 0,
                        })
                      }
                      className="w-full border border-border rounded px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">高さ (m)</label>
                    <input
                      type="number"
                      value={building.height || ""}
                      onChange={(e) =>
                        setBuilding({
                          ...building,
                          height: Number(e.target.value) || 0,
                        })
                      }
                      className="w-full border border-border rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Faces - collapsible detail section */}
            <div className="bg-white rounded-lg border border-border p-4">
              <div className="flex justify-between items-center mb-3">
                <button
                  onClick={() => setShowFaces(!showFaces)}
                  className="flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-primary"
                >
                  <span className={`transition-transform text-xs ${showFaces ? "rotate-90" : ""}`}>
                    &#9654;
                  </span>
                  各面の詳細調整
                  <span className="text-xs font-normal text-text-muted">
                    （{building.faces.length}面 / 総面積から自動配分済み）
                  </span>
                </button>
                {showFaces && (
                <button
                  onClick={addFace}
                  className="text-xs px-2 py-1 border border-accent text-accent rounded hover:bg-accent hover:text-white transition-colors"
                >
                  + 面を追加
                </button>
                )}
              </div>
              {showFaces && (
              <>
              <div className="space-y-3">
                {building.faces.map((face, i) => (
                  <FaceEditor
                    key={i}
                    face={face}
                    index={i}
                    onChange={updateFace}
                    onRemove={removeFace}
                  />
                ))}
              </div>
              {building.faces.length === 0 && (
                <p className="text-sm text-text-muted text-center py-4">
                  面が設定されていません
                </p>
              )}
              </>
              )}
            </div>

            {/* Config */}
            <div className="bg-white rounded-lg border border-border p-4">
              <ConfigEditor
                config={config}
                onChange={setConfig}
                onReset={() => setConfig({ ...DEFAULT_CONFIG })}
              />
            </div>

            {/* 自社化シミュレーション設定 */}
            <div className="bg-white rounded-lg border-2 border-green-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-green-700">Step 3: 自社化シミュレーション</h3>
                <div className="flex items-center gap-2">
                  <div className="flex rounded border border-gray-200 text-xs overflow-hidden">
                    <button
                      onClick={() => setFuturePercentMode(false)}
                      className={`px-2 py-0.5 ${!futurePercentMode ? "bg-green-600 text-white" : "text-text-muted hover:bg-gray-50"}`}
                    >値</button>
                    <button
                      onClick={() => setFuturePercentMode(true)}
                      className={`px-2 py-0.5 ${futurePercentMode ? "bg-green-600 text-white" : "text-text-muted hover:bg-gray-50"}`}
                    >%</button>
                  </div>
                  <button
                    onClick={() => setFutureOverrides({ ...DEFAULT_FUTURE_OVERRIDES })}
                    className="text-xs text-text-muted hover:text-text-primary"
                  >リセット</button>
                </div>
              </div>
              <p className="text-xs text-text-muted mb-3">「将来（自社化後）」シナリオのコストを直接編集</p>
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 text-xs text-text-muted pb-1 border-b border-gray-100">
                  <span>項目</span>
                  <span className="text-right">現状</span>
                  <span className="text-right">{futurePercentMode ? "将来(%)" : "将来"}</span>
                </div>

                {/* 解析費 */}
                <p className="text-xs font-medium text-text-muted pt-1">解析費</p>
                <FutureRow label="赤外線解析" unit="円/m2" percentMode={futurePercentMode}
                  current={config.irAnalysis.outsourceCostPerM2}
                  value={futureOverrides.irAnalysisCostPerM2}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, irAnalysisCostPerM2: v })} />

                {/* 人件費 */}
                <p className="text-xs font-medium text-text-muted pt-1">人件費（日額）</p>
                <FutureRow label="現場責任者" unit="円/日" percentMode={futurePercentMode}
                  current={config.personnelDetail.siteManager}
                  value={futureOverrides.siteManagerCost}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, siteManagerCost: v })} />
                <FutureRow label="パイロット" unit="円/日" percentMode={futurePercentMode}
                  current={config.personnelDetail.pilot}
                  value={futureOverrides.pilotCost}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, pilotCost: v })} />
                <FutureRow label="撮影士" unit="円/日" percentMode={futurePercentMode}
                  current={config.personnelDetail.photographer}
                  value={futureOverrides.photographerCost}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, photographerCost: v })} />
                <FutureRow label="撮影助手" unit="円/日" percentMode={futurePercentMode}
                  current={config.personnelDetail.assistantOrTechB}
                  value={futureOverrides.assistantCost}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, assistantCost: v })} />

                {/* 機材費 */}
                <p className="text-xs font-medium text-text-muted pt-1">機材費（日額）</p>
                <FutureRow label="ドローン" unit="円/日" percentMode={futurePercentMode}
                  current={config.equipment.drone}
                  value={futureOverrides.droneCost}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, droneCost: v })} />
                <FutureRow label="IRカメラ" unit="円/日" percentMode={futurePercentMode}
                  current={config.equipment.irCamera}
                  value={futureOverrides.irCameraCost}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, irCameraCost: v })} />
                <FutureRow label="ラインドローンシステム" unit="円/日" percentMode={futurePercentMode}
                  current={config.equipment.lineDroneSystem}
                  value={futureOverrides.lineDroneSystemCost}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, lineDroneSystemCost: v })} />
                <FutureRow label="車両損料" unit="円/日" percentMode={futurePercentMode}
                  current={config.equipment.vehicle}
                  value={futureOverrides.vehicleCost}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, vehicleCost: v })} />
                <FutureRow label="その他機材" unit="円/日" percentMode={futurePercentMode}
                  current={config.equipment.misc}
                  value={futureOverrides.miscCost}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, miscCost: v })} />

                {/* その他 */}
                <p className="text-xs font-medium text-text-muted pt-1">その他</p>
                <FutureRow label="交通費" unit="円/日" percentMode={futurePercentMode}
                  current={config.transportationPerDay}
                  value={futureOverrides.transportationPerDay}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, transportationPerDay: v })} />
                <FutureRow label="ロープアクセス打診" unit="円/m2" percentMode={futurePercentMode}
                  current={config.ropeAccessPercussionPerM2}
                  value={futureOverrides.ropeAccessPercussionPerM2}
                  onChange={(v) => setFutureOverrides({ ...futureOverrides, ropeAccessPercussionPerM2: v })} />
              </div>
            </div>
          </div>

          {/* Right: Results */}
          <div id="results" className="lg:col-span-3 space-y-4">
            {building.faces.length === 0 ? (
              <div className="bg-gray-50 rounded-lg border border-border p-8 text-center">
                <p className="text-text-muted">左側で面を追加すると、見積もり結果がここに表示されます</p>
              </div>
            ) : (<>
            {/* Hero: 見積金額 + 飛行可否バッジ */}
            <div className="bg-white rounded-xl border-2 border-accent/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-muted">飛行可否:</span>
                  <FeasibilityBadge level={result.feasibility.overall} />
                  <span className="text-sm font-medium">
                    {overallLabel[result.feasibility.overall]}
                  </span>
                </div>
                <div className="text-sm text-text-muted">
                  調査日数: <span className="font-bold text-text-primary">{result.surveyDays}日</span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-text-muted mb-1">ドローン外壁調査 概算見積</div>
                <div className="text-4xl font-bold text-primary tracking-tight">
                  {result.current.salesPrice.toLocaleString("ja-JP")}
                  <span className="text-lg ml-1">円</span>
                </div>
                <div className="text-sm text-text-muted mt-1">
                  {result.current.perM2.sales} 円/m2 | 総面積 {building.totalArea.toLocaleString()} m2
                </div>
              </div>

              {/* 社内メトリクス */}
              <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
                <div className="text-center">
                  <div className="text-xs text-text-muted">原価合計</div>
                  <div className="text-sm font-bold">{yen(result.current.costBreakdown.totalCost)}</div>
                  <div className="text-xs text-text-muted">{result.current.perM2.cost} 円/m2</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-text-muted">粗利</div>
                  <div className={`text-sm font-bold ${result.current.grossProfit >= 0 ? "text-positive" : "text-negative"}`}>
                    {yen(result.current.grossProfit)}
                  </div>
                  <div className={`text-xs ${result.current.grossProfitRate >= 0 ? "text-positive" : "text-negative"}`}>
                    {pct(result.current.grossProfitRate)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-text-muted">営業利益</div>
                  <div className={`text-sm font-bold ${result.current.profit >= 0 ? "text-positive" : "text-negative"}`}>
                    {yen(result.current.profit)}
                  </div>
                  <div className="text-xs text-text-muted">{result.current.perM2.profit} 円/m2</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-text-muted">営業利益率</div>
                  <div className={`text-sm font-bold ${result.current.profitRate >= 0 ? "text-positive" : "text-negative"}`}>
                    {pct(result.current.profitRate)}
                  </div>
                </div>
              </div>
            </div>

            {/* ロープアクセスとの比較 — お得感を前面に */}
            <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl border border-accent/20 p-5">
              <h3 className="text-sm font-bold text-text-secondary mb-1">
                従来工法（ロープアクセス）との比較
              </h3>
              <p className="text-xs text-text-muted mb-4">全面をロープアクセスで実施した場合との価格差</p>
              <ComparisonBar result={result} />
            </div>

            {/* 面積内訳 — コンパクトに */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg border border-border p-3 text-center">
                <div className="text-xs text-text-muted">ドローン調査</div>
                <div className="text-lg font-bold text-accent">
                  {result.droneArea.toLocaleString()} <span className="text-xs font-normal">m2</span>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-border p-3 text-center">
                <div className="text-xs text-text-muted">地上IR調査</div>
                <div className="text-lg font-bold text-positive">
                  {result.groundIRArea.toLocaleString()} <span className="text-xs font-normal">m2</span>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-border p-3 text-center">
                <div className="text-xs text-text-muted">ロープアクセス</div>
                <div className="text-lg font-bold text-negative">
                  {result.ropeAccessArea.toLocaleString()} <span className="text-xs font-normal">m2</span>
                </div>
              </div>
            </div>

            {/* 算出ロジック説明 */}
            <CollapsibleSection title="算出ロジックの説明" defaultOpen={false}>
              <div className="text-xs text-text-secondary space-y-2">
                <div>
                  <p className="font-bold mb-1">1. 調査日数の決定</p>
                  <p className="text-text-muted">ドローン調査面積 / 日次調査能力（{config.droneCapacityPerDay.toLocaleString()}m2/日）と地上IR面積 / 地上IR能力（{config.groundIRCapacityPerDay.toLocaleString()}m2/日）の大きい方（最低1日）</p>
                </div>
                <div>
                  <p className="font-bold mb-1">2. 原価積算</p>
                  <p className="text-text-muted">人件費（チーム{config.teamCostPerDay.toLocaleString()}円/日 x 日数）+ 機材費 + 赤外線解析費（面積 x 単価）+ 交通費 + ロープアクセス外注費 = 直接原価。直接原価 x 管理費率{config.adminRatePercent}% = 一般管理費。直接原価 + 一般管理費 = 原価合計。</p>
                </div>
                <div>
                  <p className="font-bold mb-1">3. 販売価格算出</p>
                  <p className="text-text-muted">ドローン調査面積 x 販売単価（{config.unitPricePerM2}円/m2）+ ロープアクセス面積 x ロープ単価（{config.ropeAccessPricePerM2}円/m2）= 販売価格</p>
                </div>
                <div>
                  <p className="font-bold mb-1">4. 利益計算</p>
                  <p className="text-text-muted">粗利 = 販売価格 - 直接原価。営業利益 = 販売価格 - 原価合計（直接原価 + 一般管理費）。</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* 飛行可否の詳細（警告がある場合のみ展開表示） */}
            {result.feasibility.overall !== "ok" && (
              <div className={`rounded-lg border p-4 ${overallBg[result.feasibility.overall]}`}>
                <FeasibilityPanel items={result.feasibility.items} />
              </div>
            )}

            {/* 調査方法の面別判定 */}
            <CollapsibleSection title="調査方法の面別判定" defaultOpen={true}>
              <p className="text-xs text-text-muted mb-2">各面のラインドローンシステム適用可否と調査手法の一覧</p>
              <FaceSummaryTable result={result} />
            </CollapsibleSection>

            {/* 折りたたみ: 感度分析 */}
            <CollapsibleSection title="感度分析（単価 x ドローン適用面数）" defaultOpen={false}>
              <SensitivityTable
                building={building}
                config={config}
              />
            </CollapsibleSection>

            {/* 折りたたみ: シナリオ比較 */}
            <CollapsibleSection title="シナリオ比較（外注 vs 自社化）" defaultOpen={false}>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ScenarioCard
                  scenario={result.current}
                  label="現状（解析外注）"
                  surveyDays={result.surveyDays}
                  config={config}
                  irArea={result.droneArea + result.groundIRArea}
                  ropeArea={result.ropeAccessArea}
                />
                <ScenarioCard
                  scenario={result.future}
                  label="将来（自社化後）"
                  surveyDays={result.surveyDays}
                  config={futureConfig}
                  irArea={result.droneArea + result.groundIRArea}
                  ropeArea={result.ropeAccessArea}
                />
              </div>
              {result.future.profit > result.current.profit && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-center">
                  <span className="font-bold text-positive">
                    自社化による改善効果:
                  </span>{" "}
                  営業利益 +{yen(result.future.profit - result.current.profit)}
                  （営業利益率 {pct(result.current.profitRate)} →{" "}
                  {pct(result.future.profitRate)}）
                </div>
              )}
            </CollapsibleSection>
            </>)}
          </div>
        </div>
      </main>

      {/* Print Button */}
      <div className="max-w-7xl mx-auto px-4 mt-4 no-print">
        <button
          onClick={() => window.print()}
          className="text-sm px-4 py-2 border border-accent text-accent rounded hover:bg-accent hover:text-white transition-colors"
        >
          印刷 / PDF保存
        </button>
      </div>
      </>
      )}

      <footer className="border-t border-border mt-8 py-4">
        <p className="text-center text-xs text-text-muted">
          ミラテクドローン 見積もりシミュレーター v2.3 —
          概算見積もり用。正式見積もりは現地調査後に作成します。
          人件費は国交省R7年度設計業務委託等技術者単価に準拠（販売想定）。
        </p>
      </footer>
    </div>
  );
}
