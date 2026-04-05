// ============================================================
// ミラテクドローン 見積もりエンジン v3.0
// 価格モデル_外壁点検_v07 反映版
// ============================================================

// --- Input Types ---

export type AccessLevel = "drone-possible" | "drone-impossible";
export type InspectionMethod = "infrared" | "percussion" | "visual";
export type SalesPriceMode = "stackup" | "unit-price";

export interface BuildingInput {
  name: string;
  totalArea: number;   // 総外壁面積 (m2) — メイン入力
  height: number;      // 高さ (m) — 参考表示用
  faces: FaceInput[];
}

export interface FaceInput {
  name: string;
  area: number;
  accessLevel: AccessLevel;
  inspectionMethod: InspectionMethod;
  note: string;
  ropeAccessArea: number;
  groundIRPossible: boolean;
  groundIRArea: number;
  obstacles: string[];
}

// --- Personnel Rates (円/時) ---

export interface PersonnelRates {
  siteManager: number;       // 調査現場責任者（主任技師相当）
  pilot: number;             // 操縦士
  photographer: number;      // 撮影士
  assistantOrTechB: number;  // 撮影助手 / 技師B
}

export interface PersonnelCount {
  siteManager: number;
  pilot: number;
  photographer: number;
  assistantOrTechB: number;
}

// --- Configuration ---

export interface EquipmentConfig {
  uavFirstDay: number;         // UAV損料 初日
  uavSubsequentPerDay: number; // UAV損料 2日目以降
  vehiclePerDay: number;       // 車両損料（日額）
  irCameraPerDay: number;      // 赤外線カメラ損料
  miscPerDay: number;          // その他機材
}

export interface IRAnalysisConfig {
  outsourceCostPerM2: number;
  internalCostPerM2: number;
}

export interface CostConfig {
  personnelSalesRates: PersonnelRates;
  personnelCostRates: PersonnelRates;
  personnelCount: PersonnelCount;
  fixedPersonnelSalesPerDay: number;  // 279,875円 (sales rates × 8h × 人数)
  fixedPersonnelCostPerDay: number;   // 197,700円 (cost rates × 8h × 人数)
  droneCapacityPerHour: number;       // m2/h ドローン調査能力
  groundIRCapacityPerHour: number;    // m2/h 地上赤外線調査能力
  workHoursPerDay: number;            // 飛行作業時間/日（6h）
  equipment: EquipmentConfig;
  irAnalysis: IRAnalysisConfig;
  ropeAccessOutsourcePerM2: number;   // ロープアクセス外注打診単価
  groundSurveyOutsourcePerM2: number; // 地上調査外注単価
  reportFee: number;                  // 報告書作成費（固定）
  overheadRatePercent: number;        // 一般管理費等率 42.1%
  sgaRatePercent: number;             // 販管費率 27.7%（営業利益計算用）
  salesPriceMode: SalesPriceMode;
  unitPriceDronePerM2: number;        // 面積単価モード: ドローン赤外線単価
  unitPriceAnalysisPerM2: number;     // 面積単価モード: 解析単価
  ropeAccessPricePerM2: number;       // 従来工法（ロープアクセス）比較単価
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
  personnel: number;             // 人件費（コスト単価ベース）
  equipment: number;             // 機材損料
  irAnalysis: number;            // 解析費
  ropeAccessSubcontract: number; // ロープアクセス外注
  reportFee: number;             // 報告書費
  externalCommission: number;    // 外部委託費合計（ロープ+報告書+解析外注）
  directBusinessCost: number;    // 直接業務費（人件費+機材）
  overhead: number;              // 一般管理費等 42.1%（直接業務費に適用）
  totalCost: number;             // 合計原価（コストベース）
}

export interface FaceResult {
  name: string;
  area: number;
  accessLevel: AccessLevel;
  inspectionMethod: InspectionMethod;
  note: string;
  pattern: string;
  droneArea: number;
  groundIRArea: number;
  ropeAccessArea: number;
}

export interface ScenarioResult {
  label: string;
  costBreakdown: CostBreakdown;
  salesPrice: number;             // 販売価格（積み上げ or 面積単価）
  stackupPrice: number;           // 積み上げ価格（参考）
  impliedDroneUnitPrice: number;  // 面積単価換算 円/m2
  grossProfit: number;            // 粗利 = 販売価格 - 合計原価
  grossProfitRate: number;        // 粗利率
  sgaCost: number;                // 販管費 = 販売価格 × 27.7%
  operatingProfit: number;        // 営業利益 = 粗利 - 販管費
  operatingProfitRate: number;    // 営業利益率
  surveyDays: number;
  shootingHours: number;
  droneArea: number;
  groundIRArea: number;
  ropeAccessArea: number;
  perM2: { sales: number; cost: number; operatingProfit: number };
  // Legacy aliases for backward compatibility
  profit: number;
  profitRate: number;
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
  faceResults: FaceResult[];
  droneArea: number;
  groundIRArea: number;
  ropeAccessArea: number;
  current: ScenarioResult;
  future: ScenarioResult;
  comparison: ComparisonResult;
}

// --- Defaults ---

// 国交省R7年度 設計業務委託等技術者単価
export const DEFAULT_PERSONNEL_SALES_RATES: PersonnelRates = {
  siteManager: 8363,
  pilot: 7038,
  photographer: 6025,
  assistantOrTechB: 4550,
};

// 原価計算指標単価
export const DEFAULT_PERSONNEL_COST_RATES: PersonnelRates = {
  siteManager: 6400,
  pilot: 4600,
  photographer: 4000,
  assistantOrTechB: 3100,
};

export const DEFAULT_PERSONNEL_COUNT: PersonnelCount = {
  siteManager: 1,
  pilot: 1,
  photographer: 1,
  assistantOrTechB: 2,
};

function calcDailyPersonnelCost(
  rates: PersonnelRates,
  count: PersonnelCount,
  billingHoursPerDay = 8
): number {
  return Math.round(
    (rates.siteManager * count.siteManager +
      rates.pilot * count.pilot +
      rates.photographer * count.photographer +
      rates.assistantOrTechB * count.assistantOrTechB) *
      billingHoursPerDay
  );
}

export const DEFAULT_CONFIG: CostConfig = {
  personnelSalesRates: { ...DEFAULT_PERSONNEL_SALES_RATES },
  personnelCostRates: { ...DEFAULT_PERSONNEL_COST_RATES },
  personnelCount: { ...DEFAULT_PERSONNEL_COUNT },
  fixedPersonnelSalesPerDay: calcDailyPersonnelCost(DEFAULT_PERSONNEL_SALES_RATES, DEFAULT_PERSONNEL_COUNT), // ≈279,875
  fixedPersonnelCostPerDay: calcDailyPersonnelCost(DEFAULT_PERSONNEL_COST_RATES, DEFAULT_PERSONNEL_COUNT),   // ≈197,700
  droneCapacityPerHour: 636,
  groundIRCapacityPerHour: 750,
  workHoursPerDay: 6,
  equipment: {
    uavFirstDay: 41160,
    uavSubsequentPerDay: 26440,
    vehiclePerDay: 26000,
    irCameraPerDay: 10000,
    miscPerDay: 5000,
  },
  irAnalysis: {
    outsourceCostPerM2: 120,
    internalCostPerM2: 60,
  },
  ropeAccessOutsourcePerM2: 350,
  groundSurveyOutsourcePerM2: 100,
  reportFee: 150000,
  overheadRatePercent: 42.1,
  sgaRatePercent: 27.7,
  salesPriceMode: "stackup",
  unitPriceDronePerM2: 210,
  unitPriceAnalysisPerM2: 60,
  ropeAccessPricePerM2: 500,
};

export function createDefaultFace(name: string, area: number): FaceInput {
  return {
    name,
    area,
    accessLevel: "drone-possible",
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
  height: number;
  faces: FaceInput[];
}

export const PRESETS: BuildingPreset[] = [
  {
    name: "小規模ビル",
    label: "小規模ビル (3,000m2)",
    totalArea: 3000,
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
    height: 95,
    faces: [
      createDefaultFace("北面", 4500),
      createDefaultFace("東面", 3000),
      createDefaultFace("南面", 4500),
      createDefaultFace("西面", 3000),
    ],
  },
  {
    name: "東劇ビル",
    label: "東劇ビル (17,000m2)",
    totalArea: 17000,
    height: 70,
    faces: [
      {
        ...createDefaultFace("北面", 4000),
        accessLevel: "drone-impossible" as AccessLevel,
        inspectionMethod: "percussion" as InspectionMethod,
        note: "大通りに面しており飛行規制によりドローン不可",
        ropeAccessArea: 4000,
      },
      {
        ...createDefaultFace("東面", 3000),
        accessLevel: "drone-impossible" as AccessLevel,
        inspectionMethod: "percussion" as InspectionMethod,
        note: "離発着場所不明、机上判断不可",
        ropeAccessArea: 3000,
      },
      {
        ...createDefaultFace("南面", 4000),
        note: "ラインドローンシステムでの赤外線調査が可能",
      },
      {
        ...createDefaultFace("西面", 3000),
        accessLevel: "drone-impossible" as AccessLevel,
        inspectionMethod: "percussion" as InspectionMethod,
        note: "離発着場所不明、机上判断不可",
        ropeAccessArea: 3000,
      },
      {
        ...createDefaultFace("低層部", 3000),
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
];

// --- Self-Improvement Simulation Types ---

export interface FutureOverrides {
  irAnalysisCostPerM2: number;
  personnelSalesRates?: Partial<PersonnelRates>;
  personnelCostRates?: Partial<PersonnelRates>;
  personnelCount?: Partial<PersonnelCount>;
  // Equipment overrides
  uavFirstDay?: number;
  uavSubsequentPerDay?: number;
  vehiclePerDay?: number;
  irCameraPerDay?: number;
  miscPerDay?: number;
}

export const DEFAULT_FUTURE_OVERRIDES: FutureOverrides = {
  irAnalysisCostPerM2: DEFAULT_CONFIG.irAnalysis.internalCostPerM2,
};

export function applyFutureOverrides(config: CostConfig, overrides: FutureOverrides): CostConfig {
  const c: CostConfig = JSON.parse(JSON.stringify(config));
  c.irAnalysis.outsourceCostPerM2 = overrides.irAnalysisCostPerM2;
  if (overrides.personnelSalesRates) {
    c.personnelSalesRates = { ...c.personnelSalesRates, ...overrides.personnelSalesRates };
  }
  if (overrides.personnelCostRates) {
    c.personnelCostRates = { ...c.personnelCostRates, ...overrides.personnelCostRates };
  }
  if (overrides.personnelCount) {
    c.personnelCount = { ...c.personnelCount, ...overrides.personnelCount };
  }
  // Recalculate daily totals
  c.fixedPersonnelSalesPerDay = calcDailyPersonnelCost(c.personnelSalesRates, c.personnelCount);
  c.fixedPersonnelCostPerDay = calcDailyPersonnelCost(c.personnelCostRates, c.personnelCount);
  if (overrides.uavFirstDay !== undefined) c.equipment.uavFirstDay = overrides.uavFirstDay;
  if (overrides.uavSubsequentPerDay !== undefined) c.equipment.uavSubsequentPerDay = overrides.uavSubsequentPerDay;
  if (overrides.vehiclePerDay !== undefined) c.equipment.vehiclePerDay = overrides.vehiclePerDay;
  if (overrides.irCameraPerDay !== undefined) c.equipment.irCameraPerDay = overrides.irCameraPerDay;
  if (overrides.miscPerDay !== undefined) c.equipment.miscPerDay = overrides.miscPerDay;
  return c;
}

// --- Feasibility Check ---

export function checkFeasibility(building: BuildingInput): FeasibilityCheck {
  const items: FeasibilityItem[] = [];

  if (building.height > 150) {
    items.push({ level: "blocker", message: `建物高さ ${building.height}m は飛行限界(150m)を超過しています` });
  } else if (building.height > 100) {
    items.push({ level: "warning", message: `建物高さ ${building.height}m — 高高度飛行の許可申請が必要です` });
  } else {
    items.push({ level: "ok", message: `建物高さ ${building.height}m — 標準飛行範囲内` });
  }

  const droneFaces = building.faces.filter((f) => f.accessLevel === "drone-possible");
  const noDroneFaces = building.faces.filter((f) => f.accessLevel === "drone-impossible");

  if (noDroneFaces.length > 0) {
    const totalNoDrone = noDroneFaces.reduce((sum, f) => sum + f.area, 0);
    if (droneFaces.length === 0) {
      items.push({ level: "blocker", message: "全面がドローンアクセス不可 — ロープアクセス等の代替手法が必要です" });
    } else {
      items.push({
        level: "warning",
        message: `${noDroneFaces.map((f) => f.name).join("、")}がドローン不可（${totalNoDrone.toLocaleString()}m2）— ロープアクセス打診で対応`,
      });
    }
  } else {
    items.push({ level: "ok", message: "全面ドローンアクセス可能" });
  }

  if (droneFaces.length > 0) {
    items.push({ level: "ok", message: `${droneFaces.map((f) => f.name).join("、")}でラインドローンシステムによる調査が可能` });
  }

  const facesWithObstacles = building.faces.filter((f) => f.obstacles.length > 0);
  if (facesWithObstacles.length > 0) {
    items.push({
      level: "warning",
      message: `障害物あり: ${facesWithObstacles.map((f) => `${f.name}(${f.obstacles.join(",")})`).join("、")}`,
    });
  }

  const hasBlocker = items.some((i) => i.level === "blocker");
  const hasWarning = items.some((i) => i.level === "warning");
  return { overall: hasBlocker ? "blocker" : hasWarning ? "warning" : "ok", items };
}

// --- Face Pattern Classification ---

function classifyFacePattern(face: FaceInput): string {
  if (face.accessLevel === "drone-possible" && face.inspectionMethod === "infrared") {
    return "ラインドローンシステム＋赤外線";
  }
  if (face.accessLevel === "drone-impossible" && face.inspectionMethod === "percussion") {
    return "ロープアクセス＋打診";
  }
  if (face.accessLevel === "drone-impossible" && face.inspectionMethod === "visual") {
    return "目視検査";
  }
  if (face.groundIRPossible && face.groundIRArea > 0) {
    return "地上赤外線";
  }
  const methodLabel = face.inspectionMethod === "infrared" ? "赤外線" : face.inspectionMethod === "percussion" ? "打診" : "目視";
  const accessLabel = face.accessLevel === "drone-possible" ? "ラインドローンシステム" : "ロープアクセス";
  return `${accessLabel}＋${methodLabel}`;
}

// --- Core Scenario Calculation ---

function calcEquipmentCost(eq: EquipmentConfig, surveyDays: number): number {
  if (surveyDays <= 0) return 0;
  const firstDay = eq.uavFirstDay + eq.vehiclePerDay + eq.irCameraPerDay + eq.miscPerDay;
  const subsequent = (eq.uavSubsequentPerDay + eq.vehiclePerDay + eq.irCameraPerDay + eq.miscPerDay) * (surveyDays - 1);
  return firstDay + subsequent;
}

function calculateScenario(
  label: string,
  irMode: "outsource" | "internal",
  config: CostConfig,
  droneArea: number,
  groundIRArea: number,
  ropeAccessArea: number,
): ScenarioResult {
  const irArea = droneArea + groundIRArea;

  // Survey timing (hourly capacity model)
  const droneHours = droneArea > 0 ? droneArea / config.droneCapacityPerHour : 0;
  const groundIRHours = groundIRArea > 0 ? groundIRArea / config.groundIRCapacityPerHour : 0;
  // Drone and ground IR can be done on separate days, but usually concurrent
  const shootingHours = Math.max(droneHours, groundIRHours);
  const surveyDays = irArea > 0 || ropeAccessArea > 0
    ? Math.max(Math.ceil(shootingHours / config.workHoursPerDay), 1)
    : 0;

  // === COST CALCULATION (コスト単価ベース) ===
  const personnelCost = config.fixedPersonnelCostPerDay * surveyDays;
  const equipmentCost = calcEquipmentCost(config.equipment, surveyDays);
  const irRate = irMode === "outsource"
    ? config.irAnalysis.outsourceCostPerM2
    : config.irAnalysis.internalCostPerM2;
  const irAnalysisCost = irArea * irRate;
  const ropeSubcontract = ropeAccessArea * config.ropeAccessOutsourcePerM2;
  const externalCommission = irAnalysisCost + ropeSubcontract + (irArea + ropeAccessArea > 0 ? config.reportFee : 0);
  // 合計原価 = 人件費 + 機材 + 外部委託費（一般管理費等なし）
  const totalCost = personnelCost + equipmentCost + externalCommission;

  const costBreakdown: CostBreakdown = {
    personnel: personnelCost,
    equipment: equipmentCost,
    irAnalysis: irAnalysisCost,
    ropeAccessSubcontract: ropeSubcontract,
    reportFee: irArea + ropeAccessArea > 0 ? config.reportFee : 0,
    externalCommission,
    directBusinessCost: personnelCost + equipmentCost,
    overhead: Math.round((personnelCost + equipmentCost) * (config.overheadRatePercent / 100)),
    totalCost,
  };

  // === SALES PRICE CALCULATION (積み上げ) ===
  // 積み上げ価格 = (人件費[販売単価] + 機材) × (1 + 42.1%) + 外部委託費
  const personnelSales = config.fixedPersonnelSalesPerDay * surveyDays;
  const directBusinessCostSales = personnelSales + equipmentCost;
  const overhead = Math.round(directBusinessCostSales * (config.overheadRatePercent / 100));
  const stackupPrice = directBusinessCostSales + overhead + externalCommission;

  // 面積単価モード
  let salesPrice: number;
  if (config.salesPriceMode === "unit-price") {
    salesPrice =
      droneArea * config.unitPriceDronePerM2 +
      irArea * config.unitPriceAnalysisPerM2 +
      ropeSubcontract +
      (irArea + ropeAccessArea > 0 ? config.reportFee : 0);
  } else {
    salesPrice = stackupPrice;
  }

  // 面積単価換算（参考）
  const droneAnalysisArea = Math.max(droneArea + groundIRArea, 1);
  const impliedDroneUnitPrice = Math.round(
    (salesPrice - ropeSubcontract - (irArea + ropeAccessArea > 0 ? config.reportFee : 0)) / droneAnalysisArea
  );

  // === PROFIT CALCULATION ===
  const grossProfit = salesPrice - totalCost;
  const grossProfitRate = salesPrice > 0 ? (grossProfit / salesPrice) * 100 : 0;
  const sgaCost = Math.round(salesPrice * (config.sgaRatePercent / 100));
  const operatingProfit = grossProfit - sgaCost;
  const operatingProfitRate = salesPrice > 0 ? (operatingProfit / salesPrice) * 100 : 0;

  const totalInspectArea = droneArea + groundIRArea + ropeAccessArea;
  const perM2 = {
    sales: totalInspectArea > 0 ? Math.round(salesPrice / totalInspectArea) : 0,
    cost: totalInspectArea > 0 ? Math.round(totalCost / totalInspectArea) : 0,
    operatingProfit: totalInspectArea > 0 ? Math.round(operatingProfit / totalInspectArea) : 0,
  };

  return {
    label,
    costBreakdown,
    salesPrice,
    stackupPrice,
    impliedDroneUnitPrice,
    grossProfit,
    grossProfitRate,
    sgaCost,
    operatingProfit,
    operatingProfitRate,
    surveyDays,
    shootingHours,
    droneArea,
    groundIRArea,
    ropeAccessArea,
    perM2,
    // Legacy aliases
    profit: operatingProfit,
    profitRate: operatingProfitRate,
  };
}

// --- Main Estimate Calculation ---

export function calculateEstimate(
  building: BuildingInput,
  config: CostConfig,
  futureOverrides?: FutureOverrides
): EstimateResult {
  const feasibility = checkFeasibility(building);

  const faceResults: FaceResult[] = building.faces.map((face) => {
    const isDrone = face.accessLevel === "drone-possible";
    const clampedGroundIR = Math.min(face.groundIRArea, face.area);
    const fDroneArea = isDrone ? face.area - clampedGroundIR : 0;
    const fRopeArea =
      face.accessLevel === "drone-impossible"
        ? Math.min(face.ropeAccessArea || face.area, face.area)
        : 0;
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

  const droneArea = faceResults.reduce((s, f) => s + f.droneArea, 0);
  const groundIRArea = faceResults.reduce((s, f) => s + f.groundIRArea, 0);
  const ropeAccessArea = faceResults.reduce((s, f) => s + f.ropeAccessArea, 0);

  const current = calculateScenario("現状（解析外注）", "outsource", config, droneArea, groundIRArea, ropeAccessArea);

  const ov = futureOverrides ?? DEFAULT_FUTURE_OVERRIDES;
  const futureConfig = applyFutureOverrides(config, ov);
  const future = calculateScenario("将来（自社化後）", "outsource", futureConfig, droneArea, groundIRArea, ropeAccessArea);

  const totalArea = droneArea + groundIRArea + ropeAccessArea;
  const ropeAccessPrice = totalArea * config.ropeAccessPricePerM2;
  const dronePrice = current.salesPrice;
  const savings = ropeAccessPrice - dronePrice;
  const savingsPercent = ropeAccessPrice > 0 ? (savings / ropeAccessPrice) * 100 : 0;

  return {
    feasibility,
    surveyDays: current.surveyDays,
    faceResults,
    droneArea,
    groundIRArea,
    ropeAccessArea,
    current,
    future,
    comparison: { dronePrice, ropeAccessPrice, savings, savingsPercent },
  };
}

// --- Height × Face Count Sensitivity Analysis (新型) ---

export interface SensitivityFaceResult {
  droneCount: number;
  droneArea: number;
  ropeArea: number;
  totalCost: number;
  stackupPrice: number;
  grossProfit: number;
  grossProfitRate: number;
  sgaCost: number;
  operatingProfit: number;
  operatingProfitRate: number;
  ropeAccessPrice: number;
  ropeDiscountRate: number;
  isViable: boolean;
  headroom: number;
  impliedDroneUnit: number;
}

export interface SensitivityHeightRow {
  height: number;
  totalArea: number;
  faceResults: SensitivityFaceResult[];
}

export interface HeightSensitivityResult {
  rows: SensitivityHeightRow[];
  faceCounts: number[];
}

// 高さ → 総外壁面積 変換係数 (m2 per meter of building height)
export const DEFAULT_AREA_PER_METER = 100; // 100 m2/m (=10m幅の4面ビル: 4×25m幅×height)

export function calculateHeightSensitivity(
  config: CostConfig,
  heights: number[] = [30, 50, 70, 90, 110, 130, 150],
  faceCounts: number[] = [0, 1, 2, 3, 4],
  areaPerMeter: number = DEFAULT_AREA_PER_METER
): HeightSensitivityResult {
  const rows: SensitivityHeightRow[] = heights.map((height) => {
    const totalArea = height * areaPerMeter;

    const faceResults: SensitivityFaceResult[] = faceCounts.map((droneCount) => {
      // 面積を droneCount 面ドローン / (4 - droneCount)面ロープ に分配
      const totalFaces = 4;
      const droneRatio = droneCount / totalFaces;
      const ropeRatio = (totalFaces - droneCount) / totalFaces;
      const droneArea = Math.round(totalArea * droneRatio);
      const ropeArea = Math.round(totalArea * ropeRatio);

      // 積み上げモードで計算
      const stackupConfig: CostConfig = { ...config, salesPriceMode: "stackup" };
      const scenario = calculateScenario("sens", "outsource", stackupConfig, droneArea, 0, ropeArea);

      const ropeAccessPrice = totalArea * config.ropeAccessPricePerM2;
      const ropeDiscountRate =
        ropeAccessPrice > 0 ? ((ropeAccessPrice - scenario.stackupPrice) / ropeAccessPrice) * 100 : 0;

      return {
        droneCount,
        droneArea,
        ropeArea,
        totalCost: scenario.costBreakdown.totalCost,
        stackupPrice: scenario.stackupPrice,
        grossProfit: scenario.grossProfit,
        grossProfitRate: scenario.grossProfitRate,
        sgaCost: scenario.sgaCost,
        operatingProfit: scenario.operatingProfit,
        operatingProfitRate: scenario.operatingProfitRate,
        ropeAccessPrice,
        ropeDiscountRate,
        isViable: scenario.operatingProfit > 0,
        headroom: scenario.stackupPrice - scenario.costBreakdown.totalCost,
        impliedDroneUnit: scenario.impliedDroneUnitPrice,
      };
    });

    return { height, totalArea, faceResults };
  });

  return { rows, faceCounts };
}

// --- Legacy Sensitivity Analysis (単価×シナリオ形式、後方互換) ---

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

function buildScenarioFaces(originalFaces: FaceInput[], droneCount: number): FaceInput[] {
  const groundIRFaces = originalFaces.filter((f) => f.groundIRPossible && f.groundIRArea >= f.area);
  const regularFaces = originalFaces.filter((f) => !(f.groundIRPossible && f.groundIRArea >= f.area));
  const sorted = [...regularFaces].sort((a, b) => {
    const order: Record<AccessLevel, number> = { "drone-possible": 0, "drone-impossible": 1 };
    return order[a.accessLevel] - order[b.accessLevel];
  });
  const scenarioFaces = sorted.map((face, i) => {
    if (i < droneCount) {
      return { ...face, accessLevel: "drone-possible" as AccessLevel, inspectionMethod: "infrared" as InspectionMethod, ropeAccessArea: 0 };
    } else {
      return { ...face, accessLevel: "drone-impossible" as AccessLevel, inspectionMethod: "percussion" as InspectionMethod, ropeAccessArea: face.area };
    }
  });
  return [...scenarioFaces, ...groundIRFaces];
}

export function calculateSensitivity(
  building: BuildingInput,
  config: CostConfig,
  priceRange: { min: number; max: number; step: number }
): SensitivityResult {
  const regularFaces = building.faces.filter((f) => !(f.groundIRPossible && f.groundIRArea >= f.area));
  const regularCount = regularFaces.length;

  const scenarioDefs: { label: string; droneCount: number }[] = [
    { label: "全面ロープ", droneCount: 0 },
    { label: "1面ドローン", droneCount: 1 },
  ];
  if (regularCount >= 3) {
    scenarioDefs.push({ label: "3面ドローン", droneCount: 3 });
  } else if (regularCount >= 2) {
    scenarioDefs.push({ label: `${regularCount}面ドローン`, droneCount: regularCount });
  }

  const rows: SensitivityRow[] = [];
  for (let price = priceRange.min; price <= priceRange.max; price += priceRange.step) {
    const scenarioResults: SensitivityScenario[] = scenarioDefs.map((sd) => {
      const faces = buildScenarioFaces(building.faces, sd.droneCount);
      const modifiedBuilding: BuildingInput = { ...building, faces };
      const modifiedConfig: CostConfig = { ...config, salesPriceMode: "stackup", unitPriceDronePerM2: price };
      const est = calculateEstimate(modifiedBuilding, modifiedConfig);
      return {
        label: sd.label,
        salesPrice: est.current.salesPrice,
        totalCost: est.current.costBreakdown.totalCost,
        profit: est.current.operatingProfit,
        profitRate: est.current.operatingProfitRate,
      };
    });
    rows.push({ unitPrice: price, scenarios: scenarioResults });
  }

  return { rows, scenarios: scenarioDefs.map((s) => s.label) };
}
