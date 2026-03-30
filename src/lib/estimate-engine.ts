// ============================================================
// ミラテクドローン 見積もりエンジン
// ============================================================

// --- Input Types ---

export interface BuildingInput {
  name: string;
  totalArea: number;          // 総外壁面積 (m2)
  floors: number;             // 階数
  height: number;             // 高さ (m)
  faces: FaceInput[];         // 各面の情報
}

export interface FaceInput {
  name: string;               // 面名 (北面、南面等)
  area: number;               // 面積 (m2)
  droneAccessible: boolean;   // ドローンアクセス可能か
  lineDroneRequired: boolean; // ラインドローンシステム必要か
  groundIRPossible: boolean;  // 地上赤外線調査可能か（低層部）
  groundIRArea: number;       // 地上赤外線調査対象面積 (m2)
  obstacles: string[];        // 障害物メモ
}

// --- Configuration ---

export interface PersonnelConfig {
  pilot: number;
  observer: number;
  safetyManager: number;
  irTechnician: number;
  assistant: number;
}

export interface EquipmentConfig {
  drone: number;
  irCamera: number;
  lineDroneSystem: number;
  misc: number;
}

export interface IRAnalysisConfig {
  outsourceCostPerM2: number;
  internalCostPerM2: number;
}

export interface CostConfig {
  personnel: PersonnelConfig;
  droneCapacityPerDay: number;
  groundIRCapacityPerDay: number;
  equipment: EquipmentConfig;
  irAnalysis: IRAnalysisConfig;
  transportationPerDay: number;
  adminRatePercent: number;
  profitRatePercent: number;
  unitPricePerM2: number;
  ropeAccessPricePerM2: number;
  irAnalysisMode: "internal" | "outsource";
}

// --- Output Types ---

export interface FeasibilityItem {
  level: "ok" | "warning" | "blocker";
  message: string;
}

export interface FeasibilityCheck {
  overall: "ok" | "warning" | "blocker";
  items: FeasibilityItem[];
}

export interface CostBreakdown {
  personnel: number;
  equipment: number;
  irAnalysis: number;
  transportation: number;
  directCost: number;
  adminCost: number;
  totalCost: number;
}

export interface ComparisonResult {
  dronePrice: number;
  ropeAccessPrice: number;
  savings: number;
  savingsPercent: number;
}

export interface EstimateResult {
  feasibility: FeasibilityCheck;
  surveyDays: number;
  droneArea: number;
  groundIRArea: number;
  nonAccessibleArea: number;
  costBreakdown: CostBreakdown;
  salesPrice: number;
  profit: number;
  profitRate: number;
  comparison: ComparisonResult;
  perM2: { sales: number; cost: number; profit: number };
}

// --- Defaults ---

export const DEFAULT_CONFIG: CostConfig = {
  personnel: {
    pilot: 35000,
    observer: 22000,
    safetyManager: 28000,
    irTechnician: 32000,
    assistant: 20000,
  },
  droneCapacityPerDay: 2500,
  groundIRCapacityPerDay: 1500,
  equipment: {
    drone: 15000,
    irCamera: 10000,
    lineDroneSystem: 25000,
    misc: 5000,
  },
  irAnalysis: {
    outsourceCostPerM2: 120,
    internalCostPerM2: 60,
  },
  transportationPerDay: 30000,
  adminRatePercent: 40,
  profitRatePercent: 15,
  unitPricePerM2: 200,
  ropeAccessPricePerM2: 500,
  irAnalysisMode: "internal",
};

export function createDefaultFace(name: string, area: number): FaceInput {
  return {
    name,
    area,
    droneAccessible: true,
    lineDroneRequired: false,
    groundIRPossible: false,
    groundIRArea: 0,
    obstacles: [],
  };
}

// --- Presets ---

export interface BuildingPreset {
  name: string;
  label: string;
  totalArea: number;
  floors: number;
  height: number;
  faces: FaceInput[];
}

export const PRESETS: BuildingPreset[] = [
  {
    name: "小規模ビル",
    label: "小規模ビル (3,000m2)",
    totalArea: 3000,
    floors: 8,
    height: 30,
    faces: [
      createDefaultFace("北面", 900),
      createDefaultFace("東面", 600),
      createDefaultFace("南面", 900),
      createDefaultFace("西面", 600),
    ],
  },
  {
    name: "中規模ビル",
    label: "中規模ビル (8,000m2)",
    totalArea: 8000,
    floors: 15,
    height: 55,
    faces: [
      createDefaultFace("北面", 2400),
      createDefaultFace("東面", 1600),
      createDefaultFace("南面", 2400),
      createDefaultFace("西面", 1600),
    ],
  },
  {
    name: "大規模ビル",
    label: "大規模ビル (15,000m2)",
    totalArea: 15000,
    floors: 25,
    height: 95,
    faces: [
      createDefaultFace("北面", 4500),
      createDefaultFace("東面", 3000),
      createDefaultFace("南面", 4500),
      { ...createDefaultFace("西面", 3000), lineDroneRequired: true },
    ],
  },
];

// --- Feasibility Check ---

export function checkFeasibility(building: BuildingInput): FeasibilityCheck {
  const items: FeasibilityItem[] = [];

  // Height check
  if (building.height > 150) {
    items.push({
      level: "blocker",
      message: `建物高さ ${building.height}m は飛行限界(150m)を超過しています`,
    });
  } else if (building.height > 100) {
    items.push({
      level: "warning",
      message: `建物高さ ${building.height}m — 高高度飛行の許可申請が必要です`,
    });
  } else {
    items.push({
      level: "ok",
      message: `建物高さ ${building.height}m — 標準飛行範囲内`,
    });
  }

  // Accessible faces
  const accessibleFaces = building.faces.filter((f) => f.droneAccessible);
  const nonAccessibleFaces = building.faces.filter((f) => !f.droneAccessible);
  if (nonAccessibleFaces.length > 0) {
    const totalNonAccessible = nonAccessibleFaces.reduce(
      (sum, f) => sum + f.area,
      0
    );
    if (accessibleFaces.length === 0) {
      items.push({
        level: "blocker",
        message: "全面がドローンアクセス不可 — 代替手法の検討が必要です",
      });
    } else {
      items.push({
        level: "warning",
        message: `${nonAccessibleFaces.map((f) => f.name).join("、")}がアクセス不可（${totalNonAccessible.toLocaleString()}m2）— 別途手法が必要`,
      });
    }
  } else {
    items.push({
      level: "ok",
      message: "全面ドローンアクセス可能",
    });
  }

  // Line drone check
  const lineDroneFaces = building.faces.filter((f) => f.lineDroneRequired);
  if (lineDroneFaces.length > 0) {
    items.push({
      level: "warning",
      message: `${lineDroneFaces.map((f) => f.name).join("、")}でラインドローンシステムが必要 — 追加機材費が発生`,
    });
  }

  // Obstacles
  const facesWithObstacles = building.faces.filter(
    (f) => f.obstacles.length > 0
  );
  if (facesWithObstacles.length > 0) {
    items.push({
      level: "warning",
      message: `障害物あり: ${facesWithObstacles.map((f) => `${f.name}(${f.obstacles.join(",")})`).join("、")}`,
    });
  }

  // Overall
  const hasBlocker = items.some((i) => i.level === "blocker");
  const hasWarning = items.some((i) => i.level === "warning");
  const overall = hasBlocker ? "blocker" : hasWarning ? "warning" : "ok";

  return { overall, items };
}

// --- Estimate Calculation ---

export function calculateEstimate(
  building: BuildingInput,
  config: CostConfig
): EstimateResult {
  const feasibility = checkFeasibility(building);

  // Area breakdown
  const droneArea = building.faces
    .filter((f) => f.droneAccessible)
    .reduce((sum, f) => sum + f.area - f.groundIRArea, 0);

  const groundIRArea = building.faces.reduce(
    (sum, f) => sum + f.groundIRArea,
    0
  );

  const nonAccessibleArea = building.faces
    .filter((f) => !f.droneAccessible)
    .reduce((sum, f) => sum + f.area, 0);

  // Survey days
  const droneDays =
    droneArea > 0 ? Math.ceil(droneArea / config.droneCapacityPerDay) : 0;
  const groundIRDays =
    groundIRArea > 0
      ? Math.ceil(groundIRArea / config.groundIRCapacityPerDay)
      : 0;
  // Drone and ground IR can partly overlap; take max with at least 1 day if any work
  const surveyDays = Math.max(droneDays, groundIRDays, droneArea + groundIRArea > 0 ? 1 : 0);

  // Personnel cost (all 5 people for all survey days)
  const dailyPersonnel =
    config.personnel.pilot +
    config.personnel.observer +
    config.personnel.safetyManager +
    config.personnel.irTechnician +
    config.personnel.assistant;
  const personnelCost = dailyPersonnel * surveyDays;

  // Equipment cost
  const needsLineDrone = building.faces.some((f) => f.lineDroneRequired);
  const dailyEquipment =
    config.equipment.drone +
    config.equipment.irCamera +
    config.equipment.misc +
    (needsLineDrone ? config.equipment.lineDroneSystem : 0);
  const equipmentCost = dailyEquipment * surveyDays;

  // IR analysis cost
  const totalAnalysisArea = droneArea + groundIRArea;
  const irRate =
    config.irAnalysisMode === "outsource"
      ? config.irAnalysis.outsourceCostPerM2
      : config.irAnalysis.internalCostPerM2;
  const irAnalysisCost = totalAnalysisArea * irRate;

  // Transportation
  const transportationCost = config.transportationPerDay * surveyDays;

  // Totals
  const directCost =
    personnelCost + equipmentCost + irAnalysisCost + transportationCost;
  const adminCost = Math.round(directCost * (config.adminRatePercent / 100));
  const totalCost = directCost + adminCost;

  const costBreakdown: CostBreakdown = {
    personnel: personnelCost,
    equipment: equipmentCost,
    irAnalysis: irAnalysisCost,
    transportation: transportationCost,
    directCost,
    adminCost,
    totalCost,
  };

  // Sales price based on total inspectable area
  const inspectableArea = droneArea + groundIRArea;
  const salesPrice = inspectableArea * config.unitPricePerM2;
  const profit = salesPrice - totalCost;
  const profitRate = salesPrice > 0 ? (profit / salesPrice) * 100 : 0;

  // Comparison with rope access
  const ropeAccessPrice = inspectableArea * config.ropeAccessPricePerM2;
  const savings = ropeAccessPrice - salesPrice;
  const savingsPercent =
    ropeAccessPrice > 0 ? (savings / ropeAccessPrice) * 100 : 0;

  const comparison: ComparisonResult = {
    dronePrice: salesPrice,
    ropeAccessPrice,
    savings,
    savingsPercent,
  };

  // Per m2
  const perM2 = {
    sales: inspectableArea > 0 ? Math.round(salesPrice / inspectableArea) : 0,
    cost: inspectableArea > 0 ? Math.round(totalCost / inspectableArea) : 0,
    profit: inspectableArea > 0 ? Math.round(profit / inspectableArea) : 0,
  };

  return {
    feasibility,
    surveyDays,
    droneArea,
    groundIRArea,
    nonAccessibleArea,
    costBreakdown,
    salesPrice,
    profit,
    profitRate,
    comparison,
    perM2,
  };
}
