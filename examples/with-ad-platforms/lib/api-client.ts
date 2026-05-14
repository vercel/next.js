/**
 * Unified API Client
 * Central export point for all API integrations
 *
 * This module provides a clean interface to:
 * - AI Content Generation (Claude, OpenAI)
 * - Google Ads API
 * - Meta Ads API (Facebook/Instagram)
 * - Stripe Payment API
 *
 * Usage:
 * ```typescript
 * import { generateContent, googleAds, metaAds, stripe } from '@/lib/api-client';
 *
 * // Generate AI content
 * await generateContent({ prompt: '...', type: 'ad-copy' });
 *
 * // Manage Google Ads
 * await googleAds.getCampaigns();
 *
 * // Manage Meta Ads
 * await metaAds.createCampaign({ name: '...', objective: 'CONVERSIONS' });
 *
 * // Process payments
 * await stripe.createCheckout({ priceId: '...', userId: '...', email: '...' });
 * ```
 */

// AI Content Generation
export { generateContent } from "./ai-content";

// Google Ads
export { googleAds } from "./google-ads";

// Meta Ads
export { metaAds } from "./meta-ads";

// Stripe
export { stripe } from "./stripe-client";

// Types
export type {
  GenerateContentRequest,
  GenerateContentResponse,
  GoogleAdsCampaign,
  CreateGoogleAdsCampaignRequest,
  MetaAdsCampaign,
  CreateMetaAdsCampaignRequest,
  CreateCheckoutRequest,
  CheckoutSession,
} from "./types";
