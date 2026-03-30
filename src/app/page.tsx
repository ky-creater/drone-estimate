"use client";

import { useState, useMemo, useCallback } from "react";
import {
  type BuildingInput,
  type FaceInput,
  type CostConfig,
  type EstimateResult,
  type FeasibilityItem,
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

function ComparisonBar({
  result,
}: {
  result: EstimateResult;
}) {
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
          <span>ドローン調査</span>
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
          <span>ロープアクセス</span>
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

function CostTable({ result }: { result: EstimateResult }) {
  const rows = [
    { label: "人件費", value: result.costBreakdown.personnel },
    { label: "機材費", value: result.costBreakdown.equipment },
    { label: "赤外線解析費", value: result.costBreakdown.irAnalysis },
    { label: "交通費", value: result.costBreakdown.transportation },
    {
      label: "直接原価 小計",
      value: result.costBreakdown.directCost,
      bold: true,
    },
    { label: "一般管理費", value: result.costBreakdown.adminCost },
    { label: "原価合計", value: result.costBreakdown.totalCost, bold: true },
  ];

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-2 font-medium text-text-secondary">
            項目
          </th>
          <th className="text-right py-2 font-medium text-text-secondary">
            金額
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={i}
            className={`border-b border-border ${r.bold ? "bg-gray-50" : ""}`}
          >
            <td className={`py-2 ${r.bold ? "font-bold" : ""}`}>{r.label}</td>
            <td className={`py-2 text-right ${r.bold ? "font-bold" : ""}`}>
              {yen(r.value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PerM2Table({ result }: { result: EstimateResult }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-2 font-medium text-text-secondary">
            m2単価
          </th>
          <th className="text-right py-2 font-medium text-text-secondary">
            金額
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-border">
          <td className="py-2">販売単価</td>
          <td className="py-2 text-right">{result.perM2.sales} 円/m2</td>
        </tr>
        <tr className="border-b border-border">
          <td className="py-2">原価単価</td>
          <td className="py-2 text-right">{result.perM2.cost} 円/m2</td>
        </tr>
        <tr className="border-b border-border bg-gray-50">
          <td className="py-2 font-bold">利益単価</td>
          <td
            className={`py-2 text-right font-bold ${result.perM2.profit >= 0 ? "text-positive" : "text-negative"}`}
          >
            {result.perM2.profit} 円/m2
          </td>
        </tr>
      </tbody>
    </table>
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

  return (
    <div className="border border-border rounded-lg p-3 bg-white">
      <div className="flex justify-between items-center mb-2">
        <input
          type="text"
          value={face.name}
          onChange={(e) => update({ name: e.target.value })}
          className="font-bold text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5"
        />
        <button
          onClick={() => onRemove(index)}
          className="text-xs text-text-muted hover:text-negative"
        >
          削除
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <label className="text-xs text-text-muted">面積 (m2)</label>
          <input
            type="number"
            value={face.area || ""}
            onChange={(e) => update({ area: Number(e.target.value) || 0 })}
            className="w-full border border-border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-text-muted">
            地上IR面積 (m2)
          </label>
          <input
            type="number"
            value={face.groundIRArea || ""}
            onChange={(e) =>
              update({ groundIRArea: Number(e.target.value) || 0 })
            }
            className="w-full border border-border rounded px-2 py-1 text-sm"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 mt-2 text-xs">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={face.droneAccessible}
            onChange={(e) => update({ droneAccessible: e.target.checked })}
            className="rounded"
          />
          ドローン可
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={face.lineDroneRequired}
            onChange={(e) => update({ lineDroneRequired: e.target.checked })}
            className="rounded"
          />
          ラインドローン必要
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={face.groundIRPossible}
            onChange={(e) => update({ groundIRPossible: e.target.checked })}
            className="rounded"
          />
          地上IR可
        </label>
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

  const updatePersonnel = (key: keyof CostConfig["personnel"], val: number) => {
    onChange({
      ...config,
      personnel: { ...config.personnel, [key]: val },
    });
  };
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
              人件費（円/日）
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <NumField
                label="パイロット"
                value={config.personnel.pilot}
                onChangeVal={(v) => updatePersonnel("pilot", v)}
                unit="円/日"
              />
              <NumField
                label="補助者"
                value={config.personnel.observer}
                onChangeVal={(v) => updatePersonnel("observer", v)}
                unit="円/日"
              />
              <NumField
                label="安全管理者"
                value={config.personnel.safetyManager}
                onChangeVal={(v) => updatePersonnel("safetyManager", v)}
                unit="円/日"
              />
              <NumField
                label="IR技術者"
                value={config.personnel.irTechnician}
                onChangeVal={(v) => updatePersonnel("irTechnician", v)}
                unit="円/日"
              />
              <NumField
                label="作業員"
                value={config.personnel.assistant}
                onChangeVal={(v) => updatePersonnel("assistant", v)}
                unit="円/日"
              />
            </div>
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
                label="販売単価"
                value={config.unitPricePerM2}
                onChangeVal={(v) =>
                  onChange({ ...config, unitPricePerM2: v })
                }
                unit="円/m2"
              />
              <NumField
                label="ロープアクセス単価"
                value={config.ropeAccessPricePerM2}
                onChangeVal={(v) =>
                  onChange({ ...config, ropeAccessPricePerM2: v })
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

  const [config, setConfig] = useState<CostConfig>({ ...DEFAULT_CONFIG });

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
        return { ...prev, faces };
      });
    },
    []
  );

  const removeFace = useCallback((index: number) => {
    setBuilding((prev) => ({
      ...prev,
      faces: prev.faces.filter((_, i) => i !== index),
    }));
  }, []);

  const addFace = useCallback(() => {
    setBuilding((prev) => ({
      ...prev,
      faces: [...prev.faces, createDefaultFace(`面${prev.faces.length + 1}`, 0)],
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
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-lg font-bold">
            ミラテクドローン 見積もりシミュレーター
          </h1>
          <p className="text-sm text-blue-200 mt-0.5">
            ドローン外壁調査の概算見積もりを即時算出
          </p>
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
                    placeholder="例: 〇〇ビルディング"
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
                      onChange={(e) =>
                        setBuilding({
                          ...building,
                          totalArea: Number(e.target.value) || 0,
                        })
                      }
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

            {/* Survey Settings */}
            <div className="bg-white rounded-lg border border-border p-4">
              <h2 className="text-sm font-bold text-text-secondary mb-3">
                調査設定
              </h2>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-text-muted">赤外線解析:</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="irMode"
                    checked={config.irAnalysisMode === "internal"}
                    onChange={() =>
                      setConfig({ ...config, irAnalysisMode: "internal" })
                    }
                  />
                  自社（{config.irAnalysis.internalCostPerM2}円/m2）
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="irMode"
                    checked={config.irAnalysisMode === "outsource"}
                    onChange={() =>
                      setConfig({ ...config, irAnalysisMode: "outsource" })
                    }
                  />
                  外注（{config.irAnalysis.outsourceCostPerM2}円/m2）
                </label>
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
          <div className="lg:col-span-3 space-y-4">
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

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="販売価格"
                value={yen(result.salesPrice)}
                sub={`${result.perM2.sales} 円/m2`}
                color="text-primary"
              />
              <StatCard
                label="原価"
                value={yen(result.costBreakdown.totalCost)}
                sub={`${result.perM2.cost} 円/m2`}
              />
              <StatCard
                label="粗利"
                value={yen(result.profit)}
                sub={`${result.perM2.profit} 円/m2`}
                color={
                  result.profit >= 0 ? "text-positive" : "text-negative"
                }
              />
              <StatCard
                label="粗利率"
                value={pct(result.profitRate)}
                sub={`調査日数: ${result.surveyDays}日`}
                color={
                  result.profitRate >= 0 ? "text-positive" : "text-negative"
                }
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
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-xs text-text-muted">アクセス不可</div>
                  <div className="font-bold text-text-muted">
                    {result.nonAccessibleArea.toLocaleString()} m2
                  </div>
                </div>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="bg-white rounded-lg border border-border p-4">
              <h3 className="text-sm font-bold text-text-secondary mb-3">
                原価内訳
              </h3>
              <CostTable result={result} />
            </div>

            {/* Per m2 */}
            <div className="bg-white rounded-lg border border-border p-4">
              <h3 className="text-sm font-bold text-text-secondary mb-3">
                m2単価の内訳
              </h3>
              <PerM2Table result={result} />
            </div>

            {/* Comparison */}
            <div className="bg-white rounded-lg border border-border p-4">
              <h3 className="text-sm font-bold text-text-secondary mb-3">
                ロープアクセスとの比較
              </h3>
              <ComparisonBar result={result} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border mt-8 py-4">
        <p className="text-center text-xs text-text-muted">
          ミラテクドローン 見積もりシミュレーター v1.0 --
          概算見積もり用。正式見積もりは現地調査後に作成します。
        </p>
      </footer>
    </div>
  );
}
