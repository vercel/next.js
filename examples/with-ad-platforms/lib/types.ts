// AI Content Generation Types
export interface GenerateContentRequest {
  prompt: string;
  type: 'ad-copy' | 'blog-post' | 'social-media' | 'email';
  tone?: 'professional' | 'casual' | 'friendly' | 'persuasive';
  maxLength?: number;
}

export interface GenerateContentResponse {
  content: string;
  tokensUsed: number;
  model: string;
}

// Google Ads Types
export interface GoogleAdsCampaign {
  id: string;
  name: string;
  status: 'ENABLED' | 'PAUSED' | 'REMOVED';
  budget: number;
  startDate: string;
  endDate?: string;
}

export interface CreateGoogleAdsCampaignRequest {
  name: string;
  budget: number;
  startDate: string;
  endDate?: string;
  targetingLocation?: string;
}

// Meta Ads Types
export interface MetaAdsCampaign {
  id: string;
  name: string;
  objective: 'CONVERSIONS' | 'TRAFFIC' | 'AWARENESS' | 'ENGAGEMENT';
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  dailyBudget?: number;
  lifetimeBudget?: number;
}

export interface CreateMetaAdsCampaignRequest {
  name: string;
  objective: 'CONVERSIONS' | 'TRAFFIC' | 'AWARENESS' | 'ENGAGEMENT';
  dailyBudget?: number;
  lifetimeBudget?: number;
  targetingInterests?: string[];
}

// Stripe Types
export interface CreateCheckoutRequest {
  priceId: string;
  userId: string;
  email: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string;
  status: 'open' | 'complete' | 'expired';
}
