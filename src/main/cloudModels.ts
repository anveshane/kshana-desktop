/* eslint import/prefer-default-export: off */
import type {
  DheeCloudMediaModel,
  DheeCloudModelsResult,
} from '../shared/cloudModelsTypes';

type FetchInit = {
  headers?: Record<string, string>;
};

type FetchLike = (
  input: string,
  init?: FetchInit,
) => Promise<{
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
}>;

interface FetchCloudModelsOptions {
  websiteUrl: string;
  token?: string | null;
  fetchImpl?: FetchLike;
}

function emptyResult(
  status: DheeCloudModelsResult['status'],
): DheeCloudModelsResult {
  return { status, image: [], video: [] };
}

function joinUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${pathname.replace(/^\/+/, '')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(
  source: Record<string, unknown>,
  key: string,
  fallback = '',
): string {
  const value = source[key];
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNullableNumber(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const message = body.message ?? body.error;
  return typeof message === 'string' && message.trim().length > 0
    ? message
    : undefined;
}

function normalizeModel(raw: unknown): DheeCloudMediaModel | null {
  if (!isRecord(raw)) return null;

  const id = readString(raw, 'id');
  const provider = readString(raw, 'provider');
  if (!id || !provider) return null;

  return {
    id,
    provider,
    label: readString(raw, 'label', id),
    workflowId: readNullableString(raw, 'workflowId'),
    modelId: readNullableString(raw, 'modelId'),
    unitType: readString(raw, 'unitType', 'run'),
    runtimePriced: Boolean(raw.runtimePriced),
    actualCostPriced: Boolean(raw.actualCostPriced),
    partnerCatalogPriced: Boolean(raw.partnerCatalogPriced),
    creditsPerUnit: readNullableNumber(raw, 'creditsPerUnit'),
    providerCreditsPerRun: readNullableNumber(raw, 'providerCreditsPerRun'),
    providerCreditsPerSecond: readNullableNumber(
      raw,
      'providerCreditsPerSecond',
    ),
    runtimeRateProfileId: readNullableString(raw, 'runtimeRateProfileId'),
    runtimeRateSource: readNullableString(raw, 'runtimeRateSource'),
    runtimeRateRequired: Boolean(raw.runtimeRateRequired),
    requiredRuntimeRateEnvVar: readNullableString(
      raw,
      'requiredRuntimeRateEnvVar',
    ),
    creditsPerRuntimeSecond: readNullableNumber(raw, 'creditsPerRuntimeSecond'),
    pricingRuleId: readString(raw, 'pricingRuleId', id),
  };
}

function normalizeModels(raw: unknown): DheeCloudMediaModel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeModel(item))
    .filter((item): item is DheeCloudMediaModel => Boolean(item));
}

export async function fetchDheeCloudModels({
  websiteUrl,
  token,
  // eslint-disable-next-line compat/compat
  fetchImpl = fetch,
}: FetchCloudModelsOptions): Promise<DheeCloudModelsResult> {
  const trimmedToken = token?.trim();
  if (!trimmedToken) return emptyResult('signed_out');

  try {
    const response = await fetchImpl(joinUrl(websiteUrl, '/api/cloud/models'), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${trimmedToken}`,
      },
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ...emptyResult('error'),
        httpStatus: response.status,
        errorMessage:
          readErrorMessage(body) ||
          response.statusText ||
          `HTTP ${response.status}`,
      };
    }

    if (!isRecord(body) || !isRecord(body.models)) {
      return {
        ...emptyResult('error'),
        httpStatus: response.status,
        errorMessage: 'Cloud models response was missing models.',
      };
    }

    return {
      status: 'ok',
      image: normalizeModels(body.models.image),
      video: normalizeModels(body.models.video),
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      ...emptyResult('error'),
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
