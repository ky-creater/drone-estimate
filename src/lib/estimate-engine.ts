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

// 職種別単価（国交省R7年度 設計業務委託等技術者単価準拠）
export interface PersonnelDetail {
  siteManager: number;     // 調査現場責任者（主任技師相当）×1
  pilot: number;           // 操縦士 ×1
  photographer: number;    // 撮影士 ×1
  assistantOrTechB: number; // 撮影助手 or 技師(B) ×2
}

export interface CostConfig {
  teamCostPerDay: number;     // チーム全体（自動計算も可能）
  personnelDetail: PersonnelDetail; // 職種別内訳（参考表示用）
  droneCapacityPerDay: number;
  groundIRCapacityPerDay: number;
  equipment: EquipmentConfig;
  irAnalysis: IRAnalysisConfig;
  transportationPerDay: number;  // 熊谷→都心部往復
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
  grossProfit: number;      // 粗利 = 売上 - 直接原価
  grossProfitRate: number;  // 粗利率
  profit: number;           // 営業利益 = 粗利 - 一般管理費
  profitRate: number;       // 営業利益率
  perM2: { sales: number; cost: number; profit: number };
}

export interface EstimateResult {
  feasibility: FeasibilityCheck;
  surveyDays: number;
  faceResults: FaceResult[];
  droneArea: number;
  groundIRArea: number;
  ropeAccessArea: number;
  current: ScenarioResult;  // 現状（解析外注）
  future: ScenarioResult;   // 将来（自社化後）
  comparison: ComparisonResult;
}

// --- Defaults ---

// 国交省R7年度単価ベースのデフォルト値
export const DEFAULT_PERSONNEL: PersonnelDetail = {
  siteManager: 66900,      // 主任技師（設計業務）
  pilot: 56300,            // 操縦士（航空・船舶）
  photographer: 48200,     // 撮影士（航空・船舶）
  assistantOrTechB: 36400, // 撮影助手（航空・船舶）※技師Bなら48,500円
};

// チーム合計: 66,900 + 56,300 + 48,200 + 36,400×2 = 244,200円
export const DEFAULT_TEAM_COST = DEFAULT_PERSONNEL.siteManager
  + DEFAULT_PERSONNEL.pilot
  + DEFAULT_PERSONNEL.photographer
  + DEFAULT_PERSONNEL.assistantOrTechB * 2;

export const DEFAULT_CONFIG: CostConfig = {
  teamCostPerDay: DEFAULT_TEAM_COST, // 244,200円（国交省R7単価準拠）
  personnelDetail: { ...DEFAULT_PERSONNEL },
  droneCapacityPerDay: 2500,
  groundIRCapacityPerDay: 1500,
  equipment: {
    drone: 25000,              // ドローン機材損料（倉田さん回答: 約25,000円/日）
    irCamera: 10000,
    lineDroneSystem: 0,        // 車両損料に含む（倉田さん: 積載物多く車両運搬）
    misc: 5000,
  },
  irAnalysis: {
    outsourceCostPerM2: 120,   // 解析外注
    internalCostPerM2: 60,     // 自社実施
  },
  transportationPerDay: 8000,  // 熊谷→都心部往復（倉田さん: 片道3,000-5,000円）
  adminRatePercent: 20,
  unitPricePerM2: 350,
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
    label: "東劇ビル (17,000m2)",
    totalArea: 17000,
    floors: 19,
    height: 70,
    faces: [
      {
        ...createDefaultFace("北面", 4000),
        accessLevel: "no-drone" as AccessLevel,
        inspectionMethod: "percussion" as InspectionMethod,
        note: "大通りに面しており飛行規制によりドローン不可",
        ropeAccessArea: 4000,
      },
      {
        ...createDefaultFace("東面", 3000),
        accessLevel: "no-drone" as AccessLevel,
        inspectionMethod: "percussion" as InspectionMethod,
        note: "離発着場所不明、机上判断不可",
        ropeAccessArea: 3000,
      },
      {
        ...createDefaultFace("南面", 4000),
        accessLevel: "line-drone" as AccessLevel,
        inspectionMethod: "infrared" as InspectionMethod,
        note: "ラインドローンシステムでの赤外線調査が可能",
      },
      {
        ...createDefaultFace("西面", 3000),
        accessLevel: "no-drone" as AccessLevel,
        inspectionMethod: "percussion" as InspectionMethod,
        note: "離発着場所不明、机上判断不可",
        ropeAccessArea: 3000,
      },
      {
        ...createDefaultFace("低層部", 3000),
        accessLevel: "free-drone" as AccessLevel,
        inspectionMethod: "infrared" as InspectionMethod,
        groundIRPossible: true,
        groundIRArea: 3000,
        note: "ハンディ赤外線カメラにて診断",
      },
    ],
  },
  {
    name: "マンション",
    label: "マンション (6,000m2)",
    totalArea: 6000,
    floors: 14,
    height: 42,
    faces: [
      createDefaultFace("北面", 1800),
      createDefaultFace("東面", 1200),
      {
        ...createDefaultFace("南面", 1800),
        note: "バルコニー面（低層部は地上IR）",
        groundIRArea: 400,
      },
      createDefaultFace("西面", 1200),
    ],
  },
  {
    name: "物流倉庫",
    label: "物流倉庫 (4,000m2)",
    totalArea: 4000,
    floors: 2,
    height: 12,
    faces: [
      createDefaultFace("北面", 800),
      createDefaultFace("東面", 1200),
      createDefaultFace("南面", 800),
      createDefaultFace("西面", 1200),
    ],
  },
];

// --- Sensitivity Analysis Types ---

export interface SensitivityScenario {
  label: string;
  salesPrice: number;
  totalCost: number;
  profit: number;
  profitRate: number;
}

export interface SensitivityRow {
  unitPrice: number;
  scenarios: SensitivityScenario[];
}

export interface SensitivityResult {
  rows: SensitivityRow[];
  scenarios: string[];
}

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
  const grossProfit = salesPrice - directCost;
  const grossProfitRate = salesPrice > 0 ? (grossProfit / salesPrice) * 100 : 0;
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
    grossProfit,
    grossProfitRate,
    profit,
    profitRate,
    perM2,
  };
}

export interface FutureOverrides {
  // 解析費
  irAnalysisCostPerM2: number;
  // 人件費（日額）
  siteManagerCost: number;
  pilotCost: number;
  photographerCost: number;
  assistantCost: number;
  // 機材費（日額）
  droneCost: number;
  irCameraCost: number;
  lineDroneSystemCost: number;
  miscCost: number;
  // その他
  transportationPerDay: number;
  ropeAccessPercussionPerM2: number;
}

export const DEFAULT_FUTURE_OVERRIDES: FutureOverrides = {
  irAnalysisCostPerM2: DEFAULT_CONFIG.irAnalysis.internalCostPerM2, // 60（内製化）
  siteManagerCost: DEFAULT_CONFIG.personnelDetail.siteManager,
  pilotCost: 35000,                                                  // 自社雇用想定
  photographerCost: DEFAULT_CONFIG.personnelDetail.photographer,
  assistantCost: DEFAULT_CONFIG.personnelDetail.assistantOrTechB,
  droneCost: 5000,                                                   // 自社保有（減価償却）
  irCameraCost: 2000,                                                // 自社保有（減価償却）
  lineDroneSystemCost: DEFAULT_CONFIG.equipment.lineDroneSystem,
  miscCost: DEFAULT_CONFIG.equipment.misc,
  transportationPerDay: DEFAULT_CONFIG.transportationPerDay,
  ropeAccessPercussionPerM2: DEFAULT_CONFIG.ropeAccessPercussionPerM2,
};

export function applyFutureOverrides(config: CostConfig, overrides: FutureOverrides): CostConfig {
  const c = JSON.parse(JSON.stringify(config)) as CostConfig;
  c.personnelDetail = {
    siteManager: overrides.siteManagerCost,
    pilot: overrides.pilotCost,
    photographer: overrides.photographerCost,
    assistantOrTechB: overrides.assistantCost,
  };
  c.teamCostPerDay =
    c.personnelDetail.siteManager +
    c.personnelDetail.pilot +
    c.personnelDetail.photographer +
    c.personnelDetail.assistantOrTechB * 2;
  c.equipment = {
    drone: overrides.droneCost,
    irCamera: overrides.irCameraCost,
    lineDroneSystem: overrides.lineDroneSystemCost,
    misc: overrides.miscCost,
  };
  c.irAnalysis = { ...c.irAnalysis, outsourceCostPerM2: overrides.irAnalysisCostPerM2 };
  c.transportationPerDay = overrides.transportationPerDay;
  c.ropeAccessPercussionPerM2 = overrides.ropeAccessPercussionPerM2;
  return c;
}

export function calculateEstimate(
  building: BuildingInput,
  config: CostConfig,
  futureOverrides?: FutureOverrides
): EstimateResult {
  const feasibility = checkFeasibility(building);

  // Face results
  const faceResults: FaceResult[] = building.faces.map((face) => {
    const isDrone =
      face.accessLevel === "free-drone" || face.accessLevel === "line-drone";
    const clampedGroundIR = Math.min(face.groundIRArea, face.area);
    const fDroneArea = isDrone ? face.area - clampedGroundIR : 0;
    const fRopeArea =
      face.accessLevel === "no-drone" ? Math.min(face.ropeAccessArea || face.area, face.area) : 0;

    return {
      name: face.name,
      area: face.area,
      accessLevel: face.accessLevel,
      inspectionMethod: face.inspectionMethod,
      note: face.note,
      pattern: classifyFacePattern(face),
      droneArea: Math.max(0, fDroneArea),
      groundIRArea: clampedGroundIR,
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
    "現状（解析外注）",
    "outsource",
    building,
    config,
    surveyDays,
    droneArea,
    groundIRArea,
    ropeAccessArea,
    needsLineDrone
  );

  const ov = futureOverrides ?? DEFAULT_FUTURE_OVERRIDES;
  const futureConfig = applyFutureOverrides(config, ov);
  const future = calculateScenario(
    "将来（自社化後）",
    "outsource", // irAnalysis rate is baked into futureConfig.irAnalysis.outsourceCostPerM2
    building,
    futureConfig,
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

// --- Sensitivity Analysis ---

function buildScenarioFaces(
  originalFaces: FaceInput[],
  droneCount: number
): FaceInput[] {
  // Separate ground-IR-only faces from regular faces
  const groundIRFaces = originalFaces.filter(
    (f) => f.groundIRPossible && f.groundIRArea >= f.area
  );
  const regularFaces = originalFaces.filter(
    (f) => !(f.groundIRPossible && f.groundIRArea >= f.area)
  );

  // Sort regular faces: prioritize faces that were originally line-drone or free-drone
  const sorted = [...regularFaces].sort((a, b) => {
    const order: Record<AccessLevel, number> = {
      "line-drone": 0,
      "free-drone": 1,
      "no-drone": 2,
    };
    return order[a.accessLevel] - order[b.accessLevel];
  });

  const scenarioFaces = sorted.map((face, i) => {
    if (i < droneCount) {
      // This face uses line-drone
      return {
        ...face,
        accessLevel: "line-drone" as AccessLevel,
        inspectionMethod: "infrared" as InspectionMethod,
        ropeAccessArea: 0,
      };
    } else {
      // This face uses rope access
      return {
        ...face,
        accessLevel: "no-drone" as AccessLevel,
        inspectionMethod: "percussion" as InspectionMethod,
        ropeAccessArea: face.area,
      };
    }
  });

  return [...scenarioFaces, ...groundIRFaces];
}

export function calculateSensitivity(
  building: BuildingInput,
  config: CostConfig,
  priceRange: { min: number; max: number; step: number }
): SensitivityResult {
  // Count regular (non-ground-IR) faces for scenario generation
  const regularFaces = building.faces.filter(
    (f) => !(f.groundIRPossible && f.groundIRArea >= f.area)
  );
  const regularCount = regularFaces.length;

  // Define scenarios
  const scenarioDefs: { label: string; droneCount: number }[] = [
    { label: "全面ロープ", droneCount: 0 },
    { label: "1面ドローン", droneCount: 1 },
  ];
  if (regularCount >= 3) {
    scenarioDefs.push({ label: "3面ドローン", droneCount: 3 });
  }
  if (regularCount >= 2 && regularCount < 3) {
    scenarioDefs.push({
      label: `${regularCount}面ドローン`,
      droneCount: regularCount,
    });
  }

  const rows: SensitivityRow[] = [];

  for (
    let price = priceRange.min;
    price <= priceRange.max;
    price += priceRange.step
  ) {
    const scenarioResults: SensitivityScenario[] = scenarioDefs.map((sd) => {
      const faces = buildScenarioFaces(building.faces, sd.droneCount);
      const modifiedBuilding: BuildingInput = {
        ...building,
        faces,
      };
      const modifiedConfig: CostConfig = {
        ...config,
        unitPricePerM2: price,
      };
      const est = calculateEstimate(modifiedBuilding, modifiedConfig);
      return {
        label: sd.label,
        salesPrice: est.current.salesPrice,
        totalCost: est.current.costBreakdown.totalCost,
        profit: est.current.profit,
        profitRate: est.current.profitRate,
      };
    });

    rows.push({ unitPrice: price, scenarios: scenarioResults });
  }

  return {
    rows,
    scenarios: scenarioDefs.map((s) => s.label),
  };
}
