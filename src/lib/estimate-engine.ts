// ============================================================
// ミラテクドローン 見積もりエンジン v2.0
// 実MTGフィードバック反映版
// ============================================================

// --- Input Types ---

export type AccessLevel = "free-drone" | "line-drone" | "no-drone";
export type InspectionMethod = "infrared" | "percussion" | "visual";

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
  accessLevel: AccessLevel;   // ○フリードローン / △ラインドローン / ×ドローン不可
  inspectionMethod: InspectionMethod; // 赤外線・打診・目視
  note: string;               // 注記欄
  ropeAccessArea: number;     // ロープアクセス対応面積 (no-drone時)
  groundIRPossible: boolean;  // 地上赤外線調査可能か（低層部）
  groundIRArea: number;       // 地上赤外線調査対象面積 (m2)
  obstacles: string[];        // 障害物メモ
}

// --- Configuration ---

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
  teamCostPerDay: number;     // チーム全体 (5人×50,000円)
  droneCapacityPerDay: number;
  groundIRCapacityPerDay: number;
  equipment: EquipmentConfig;
  irAnalysis: IRAnalysisConfig;
  transportationPerDay: number;
  adminRatePercent: number;
  unitPricePerM2: number;
  ropeAccessPricePerM2: number;
  ropeAccessPercussionPerM2: number; // 下請打診単価
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
  ropeAccessSubcontract: number;
  directCost: number;
  adminCost: number;
  totalCost: number;
}

export interface FaceResult {
  name: string;
  area: number;
  accessLevel: AccessLevel;
  inspectionMethod: InspectionMethod;
  note: string;
  pattern: string;    // 適用パターン名
  droneArea: number;
  groundIRArea: number;
  ropeAccessArea: number;
}

export interface CustomerEstimate {
  lineDroneIRFee: number;      // ラインドローン赤外線
  freeDroneIRFee: number;      // フリードローン赤外線
  groundIRFee: number;         // 地上赤外線
  ropePercussionFee: number;   // ロープアクセス打診
  analysisFee: number;         // 解析費
  totalEstimate: number;
}

export interface ComparisonResult {
  dronePrice: number;
  ropeAccessPrice: number;
  savings: number;
  savingsPercent: number;
}

export interface ScenarioResult {
  label: string;
  costBreakdown: CostBreakdown;
  salesPrice: number;
  customerEstimate: CustomerEstimate;
  profit: number;
  profitRate: number;
  perM2: { sales: number; cost: number; profit: number };
}

export interface EstimateResult {
  feasibility: FeasibilityCheck;
  surveyDays: number;
  faceResults: FaceResult[];
  droneArea: number;
  groundIRArea: number;
  ropeAccessArea: number;
  current: ScenarioResult;  // 現状（Sugitec外注）
  future: ScenarioResult;   // 将来（自社化後）
  comparison: ComparisonResult;
}

// --- Defaults ---

export const DEFAULT_CONFIG: CostConfig = {
  teamCostPerDay: 250000,       // 5人×50,000円
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
  adminRatePercent: 20,
  unitPricePerM2: 200,
  ropeAccessPricePerM2: 500,
  ropeAccessPercussionPerM2: 300,
};

export function createDefaultFace(name: string, area: number): FaceInput {
  return {
    name,
    area,
    accessLevel: "free-drone",
    inspectionMethod: "infrared",
    note: "",
    ropeAccessArea: 0,
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
      {
        ...createDefaultFace("西面", 3000),
        accessLevel: "line-drone" as AccessLevel,
      },
    ],
  },
  {
    name: "東劇ビル",
    label: "東劇ビル (~10,000m2)",
    totalArea: 10000,
    floors: 12,
    height: 45,
    faces: [
      {
        ...createDefaultFace("北面", 2500),
        accessLevel: "no-drone" as AccessLevel,
        inspectionMethod: "percussion" as InspectionMethod,
        note: "室外機・チラーがあるためドローン不可",
        ropeAccessArea: 2500,
      },
      {
        ...createDefaultFace("東面", 1500),
        accessLevel: "no-drone" as AccessLevel,
        inspectionMethod: "percussion" as InspectionMethod,
        note: "メルキー通りに面しているためドローン不可",
        ropeAccessArea: 1500,
      },
      {
        ...createDefaultFace("南面", 3500),
        accessLevel: "line-drone" as AccessLevel,
        inspectionMethod: "infrared" as InspectionMethod,
        note: "ラインドローン使用",
      },
      {
        ...createDefaultFace("西面", 2500),
        accessLevel: "no-drone" as AccessLevel,
        inspectionMethod: "percussion" as InspectionMethod,
        note: "室外機・チラーがあるためドローン不可",
        ropeAccessArea: 2500,
      },
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
  const droneFaces = building.faces.filter(
    (f) => f.accessLevel === "free-drone" || f.accessLevel === "line-drone"
  );
  const noDroneFaces = building.faces.filter(
    (f) => f.accessLevel === "no-drone"
  );

  if (noDroneFaces.length > 0) {
    const totalNoDrone = noDroneFaces.reduce((sum, f) => sum + f.area, 0);
    if (droneFaces.length === 0) {
      items.push({
        level: "blocker",
        message: "全面がドローンアクセス不可 — ロープアクセス等の代替手法が必要です",
      });
    } else {
      items.push({
        level: "warning",
        message: `${noDroneFaces.map((f) => f.name).join("、")}がドローン不可（${totalNoDrone.toLocaleString()}m2）— ロープアクセス打診で対応`,
      });
    }
  } else {
    items.push({
      level: "ok",
      message: "全面ドローンアクセス可能",
    });
  }

  // Line drone check
  const lineDroneFaces = building.faces.filter(
    (f) => f.accessLevel === "line-drone"
  );
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

// --- Face pattern classification ---

function classifyFacePattern(face: FaceInput): string {
  if (face.accessLevel === "free-drone" && face.inspectionMethod === "infrared") {
    return "フリードローン＋赤外線";
  }
  if (face.accessLevel === "line-drone" && face.inspectionMethod === "infrared") {
    return "ラインドローン＋赤外線";
  }
  if (face.accessLevel === "no-drone" && face.inspectionMethod === "percussion") {
    return "ロープアクセス＋打診";
  }
  if (face.accessLevel === "no-drone" && face.inspectionMethod === "visual") {
    return "目視検査";
  }
  if (face.groundIRPossible && face.groundIRArea > 0) {
    return "地上赤外線";
  }
  const methodLabel = face.inspectionMethod === "infrared"
    ? "赤外線"
    : face.inspectionMethod === "percussion"
    ? "打診"
    : "目視";
  const accessLabel = face.accessLevel === "free-drone"
    ? "フリードローン"
    : face.accessLevel === "line-drone"
    ? "ラインドローン"
    : "ロープアクセス";
  return `${accessLabel}＋${methodLabel}`;
}

// --- Estimate Calculation ---

function calculateScenario(
  label: string,
  irMode: "outsource" | "internal",
  building: BuildingInput,
  config: CostConfig,
  surveyDays: number,
  droneArea: number,
  groundIRArea: number,
  ropeAccessArea: number,
  needsLineDrone: boolean
): ScenarioResult {
  // Personnel cost
  const personnelCost = config.teamCostPerDay * surveyDays;

  // Equipment cost
  const dailyEquipment =
    config.equipment.drone +
    config.equipment.irCamera +
    config.equipment.misc +
    (needsLineDrone ? config.equipment.lineDroneSystem : 0);
  const equipmentCost = dailyEquipment * surveyDays;

  // IR analysis cost (only for drone-inspectable area)
  const totalIRArea = droneArea + groundIRArea;
  const irRate =
    irMode === "outsource"
      ? config.irAnalysis.outsourceCostPerM2
      : config.irAnalysis.internalCostPerM2;
  const irAnalysisCost = totalIRArea * irRate;

  // Transportation
  const transportationCost = config.transportationPerDay * surveyDays;

  // Rope access subcontract cost
  const ropeAccessSubcontract = ropeAccessArea * config.ropeAccessPercussionPerM2;

  // Totals
  const directCost =
    personnelCost + equipmentCost + irAnalysisCost + transportationCost + ropeAccessSubcontract;
  const adminCost = Math.round(directCost * (config.adminRatePercent / 100));
  const totalCost = directCost + adminCost;

  const costBreakdown: CostBreakdown = {
    personnel: personnelCost,
    equipment: equipmentCost,
    irAnalysis: irAnalysisCost,
    transportation: transportationCost,
    ropeAccessSubcontract,
    directCost,
    adminCost,
    totalCost,
  };

  // Customer estimate breakdown
  const lineDroneArea = building.faces
    .filter((f) => f.accessLevel === "line-drone" && f.inspectionMethod === "infrared")
    .reduce((sum, f) => sum + f.area - f.groundIRArea, 0);
  const freeDroneArea = building.faces
    .filter((f) => f.accessLevel === "free-drone" && f.inspectionMethod === "infrared")
    .reduce((sum, f) => sum + f.area - f.groundIRArea, 0);

  const customerEstimate: CustomerEstimate = {
    lineDroneIRFee: lineDroneArea * config.unitPricePerM2,
    freeDroneIRFee: freeDroneArea * config.unitPricePerM2,
    groundIRFee: groundIRArea * config.unitPricePerM2,
    ropePercussionFee: ropeAccessArea * config.ropeAccessPricePerM2,
    analysisFee: 0, // included in unit price
    totalEstimate: 0,
  };
  customerEstimate.totalEstimate =
    customerEstimate.lineDroneIRFee +
    customerEstimate.freeDroneIRFee +
    customerEstimate.groundIRFee +
    customerEstimate.ropePercussionFee;

  const salesPrice = customerEstimate.totalEstimate;
  const profit = salesPrice - totalCost;
  const profitRate = salesPrice > 0 ? (profit / salesPrice) * 100 : 0;

  const totalInspectArea = droneArea + groundIRArea + ropeAccessArea;
  const perM2 = {
    sales: totalInspectArea > 0 ? Math.round(salesPrice / totalInspectArea) : 0,
    cost: totalInspectArea > 0 ? Math.round(totalCost / totalInspectArea) : 0,
    profit: totalInspectArea > 0 ? Math.round(profit / totalInspectArea) : 0,
  };

  return {
    label,
    costBreakdown,
    salesPrice,
    customerEstimate,
    profit,
    profitRate,
    perM2,
  };
}

export function calculateEstimate(
  building: BuildingInput,
  config: CostConfig
): EstimateResult {
  const feasibility = checkFeasibility(building);

  // Face results
  const faceResults: FaceResult[] = building.faces.map((face) => {
    const isDrone =
      face.accessLevel === "free-drone" || face.accessLevel === "line-drone";
    const fDroneArea = isDrone ? face.area - face.groundIRArea : 0;
    const fRopeArea =
      face.accessLevel === "no-drone" ? face.ropeAccessArea || face.area : 0;

    return {
      name: face.name,
      area: face.area,
      accessLevel: face.accessLevel,
      inspectionMethod: face.inspectionMethod,
      note: face.note,
      pattern: classifyFacePattern(face),
      droneArea: Math.max(0, fDroneArea),
      groundIRArea: face.groundIRArea,
      ropeAccessArea: fRopeArea,
    };
  });

  // Area breakdown
  const droneArea = faceResults.reduce((s, f) => s + f.droneArea, 0);
  const groundIRArea = faceResults.reduce((s, f) => s + f.groundIRArea, 0);
  const ropeAccessArea = faceResults.reduce((s, f) => s + f.ropeAccessArea, 0);

  // Survey days
  const droneDays =
    droneArea > 0 ? Math.ceil(droneArea / config.droneCapacityPerDay) : 0;
  const groundIRDays =
    groundIRArea > 0
      ? Math.ceil(groundIRArea / config.groundIRCapacityPerDay)
      : 0;
  const surveyDays = Math.max(
    droneDays,
    groundIRDays,
    droneArea + groundIRArea > 0 ? 1 : 0
  );

  const needsLineDrone = building.faces.some(
    (f) => f.accessLevel === "line-drone"
  );

  // Two scenarios
  const current = calculateScenario(
    "現状（Sugitec外注）",
    "outsource",
    building,
    config,
    surveyDays,
    droneArea,
    groundIRArea,
    ropeAccessArea,
    needsLineDrone
  );

  const future = calculateScenario(
    "将来（自社化後）",
    "internal",
    building,
    config,
    surveyDays,
    droneArea,
    groundIRArea,
    ropeAccessArea,
    needsLineDrone
  );

  // Comparison with full rope access
  const totalArea = droneArea + groundIRArea + ropeAccessArea;
  const ropeAccessPrice = totalArea * config.ropeAccessPricePerM2;
  const dronePrice = current.salesPrice;
  const savings = ropeAccessPrice - dronePrice;
  const savingsPercent =
    ropeAccessPrice > 0 ? (savings / ropeAccessPrice) * 100 : 0;

  const comparison: ComparisonResult = {
    dronePrice,
    ropeAccessPrice,
    savings,
    savingsPercent,
  };

  return {
    feasibility,
    surveyDays,
    faceResults,
    droneArea,
    groundIRArea,
    ropeAccessArea,
    current,
    future,
    comparison,
  };
}
