import { createHash } from 'node:crypto';

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
}>;

export interface OpenRouterMediaAssetUsageInput {
  websiteUrl: string;
  token?: string | null;
  taskId?: string;
  sessionId?: string;
  projectDir?: string;
  kind: 'image' | 'video';
  filePath: string;
  toolName?: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
  fetchImpl?: FetchLike;
}

export type OpenRouterMediaUsageReportResult =
  | { status: 'ok'; httpStatus: number; body: unknown }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; httpStatus?: number; errorMessage: string; body?: unknown };

export interface OpenRouterMediaUsageRequestBody {
  idempotencyKey: string;
  source: 'dhee-desktop-openrouter-runner';
  usageFact: {
    eventId: string;
    kind: 'image_generation' | 'video_generation';
    toolName?: string;
    toolCallId?: string;
    facts: Record<string, unknown>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = positiveNumber(value);
  return parsed === null ? null : Math.ceil(parsed);
}

function joinUrl(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${pathname.replace(/^\/+/, '')}`;
}

function stableHash(parts: Array<unknown>): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(String(part ?? ''));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 32);
}

function readRawUsage(metadata: Record<string, unknown>): Record<string, unknown> | null {
  const usage = metadata.usage;
  return isRecord(usage) ? usage : null;
}

function readProviderCostUsd(
  metadata: Record<string, unknown>,
  rawUsage: Record<string, unknown> | null,
): number | null {
  return (
    positiveNumber(rawUsage?.cost) ??
    positiveNumber(rawUsage?.total_cost) ??
    positiveNumber(metadata.providerCostUsd) ??
    positiveNumber(metadata.costUsd)
  );
}

function readVideoSeconds(
  metadata: Record<string, unknown>,
  rawUsage: Record<string, unknown> | null,
): number | null {
  return (
    positiveInteger(metadata.requestedDurationSeconds) ??
    positiveInteger(metadata.outputDurationSeconds) ??
    positiveInteger(metadata.duration) ??
    positiveInteger(metadata.seconds) ??
    positiveInteger(rawUsage?.seconds)
  );
}

export function buildOpenRouterMediaUsageRequest(
  input: Omit<OpenRouterMediaAssetUsageInput, 'websiteUrl' | 'token' | 'fetchImpl'>,
): OpenRouterMediaUsageRequestBody | null {
  const metadata = input.metadata;
  if (!metadata || !isRecord(metadata)) return null;

  const provider = nonEmptyString(metadata.provider)?.toLowerCase();
  if (provider !== 'openrouter') return null;

  const modelId = nonEmptyString(metadata.modelId) ?? nonEmptyString(metadata.model);
  if (!modelId) return null;

  const rawUsage = readRawUsage(metadata);
  const providerCostUsd = readProviderCostUsd(metadata, rawUsage);
  const generationId = nonEmptyString(metadata.generationId);
  const jobId = nonEmptyString(metadata.jobId);
  const responseId = nonEmptyString(metadata.responseId);
  const providerEventId = responseId ?? jobId ?? generationId;
  const fallbackEventId = stableHash([
    input.projectDir,
    input.sessionId,
    input.nodeId,
    input.filePath,
    modelId,
  ]);
  const eventId = providerEventId ?? fallbackEventId;
  const category = input.kind === 'video' ? 'video' : 'image';
  const usageKind = category === 'video' ? 'video_generation' : 'image_generation';
  const seconds = category === 'video' ? readVideoSeconds(metadata, rawUsage) : null;

  if (category === 'video' && providerCostUsd === null && seconds === null) {
    return null;
  }

  const units = category === 'video' ? seconds ?? 1 : 1;
  const idempotencyKey = `openrouter:${category}:${modelId}:${eventId}`;
  const facts: Record<string, unknown> = {
    provider: 'openrouter',
    modelId,
    unitType: category === 'video' ? 'second' : 'run',
    units,
    filePath: input.filePath,
    ...(category === 'video' && seconds !== null
      ? { seconds, outputDurationSeconds: seconds }
      : {}),
    ...(providerCostUsd !== null ? { providerCostUsd } : {}),
    ...(generationId ? { generationId } : {}),
    ...(jobId ? { jobId } : {}),
    ...(responseId ? { responseId } : {}),
    ...(rawUsage ? { rawUsage } : {}),
  };

  return {
    idempotencyKey,
    source: 'dhee-desktop-openrouter-runner',
    usageFact: {
      eventId,
      kind: usageKind,
      ...(input.toolName ? { toolName: input.toolName } : {}),
      ...(input.nodeId ? { toolCallId: input.nodeId } : {}),
      facts,
    },
  };
}

function readErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const message = body.message ?? body.error;
  return typeof message === 'string' && message.trim() ? message : undefined;
}

export async function reportOpenRouterMediaUsage({
  websiteUrl,
  token,
  fetchImpl = fetch,
  ...asset
}: OpenRouterMediaAssetUsageInput): Promise<OpenRouterMediaUsageReportResult> {
  const trimmedToken = token?.trim();
  if (!trimmedToken) return { status: 'skipped', reason: 'signed_out' };

  const body = buildOpenRouterMediaUsageRequest(asset);
  if (!body) return { status: 'skipped', reason: 'not_openrouter_media_usage' };

  try {
    const response = await fetchImpl(
      joinUrl(websiteUrl, '/api/cloud/openrouter/media-usage'),
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${trimmedToken}`,
        },
        body: JSON.stringify(body),
      },
    );
    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        status: 'error',
        httpStatus: response.status,
        errorMessage:
          readErrorMessage(responseBody) ||
          response.statusText ||
          `HTTP ${response.status}`,
        body: responseBody,
      };
    }

    return { status: 'ok', httpStatus: response.status, body: responseBody };
  } catch (error) {
    return {
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
