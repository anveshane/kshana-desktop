import { describe, expect, it, jest } from '@jest/globals';
import { fetchDheeCloudModels } from './cloudModels';

describe('fetchDheeCloudModels', () => {
  it('does not call the website when the user is signed out', async () => {
    const fetchMock = jest.fn();

    const result = await fetchDheeCloudModels({
      websiteUrl: 'https://dhee.test',
      token: null,
      fetchImpl: fetchMock as never,
    });

    expect(result).toEqual({ status: 'signed_out', image: [], video: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches /api/cloud/models with the desktop account token and returns media arrays', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        models: {
          image: [
            {
              id: 'bytedance-seed/seedream-4.5',
              provider: 'openrouter',
              label: 'Seedream 4.5',
              modelId: 'bytedance-seed/seedream-4.5',
              unitType: 'run',
              actualCostPriced: true,
              creditsPerUnit: 17,
              pricingRuleId: 'openrouter-image-seedream-45',
            },
          ],
          video: [
            {
              id: 'bytedance/seedance-2.0',
              provider: 'openrouter',
              label: 'Seedance 2.0',
              modelId: 'bytedance/seedance-2.0',
              unitType: 'second',
              actualCostPriced: true,
              creditsPerUnit: 28.2492,
              pricingRuleId: 'openrouter-video-seedance-20',
            },
          ],
        },
      }),
    }));

    const result = await fetchDheeCloudModels({
      websiteUrl: 'https://dhee.test/',
      token: 'desktop-token',
      fetchImpl: fetchMock as never,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://dhee.test/api/cloud/models',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer desktop-token',
        },
      },
    );
    expect(result.status).toBe('ok');
    expect(result.image[0]).toMatchObject({
      provider: 'openrouter',
      modelId: 'bytedance-seed/seedream-4.5',
      actualCostPriced: true,
    });
    expect(result.video[0]).toMatchObject({
      provider: 'openrouter',
      modelId: 'bytedance/seedance-2.0',
      unitType: 'second',
    });
  });

  it('returns an error result for API failures', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({ message: 'models unavailable' }),
    }));

    const result = await fetchDheeCloudModels({
      websiteUrl: 'https://dhee.test',
      token: 'desktop-token',
      fetchImpl: fetchMock as never,
    });

    expect(result).toMatchObject({
      status: 'error',
      image: [],
      video: [],
      httpStatus: 503,
      errorMessage: 'models unavailable',
    });
  });
});
