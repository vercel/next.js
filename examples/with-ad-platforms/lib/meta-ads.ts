import "server-only";
import type {
  MetaAdsCampaign,
  CreateMetaAdsCampaignRequest,
} from "./types";

/**
 * Meta Ads API Client
 * Manages Facebook and Instagram advertising campaigns
 */

const META_CONFIG = {
  accessToken: process.env.META_ACCESS_TOKEN,
  adAccountId: process.env.META_AD_ACCOUNT_ID,
  apiVersion: "v18.0",
};

const BASE_URL = `https://graph.facebook.com/${META_CONFIG.apiVersion}`;

class MetaAdsClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!META_CONFIG.accessToken) {
      throw new Error(
        "Meta access token not configured. Set META_ACCESS_TOKEN environment variable."
      );
    }

    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.set("access_token", META_CONFIG.accessToken);

    const response = await fetch(url.toString(), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `Meta API error: ${error.error?.message || "Unknown error"}`
      );
    }

    return response.json();
  }

  async getCampaigns(): Promise<MetaAdsCampaign[]> {
    if (!META_CONFIG.adAccountId) {
      throw new Error(
        "Meta ad account ID not configured. Set META_AD_ACCOUNT_ID environment variable."
      );
    }

    const data = await this.request<{ data: any[] }>(
      `/${META_CONFIG.adAccountId}/campaigns`,
      {
        method: "GET",
      }
    );

    return data.data.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      dailyBudget: campaign.daily_budget
        ? parseInt(campaign.daily_budget) / 100
        : undefined,
      lifetimeBudget: campaign.lifetime_budget
        ? parseInt(campaign.lifetime_budget) / 100
        : undefined,
    }));
  }

  async createCampaign(
    request: CreateMetaAdsCampaignRequest
  ): Promise<MetaAdsCampaign> {
    if (!META_CONFIG.adAccountId) {
      throw new Error(
        "Meta ad account ID not configured. Set META_AD_ACCOUNT_ID environment variable."
      );
    }

    const { name, objective, dailyBudget, lifetimeBudget, targetingInterests } = request;

    const params: any = {
      name,
      objective,
      status: "PAUSED",
      special_ad_categories: [],
    };

    if (dailyBudget) {
      params.daily_budget = Math.round(dailyBudget * 100);
    }

    if (lifetimeBudget) {
      params.lifetime_budget = Math.round(lifetimeBudget * 100);
    }

    const data = await this.request<any>(
      `/${META_CONFIG.adAccountId}/campaigns`,
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );

    return {
      id: data.id,
      name,
      objective,
      status: "PAUSED",
      dailyBudget,
      lifetimeBudget,
    };
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    await this.request(`/${campaignId}`, {
      method: "POST",
      body: JSON.stringify({ status: "PAUSED" }),
    });
  }

  async resumeCampaign(campaignId: string): Promise<void> {
    await this.request(`/${campaignId}`, {
      method: "POST",
      body: JSON.stringify({ status: "ACTIVE" }),
    });
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    await this.request(`/${campaignId}`, {
      method: "DELETE",
    });
  }

  async getCampaignInsights(campaignId: string): Promise<any> {
    const data = await this.request<any>(
      `/${campaignId}/insights`,
      {
        method: "GET",
      }
    );

    return data.data[0] || null;
  }
}

export const metaAds = new MetaAdsClient();
