"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  type BuildingInput,
  type FaceInput,
  type CostConfig,
  type EstimateResult,
  type FeasibilityItem,
  type ScenarioResult,
  type AccessLevel,
  type InspectionMethod,
  DEFAULT_CONFIG,
  PRESETS,
  createDefaultFace,
  calculateEstimate,
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
  const update = (patch: Partial<FaceInput>) => {
    onChange(index, { ...face, ...patch });
  };

  const access = ACCESS_LABELS[face.accessLevel];

  return (
    <div className={`border rounded-lg p-3 ${access.bg}`}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xl font-bold ${access.color}`}>
            {access.symbol}
          </span>
          <input
            type="text"
            value={face.name}
            onChange={(e) => update({ name: e.target.value })}
            className="font-bold text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5"
          />
        </div>
        <button
          onClick={() => onRemove(index)}
          className="text-xs text-text-muted hover:text-negative"
        >
          削除
        </button>
      </div>

      {/* Access Level Radio */}
      <div className="flex flex-wrap gap-2 mb-2">
        {(["free-drone", "line-drone", "no-drone"] as AccessLevel[]).map((level) => {
          const opt = ACCESS_LABELS[level];
          return (
            <label
              key={level}
              className={`flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded border ${
                face.accessLevel === level
                  ? `${opt.bg} font-bold`
                  : "bg-white border-border"
              }`}
            >
              <input
                type="radio"
                name={`access-${index}`}
                checked={face.accessLevel === level}
                onChange={() => {
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
                className="hidden"
              />
              <span className={opt.color}>{opt.symbol}</span> {opt.label}
            </label>
          );
        })}
      </div>

      {/* Inspection Method + Area */}
      <div className="grid grid-cols-2 gap-2 text-sm mb-2">
        <div>
          <label className="text-xs text-text-muted">面積 (m2)</label>
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
            className="w-full border border-border rounded px-2 py-1 text-sm bg-white"
          />
        </div>
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
      </div>

      {/* Ground IR + Rope Access */}
      <div className="grid grid-cols-2 gap-2 text-sm mb-2">
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
        {face.accessLevel === "no-drone" && (
          <div>
            <label className="text-xs text-text-muted">
              ロープアクセス面積 (m2)
            </label>
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
      </div>

      {/* Note */}
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
  );
}

// --- Config Editor ---

function ConfigEditor({
  config,
  onChange,
  onReset,
}: {
  config: CostConfig;
  onChange: (config: CostConfig) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  const updateEquipment = (key: keyof CostConfig["equipment"], val: number) => {
    onChange({
      ...config,
      equipment: { ...config.equipment, [key]: val },
    });
  };
  const updateIR = (key: keyof CostConfig["irAnalysis"], val: number) => {
    onChange({
      ...config,
      irAnalysis: { ...config.irAnalysis, [key]: val },
    });
  };

  const NumField = ({
    label,
    value,
    onChangeVal,
    unit,
  }: {
    label: string;
    value: number;
    onChangeVal: (v: number) => void;
    unit: string;
  }) => (
    <div>
      <label className="text-xs text-text-muted block mb-0.5">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value || ""}
          onChange={(e) => onChangeVal(Number(e.target.value) || 0)}
          className="w-full border border-border rounded px-2 py-1 text-sm"
        />
        <span className="text-xs text-text-muted whitespace-nowrap">
          {unit}
        </span>
      </div>
    </div>
  );

  return (
    <div className="border-t border-border mt-6 pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-primary"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>
          ▶
        </span>
        単価設定（詳細）
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex justify-end">
            <button
              onClick={onReset}
              className="text-xs px-3 py-1 border border-border rounded hover:bg-gray-50"
            >
              デフォルトに戻す
            </button>
          </div>

          <div>
            <h4 className="text-xs font-bold text-text-secondary mb-2 uppercase tracking-wider">
              人件費（国交省R7単価準拠）
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <NumField
                label="調査現場責任者 x1"
                value={config.personnelDetail.siteManager}
                onChangeVal={(v) =>
                  onChange({ ...config, personnelDetail: { ...config.personnelDetail, siteManager: v }, teamCostPerDay: v + config.personnelDetail.pilot + config.personnelDetail.photographer + config.personnelDetail.assistantOrTechB * 2 })
                }
                unit="円/日"
              />
              <NumField
                label="操縦士 x1"
                value={config.personnelDetail.pilot}
                onChangeVal={(v) =>
                  onChange({ ...config, personnelDetail: { ...config.personnelDetail, pilot: v }, teamCostPerDay: config.personnelDetail.siteManager + v + config.personnelDetail.photographer + config.personnelDetail.assistantOrTechB * 2 })
                }
                unit="円/日"
              />
              <NumField
                label="撮影士 x1"
                value={config.personnelDetail.photographer}
                onChangeVal={(v) =>
                  onChange({ ...config, personnelDetail: { ...config.personnelDetail, photographer: v }, teamCostPerDay: config.personnelDetail.siteManager + config.personnelDetail.pilot + v + config.personnelDetail.assistantOrTechB * 2 })
                }
                unit="円/日"
              />
              <NumField
                label="撮影助手/技師B x2"
                value={config.personnelDetail.assistantOrTechB}
                onChangeVal={(v) =>
                  onChange({ ...config, personnelDetail: { ...config.personnelDetail, assistantOrTechB: v }, teamCostPerDay: config.personnelDetail.siteManager + config.personnelDetail.pilot + config.personnelDetail.photographer + v * 2 })
                }
                unit="円/日(1人)"
              />
            </div>
            <p className="text-xs text-text-muted mt-1">
              チーム合計: {config.teamCostPerDay.toLocaleString()}円/日（5名）
            </p>
          </div>

          <div>
            <h4 className="text-xs font-bold text-text-secondary mb-2 uppercase tracking-wider">
              機材費（円/日）
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <NumField
                label="ドローン損料"
                value={config.equipment.drone}
                onChangeVal={(v) => updateEquipment("drone", v)}
                unit="円/日"
              />
              <NumField
                label="IRカメラ"
                value={config.equipment.irCamera}
                onChangeVal={(v) => updateEquipment("irCamera", v)}
                unit="円/日"
              />
              <NumField
                label="ラインドローン"
                value={config.equipment.lineDroneSystem}
                onChangeVal={(v) => updateEquipment("lineDroneSystem", v)}
                unit="円/日"
              />
              <NumField
                label="その他"
                value={config.equipment.misc}
                onChangeVal={(v) => updateEquipment("misc", v)}
                unit="円/日"
              />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-text-secondary mb-2 uppercase tracking-wider">
              赤外線解析・その他
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <NumField
                label="外注解析"
                value={config.irAnalysis.outsourceCostPerM2}
                onChangeVal={(v) => updateIR("outsourceCostPerM2", v)}
                unit="円/m2"
              />
              <NumField
                label="自社解析"
                value={config.irAnalysis.internalCostPerM2}
                onChangeVal={(v) => updateIR("internalCostPerM2", v)}
                unit="円/m2"
              />
              <NumField
                label="交通費"
                value={config.transportationPerDay}
                onChangeVal={(v) =>
                  onChange({ ...config, transportationPerDay: v })
                }
                unit="円/日"
              />
              <NumField
                label="調査能力(ドローン)"
                value={config.droneCapacityPerDay}
                onChangeVal={(v) =>
                  onChange({ ...config, droneCapacityPerDay: v })
                }
                unit="m2/日"
              />
              <NumField
                label="調査能力(地上IR)"
                value={config.groundIRCapacityPerDay}
                onChangeVal={(v) =>
                  onChange({ ...config, groundIRCapacityPerDay: v })
                }
                unit="m2/日"
              />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-text-secondary mb-2 uppercase tracking-wider">
              料率・単価
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <NumField
                label="一般管理費率"
                value={config.adminRatePercent}
                onChangeVal={(v) =>
                  onChange({ ...config, adminRatePercent: v })
                }
                unit="%"
              />
              <NumField
                label="ドローン販売単価"
                value={config.unitPricePerM2}
                onChangeVal={(v) =>
                  onChange({ ...config, unitPricePerM2: v })
                }
                unit="円/m2"
              />
              <NumField
                label="ロープアクセス顧客単価"
                value={config.ropeAccessPricePerM2}
                onChangeVal={(v) =>
                  onChange({ ...config, ropeAccessPricePerM2: v })
                }
                unit="円/m2"
              />
              <NumField
                label="ロープアクセス下請単価"
                value={config.ropeAccessPercussionPerM2}
                onChangeVal={(v) =>
                  onChange({ ...config, ropeAccessPercussionPerM2: v })
                }
                unit="円/m2"
              />
            </div>
          </div>
        </div>
      )}
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
        if (saved) return JSON.parse(saved) as CostConfig;
      } catch {}
    }
    return { ...DEFAULT_CONFIG };
  });
  const [showCost, setShowCost] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem("drone-estimate-config", JSON.stringify(config));
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
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${showCost ? "bg-white/30 text-white" : "bg-white/10 text-white/60"}`}
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
            <div className="bg-white rounded-lg border border-border p-4">
              <h2 className="text-sm font-bold text-text-secondary mb-3">
                ビル基本情報
              </h2>
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
                        const ratio = currentSum > 0 ? newTotal / currentSum : 0;
                        const newFaces = building.faces.map((f) => ({
                          ...f,
                          area: Math.round(f.area * ratio),
                          ropeAccessArea: f.accessLevel === "no-drone" ? Math.round(f.area * ratio) : f.ropeAccessArea,
                        }));
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

            {/* Faces */}
            <div className="bg-white rounded-lg border border-border p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-bold text-text-secondary">
                  各面の設定
                </h2>
                <button
                  onClick={addFace}
                  className="text-xs px-2 py-1 border border-accent text-accent rounded hover:bg-accent hover:text-white transition-colors"
                >
                  + 面を追加
                </button>
              </div>
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
            {/* Feasibility */}
            <div
              className={`rounded-lg border p-4 ${overallBg[result.feasibility.overall]}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-bold">飛行可否判定</h2>
                <FeasibilityBadge level={result.feasibility.overall} />
                <span className="text-sm font-bold">
                  {overallLabel[result.feasibility.overall]}
                </span>
              </div>
              <FeasibilityPanel items={result.feasibility.items} />
            </div>

            {/* Face Summary with ○△× */}
            <div className="bg-white rounded-lg border border-border p-4">
              <h3 className="text-sm font-bold text-text-secondary mb-3">
                各面の判定サマリ
              </h3>
              <FaceSummaryTable result={result} />
            </div>

            {/* Key Metrics (Current scenario) */}
            <div className={`grid grid-cols-2 ${showCost ? "md:grid-cols-4" : ""} gap-3`}>
              <StatCard
                label="見積もり価格"
                value={yen(result.current.salesPrice)}
                sub={`${result.current.perM2.sales} 円/m2`}
                color="text-primary"
              />
              {showCost && (<>
              <StatCard
                label="原価（外注時）"
                value={yen(result.current.costBreakdown.totalCost)}
                sub={`${result.current.perM2.cost} 円/m2`}
              />
              <StatCard
                label="粗利（外注時）"
                value={yen(result.current.profit)}
                sub={`${result.current.perM2.profit} 円/m2`}
                color={
                  result.current.profit >= 0 ? "text-positive" : "text-negative"
                }
              />
              <StatCard
                label="粗利率（外注時）"
                value={pct(result.current.profitRate)}
                sub={`調査日数: ${result.surveyDays}日`}
                color={
                  result.current.profitRate >= 0
                    ? "text-positive"
                    : "text-negative"
                }
              />
              </>)}
              <StatCard
                label="調査日数"
                value={`${result.surveyDays}日`}
                color="text-text-secondary"
              />
            </div>

            {/* Area Breakdown */}
            <div className="bg-white rounded-lg border border-border p-4">
              <h3 className="text-sm font-bold text-text-secondary mb-3">
                面積内訳
              </h3>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="bg-blue-50 rounded p-2">
                  <div className="text-xs text-text-muted">ドローン調査</div>
                  <div className="font-bold text-accent">
                    {result.droneArea.toLocaleString()} m2
                  </div>
                </div>
                <div className="bg-green-50 rounded p-2">
                  <div className="text-xs text-text-muted">地上IR調査</div>
                  <div className="font-bold text-positive">
                    {result.groundIRArea.toLocaleString()} m2
                  </div>
                </div>
                <div className="bg-red-50 rounded p-2">
                  <div className="text-xs text-text-muted">
                    ロープアクセス
                  </div>
                  <div className="font-bold text-negative">
                    {result.ropeAccessArea.toLocaleString()} m2
                  </div>
                </div>
              </div>
            </div>

            {/* Two-Scenario Comparison */}
            <div>
              <h3 className="text-sm font-bold text-text-secondary mb-3">
                シナリオ比較
              </h3>
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

              {/* Improvement indicator */}
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
            </div>

            {/* Comparison with rope access */}
            <div className="bg-white rounded-lg border border-border p-4">
              <h3 className="text-sm font-bold text-text-secondary mb-3">
                ロープアクセスとの比較（全面ロープの場合）
              </h3>
              <ComparisonBar result={result} />
            </div>
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
          ミラテクドローン 見積もりシミュレーター v2.1 —
          概算見積もり用。正式見積もりは現地調査後に作成します。
          人件費は国交省R7年度設計業務委託等技術者単価に準拠。
        </p>
      </footer>
    </div>
  );
}
