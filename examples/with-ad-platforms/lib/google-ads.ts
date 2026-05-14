import "server-only";
import type {
  GoogleAdsCampaign,
  CreateGoogleAdsCampaignRequest,
} from "./types";

/**
 * Google Ads API Client
 * Manages Google Ads campaigns, ad groups, and ads
 */

const GOOGLE_ADS_CONFIG = {
  clientId: process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
};

class GoogleAdsClient {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return;
    }

    if (!GOOGLE_ADS_CONFIG.clientId || !GOOGLE_ADS_CONFIG.clientSecret || !GOOGLE_ADS_CONFIG.refreshToken) {
      throw new Error(
        "Google Ads credentials not configured. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, and GOOGLE_ADS_REFRESH_TOKEN environment variables."
      );
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GOOGLE_ADS_CONFIG.clientId,
        client_secret: GOOGLE_ADS_CONFIG.clientSecret,
        refresh_token: GOOGLE_ADS_CONFIG.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh Google Ads access token");
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;
  }

  async getCampaigns(): Promise<GoogleAdsCampaign[]> {
    await this.ensureAccessToken();

    if (!GOOGLE_ADS_CONFIG.customerId || !GOOGLE_ADS_CONFIG.developerToken) {
      throw new Error(
        "Google Ads customer ID and developer token required. Set GOOGLE_ADS_CUSTOMER_ID and GOOGLE_ADS_DEVELOPER_TOKEN."
      );
    }

    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign_budget.amount_micros,
        campaign.start_date,
        campaign.end_date
      FROM campaign
      WHERE campaign.status != 'REMOVED'
    `;

    const response = await fetch(
      `https://googleads.googleapis.com/v15/customers/${GOOGLE_ADS_CONFIG.customerId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
          "developer-token": GOOGLE_ADS_CONFIG.developerToken,
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Ads API error: ${error.error?.message || "Unknown error"}`);
    }

    const data = await response.json();
    return (data.results || []).map((result: any) => ({
      id: result.campaign.id,
      name: result.campaign.name,
      status: result.campaign.status,
      budget: result.campaignBudget?.amountMicros / 1000000 || 0,
      startDate: result.campaign.startDate,
      endDate: result.campaign.endDate,
    }));
  }

  async createCampaign(
    request: CreateGoogleAdsCampaignRequest
  ): Promise<GoogleAdsCampaign> {
    await this.ensureAccessToken();

    if (!GOOGLE_ADS_CONFIG.customerId || !GOOGLE_ADS_CONFIG.developerToken) {
      throw new Error(
        "Google Ads customer ID and developer token required."
      );
    }

    const { name, budget, startDate, endDate, targetingLocation } = request;

    // Create campaign budget first
    const budgetOperation = {
      create: {
        name: `Budget for ${name}`,
        amountMicros: budget * 1000000,
        deliveryMethod: "STANDARD",
      },
    };

    const budgetResponse = await fetch(
      `https://googleads.googleapis.com/v15/customers/${GOOGLE_ADS_CONFIG.customerId}/campaignBudgets:mutate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
          "developer-token": GOOGLE_ADS_CONFIG.developerToken,
        },
        body: JSON.stringify({ operations: [budgetOperation] }),
      }
    );

    if (!budgetResponse.ok) {
      throw new Error("Failed to create campaign budget");
    }

    const budgetData = await budgetResponse.json();
    const budgetResourceName = budgetData.results[0].resourceName;

    // Create campaign
    const campaignOperation = {
      create: {
        name,
        status: "PAUSED",
        advertisingChannelType: "SEARCH",
        campaignBudget: budgetResourceName,
        startDate: startDate.replace(/-/g, ""),
        endDate: endDate?.replace(/-/g, ""),
      },
    };

    const campaignResponse = await fetch(
      `https://googleads.googleapis.com/v15/customers/${GOOGLE_ADS_CONFIG.customerId}/campaigns:mutate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
          "developer-token": GOOGLE_ADS_CONFIG.developerToken,
        },
        body: JSON.stringify({ operations: [campaignOperation] }),
      }
    );

    if (!campaignResponse.ok) {
      const error = await campaignResponse.json();
      throw new Error(`Failed to create campaign: ${error.error?.message || "Unknown error"}`);
    }

    const campaignData = await campaignResponse.json();
    const campaignId = campaignData.results[0].resourceName.split("/").pop();

    return {
      id: campaignId,
      name,
      status: "PAUSED",
      budget,
      startDate,
      endDate,
    };
  }
}

export const googleAds = new GoogleAdsClient();
