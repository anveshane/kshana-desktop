export type DheeCloudModelsStatus = 'ok' | 'signed_out' | 'error';

export interface DheeCloudMediaModel {
  id: string;
  provider: string;
  label: string;
  workflowId: string | null;
  modelId: string | null;
  unitType: string;
  runtimePriced: boolean;
  actualCostPriced: boolean;
  partnerCatalogPriced: boolean;
  creditsPerUnit: number | null;
  providerCreditsPerRun?: number | null;
  providerCreditsPerSecond?: number | null;
  runtimeRateProfileId?: string | null;
  runtimeRateSource?: string | null;
  runtimeRateRequired?: boolean;
  requiredRuntimeRateEnvVar?: string | null;
  creditsPerRuntimeSecond?: number | null;
  pricingRuleId: string;
}

export interface DheeCloudModelsResult {
  status: DheeCloudModelsStatus;
  image: DheeCloudMediaModel[];
  video: DheeCloudMediaModel[];
  httpStatus?: number;
  errorMessage?: string;
}
