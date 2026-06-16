import { describe, expect, it, jest } from '@jest/globals';
import {
  buildOpenRouterMediaUsageRequest,
  reportOpenRouterMediaUsage,
} from './cloudMediaUsage';

describe('OpenRouter cloud media usage reporting', () => {
  it('builds a Seedream image usage request from runner metadata', () => {
    const body = buildOpenRouterMediaUsageRequest({
      taskId: 'task_1',
      sessionId: 'session_1',
      projectDir: '/tmp/paradox',
      kind: 'image',
      filePath: 'assets/images/segments/segment_1.png',
      toolName: 'openrouter.image',
      nodeId: 'segment_image:segment_1',
      metadata: {
        provider: 'openrouter',
        model: 'bytedance-seed/seedream-4.5',
        responseId: 'chatcmpl_seedream',
        usage: { cost: 0.04 },
      },
    });

    expect(body).toMatchObject({
      idempotencyKey:
        'openrouter:image:bytedance-seed/seedream-4.5:chatcmpl_seedream',
      source: 'dhee-desktop-openrouter-runner',
      usageFact: {
        eventId: 'chatcmpl_seedream',
        kind: 'image_generation',
        toolName: 'openrouter.image',
        toolCallId: 'segment_image:segment_1',
        facts: {
          provider: 'openrouter',
          modelId: 'bytedance-seed/seedream-4.5',
          unitType: 'run',
          units: 1,
          providerCostUsd: 0.04,
          responseId: 'chatcmpl_seedream',
          rawUsage: { cost: 0.04 },
          filePath: 'assets/images/segments/segment_1.png',
        },
      },
    });
  });

  it('builds a Seedance video usage request with actual cost and seconds', () => {
    const body = buildOpenRouterMediaUsageRequest({
      taskId: 'task_1',
      sessionId: 'session_1',
      projectDir: '/tmp/paradox',
      kind: 'video',
      filePath: 'assets/videos/segments/segment_1.mp4',
      toolName: 'openrouter.video',
      nodeId: 'segment_video:segment_1',
      metadata: {
        provider: 'openrouter',
        model: 'bytedance/seedance-2.0',
        jobId: 'video_job_1',
        generationId: 'gen_seedance',
        usage: { cost: 0.3363 },
        requestedDurationSeconds: 5,
      },
    });

    expect(body).toMatchObject({
      idempotencyKey: 'openrouter:video:bytedance/seedance-2.0:video_job_1',
      usageFact: {
        eventId: 'video_job_1',
        kind: 'video_generation',
        facts: {
          provider: 'openrouter',
          modelId: 'bytedance/seedance-2.0',
          unitType: 'second',
          units: 5,
          seconds: 5,
          outputDurationSeconds: 5,
          providerCostUsd: 0.3363,
          jobId: 'video_job_1',
          generationId: 'gen_seedance',
          rawUsage: { cost: 0.3363 },
        },
      },
    });
  });

  it('skips non-OpenRouter or signed-out assets without calling the website', async () => {
    const fetchMock = jest.fn();

    await expect(
      reportOpenRouterMediaUsage({
        websiteUrl: 'https://dhee.test',
        token: null,
        kind: 'image',
        filePath: 'assets/image.png',
        metadata: {
          provider: 'openrouter',
          model: 'bytedance-seed/seedream-4.5',
          usage: { cost: 0.04 },
        },
        fetchImpl: fetchMock as never,
      }),
    ).resolves.toEqual({ status: 'skipped', reason: 'signed_out' });

    await expect(
      reportOpenRouterMediaUsage({
        websiteUrl: 'https://dhee.test',
        token: 'desktop-token',
        kind: 'image',
        filePath: 'assets/image.png',
        metadata: {
          provider: 'comfy',
          workflowId: 'zimage_cloud',
        },
        fetchImpl: fetchMock as never,
      }),
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'not_openrouter_media_usage',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts usage to the cloud media route with the desktop token', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ creditsUsed: 17, balance: 6983 }),
    }));

    const result = await reportOpenRouterMediaUsage({
      websiteUrl: 'https://dhee.test/',
      token: 'desktop-token',
      taskId: 'task_1',
      sessionId: 'session_1',
      projectDir: '/tmp/paradox',
      kind: 'image',
      filePath: 'assets/image.png',
      toolName: 'openrouter.image',
      nodeId: 'segment_image:segment_1',
      metadata: {
        provider: 'openrouter',
        model: 'bytedance-seed/seedream-4.5',
        responseId: 'chatcmpl_seedream',
        usage: { cost: 0.04 },
      },
      fetchImpl: fetchMock as never,
    });

    expect(result).toEqual({
      status: 'ok',
      httpStatus: 200,
      body: { creditsUsed: 17, balance: 6983 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dhee.test/api/cloud/openrouter/media-usage',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer desktop-token',
        },
      }),
    );
  });
});
