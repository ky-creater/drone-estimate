"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
  "free-drone": { symbol: "○", label: "フリードローン可", color: "text-green-600", bg: "bg-green-50 border-green-300" },
  "line-drone": { symbol: "△", label: "ラインドローン使用で可", color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-300" },
  "no-drone": { symbol: "×", label: "ドローン不可", color: "text-red-600", bg: "bg-red-50 border-red-300" },
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

function ScenarioCard({ scenario, label, showCost }: { scenario: ScenarioResult; label: string; showCost: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-border p-4">
      <h3 className="text-sm font-bold text-text-secondary mb-3">{label}</h3>
      <div className={`grid grid-cols-1 ${showCost ? "md:grid-cols-2" : ""} gap-4`}>
        {/* Left: 原価内訳（社内モードのみ） */}
        {showCost && (
        <div>
          <h4 className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">
            原価内訳
          </h4>
          <table className="w-full text-sm">
            <tbody>
              <CostRow label="人件費" value={scenario.costBreakdown.personnel} />
              <CostRow label="機材費" value={scenario.costBreakdown.equipment} />
              <CostRow label="赤外線解析費" value={scenario.costBreakdown.irAnalysis} />
              <CostRow label="交通費" value={scenario.costBreakdown.transportation} />
              <CostRow label="ロープアクセス外注" value={scenario.costBreakdown.ropeAccessSubcontract} />
              <CostRow label="直接原価 小計" value={scenario.costBreakdown.directCost} bold />
              <CostRow label="一般管理費" value={scenario.costBreakdown.adminCost} />
              <CostRow label="原価合計" value={scenario.costBreakdown.totalCost} bold />
            </tbody>
          </table>
        </div>
        )}

        {/* Right: お客様向け見積もり */}
        <div>
          <h4 className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">
            お客様向け見積もり
          </h4>
          <table className="w-full text-sm">
            <tbody>
              {scenario.customerEstimate.freeDroneIRFee > 0 && (
                <CostRow label="フリードローン赤外線" value={scenario.customerEstimate.freeDroneIRFee} />
              )}
              {scenario.customerEstimate.lineDroneIRFee > 0 && (
                <CostRow label="ラインドローン赤外線" value={scenario.customerEstimate.lineDroneIRFee} />
              )}
              {scenario.customerEstimate.groundIRFee > 0 && (
                <CostRow label="地上赤外線" value={scenario.customerEstimate.groundIRFee} />
              )}
              {scenario.customerEstimate.ropePercussionFee > 0 && (
                <CostRow label="ロープアクセス打診" value={scenario.customerEstimate.ropePercussionFee} />
              )}
              <CostRow label="見積もり合計" value={scenario.customerEstimate.totalEstimate} bold />
            </tbody>
          </table>

          {/* Profit summary (社内モードのみ) */}
          {showCost && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex justify-between text-sm">
              <span>粗利</span>
              <span className={`font-bold ${scenario.profit >= 0 ? "text-positive" : "text-negative"}`}>
                {yen(scenario.profit)}
              </span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span>粗利率</span>
              <span className={`font-bold ${scenario.profitRate >= 0 ? "text-positive" : "text-negative"}`}>
                {pct(scenario.profitRate)}
              </span>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CostRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <tr className={`border-b border-border ${bold ? "bg-gray-50" : ""}`}>
      <td className={`py-1.5 ${bold ? "font-bold" : ""}`}>{label}</td>
      <td className={`py-1.5 text-right ${bold ? "font-bold" : ""}`}>{yen(value)}</td>
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
  showCost,
}: {
  building: BuildingInput;
  config: CostConfig;
  showCost: boolean;
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
                  {s}
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
                      <div
                        className={`rounded px-2 py-1 ${sc.profit >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                      >
                        <div className="text-xs">
                          {sc.profit >= 0 ? "+" : ""}
                          {sc.profit.toLocaleString("ja-JP")}円
                        </div>
                        {showCost && (
                          <div className="text-xs opacity-75">
                            ({sc.profitRate.toFixed(1)}%)
                          </div>
                        )}
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
            if (face.accessLevel === "no-drone") {
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
            if (level === "no-drone") {
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
          <option value="free-drone">ドローン可</option>
          <option value="line-drone">ライン式</option>
          <option value="no-drone">不可</option>
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
          {face.accessLevel === "no-drone" && (
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
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold text-accent">Step 2: 単価を調整</h3>
          <button
            onClick={onReset}
            className="text-xs px-2 py-0.5 border border-border rounded hover:bg-gray-50"
          >
            リセット
          </button>
        </div>
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

      {/* 定数: 折りたたみ参考表示 */}
      <div className="border-t border-border pt-3">
        <button
          onClick={() => setShowConstants(!showConstants)}
          className="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary"
        >
          <span className={`transition-transform ${showConstants ? "rotate-90" : ""}`}>
            &#9654;
          </span>
          原価パラメータ（定数 / 上級者向け）
        </button>
        {showConstants && (
          <div className="mt-3 space-y-3 text-xs">
            <div className="bg-gray-50 rounded p-3">
              <h4 className="font-bold text-text-secondary mb-2">人件費（国交省R7単価準拠）</h4>
              <div className="grid grid-cols-2 gap-1 text-text-muted">
                <span>現場責任者 x1</span><span className="text-right">{config.personnelDetail.siteManager.toLocaleString()}円/日</span>
                <span>操縦士 x1</span><span className="text-right">{config.personnelDetail.pilot.toLocaleString()}円/日</span>
                <span>撮影士 x1</span><span className="text-right">{config.personnelDetail.photographer.toLocaleString()}円/日</span>
                <span>助手/技師B x2</span><span className="text-right">{config.personnelDetail.assistantOrTechB.toLocaleString()}円/日(1人)</span>
              </div>
              <div className="mt-1 pt-1 border-t border-border font-bold text-text-secondary">
                チーム合計: {config.teamCostPerDay.toLocaleString()}円/日（5名）
              </div>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <h4 className="font-bold text-text-secondary mb-2">機材・解析・その他</h4>
              <div className="grid grid-cols-2 gap-1 text-text-muted">
                <span>ドローン損料</span><span className="text-right">{config.equipment.drone.toLocaleString()}円/日</span>
                <span>IRカメラ</span><span className="text-right">{config.equipment.irCamera.toLocaleString()}円/日</span>
                <span>その他機材</span><span className="text-right">{config.equipment.misc.toLocaleString()}円/日</span>
                <span>外注解析</span><span className="text-right">{config.irAnalysis.outsourceCostPerM2}円/m2</span>
                <span>自社解析</span><span className="text-right">{config.irAnalysis.internalCostPerM2}円/m2</span>
                <span>交通費</span><span className="text-right">{config.transportationPerDay.toLocaleString()}円/日</span>
                <span>ロープ下請単価</span><span className="text-right">{config.ropeAccessPercussionPerM2}円/m2</span>
                <span>調査能力(ドローン)</span><span className="text-right">{config.droneCapacityPerDay.toLocaleString()}m2/日</span>
                <span>調査能力(地上IR)</span><span className="text-right">{config.groundIRCapacityPerDay.toLocaleString()}m2/日</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function EstimatePage() {
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
        if (saved && ver === "3") return JSON.parse(saved) as CostConfig;
        // Clear outdated config (e.g. old 210 yen default)
        localStorage.removeItem("drone-estimate-config");
      } catch {}
    }
    return { ...DEFAULT_CONFIG };
  });
  const [showCost, setShowCost] = useState(false);
  const [showFaces, setShowFaces] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("drone-estimate-config", JSON.stringify(config));
      localStorage.setItem("drone-estimate-config-ver", "3");
    } catch {}
  }, [config]);

  const result = useMemo(
    () => calculateEstimate(building, config),
    [building, config]
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCost(!showCost)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${showCost ? "bg-yellow-400 text-gray-900 font-bold" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
            >
              {showCost ? "社内モード" : "顧客モード"}
            </button>
            <a
              href="#results"
              className="lg:hidden text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full transition-colors"
            >
              結果を見る
            </a>
          </div>
        </div>
      </header>

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
                            ropeAccessArea: f.accessLevel === "no-drone" ? Math.round(f.area * ratio) : f.ropeAccessArea,
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

              {/* 社内メトリクス（社内モードのみ） */}
              {showCost && (
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
                  <div className="text-center">
                    <div className="text-xs text-text-muted">原価</div>
                    <div className="text-sm font-bold">{yen(result.current.costBreakdown.totalCost)}</div>
                    <div className="text-xs text-text-muted">{result.current.perM2.cost} 円/m2</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-text-muted">粗利</div>
                    <div className={`text-sm font-bold ${result.current.profit >= 0 ? "text-positive" : "text-negative"}`}>
                      {yen(result.current.profit)}
                    </div>
                    <div className="text-xs text-text-muted">{result.current.perM2.profit} 円/m2</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-text-muted">粗利率</div>
                    <div className={`text-sm font-bold ${result.current.profitRate >= 0 ? "text-positive" : "text-negative"}`}>
                      {pct(result.current.profitRate)}
                    </div>
                  </div>
                </div>
              )}
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

            {/* 飛行可否の詳細（警告がある場合のみ展開表示） */}
            {result.feasibility.overall !== "ok" && (
              <div className={`rounded-lg border p-4 ${overallBg[result.feasibility.overall]}`}>
                <FeasibilityPanel items={result.feasibility.items} />
              </div>
            )}

            {/* 折りたたみ: 各面の判定サマリ */}
            <CollapsibleSection title="各面の判定サマリ" defaultOpen={false}>
              <FaceSummaryTable result={result} />
            </CollapsibleSection>

            {/* 折りたたみ: 感度分析（社内モードのみ） */}
            {showCost && (
              <CollapsibleSection title="感度分析（単価 x ドローン適用面数）" defaultOpen={false}>
                <SensitivityTable
                  building={building}
                  config={config}
                  showCost={showCost}
                />
              </CollapsibleSection>
            )}

            {/* 折りたたみ: シナリオ比較 */}
            <CollapsibleSection title="シナリオ比較（外注 vs 自社化）" defaultOpen={false}>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ScenarioCard
                  scenario={result.current}
                  label="現状（解析外注）"
                  showCost={showCost}
                />
                <ScenarioCard
                  scenario={result.future}
                  label="将来（自社化後）"
                  showCost={showCost}
                />
              </div>
              {result.future.profit > result.current.profit && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-center">
                  <span className="font-bold text-positive">
                    自社化による改善効果:
                  </span>{" "}
                  粗利 +{yen(result.future.profit - result.current.profit)}
                  （粗利率 {pct(result.current.profitRate)} →{" "}
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

      <footer className="border-t border-border mt-8 py-4">
        <p className="text-center text-xs text-text-muted">
          ミラテクドローン 見積もりシミュレーター v2.2 —
          概算見積もり用。正式見積もりは現地調査後に作成します。
          人件費は国交省R7年度設計業務委託等技術者単価に準拠。
        </p>
      </footer>
    </div>
  );
}
