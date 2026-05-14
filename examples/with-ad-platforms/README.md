# Ad Platforms Integration Example

This example demonstrates how to integrate multiple advertising and payment platforms into a Next.js application using a unified API client.

## Features

- 🤖 **AI Content Generation** - Generate marketing content with Claude or OpenAI
- 📢 **Google Ads** - Manage Google Ads campaigns programmatically
- 📱 **Meta Ads** - Create and manage Facebook/Instagram advertising
- 💳 **Stripe** - Process payments and manage subscriptions

## Quick Start

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
# or
yarn install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Then add your API keys for the services you want to use:

```env
# AI Content (choose one or both)
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...

# Google Ads (optional)
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...
# ... etc

# Meta Ads (optional)
META_ACCESS_TOKEN=...
META_AD_ACCOUNT_ID=...

# Stripe (optional)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the example.

## Usage

### AI Content Generation

```typescript
import { generateContent } from '@/lib/api-client';

const result = await generateContent({
  prompt: 'Write a compelling ad for luxury watches',
  type: 'ad-copy',
  tone: 'persuasive',
  maxLength: 100,
});

console.log(result.content);
```

### Google Ads

```typescript
import { googleAds } from '@/lib/api-client';

// Get all campaigns
const campaigns = await googleAds.getCampaigns();

// Create a new campaign
const newCampaign = await googleAds.createCampaign({
  name: 'Summer Sale 2024',
  budget: 50.00,
  startDate: '2024-06-01',
  endDate: '2024-08-31',
});
```

### Meta Ads

```typescript
import { metaAds } from '@/lib/api-client';

// Get all campaigns
const campaigns = await metaAds.getCampaigns();

// Create a new campaign
const newCampaign = await metaAds.createCampaign({
  name: 'Product Launch',
  objective: 'CONVERSIONS',
  dailyBudget: 25.00,
});
```

### Stripe

```typescript
import { stripe } from '@/lib/api-client';

// Create a checkout session
const session = await stripe.createCheckout({
  priceId: 'price_1234567890',
  userId: 'user_123',
  email: 'customer@example.com',
});

// Redirect to checkout
window.location.href = session.url;
```

## API Documentation

### AI Content Generation

**`generateContent(request: GenerateContentRequest)`**

Generates marketing content using AI (Claude or OpenAI).

Parameters:
- `prompt: string` - The content generation prompt
- `type: 'ad-copy' | 'blog-post' | 'social-media' | 'email'` - Content type
- `tone?: 'professional' | 'casual' | 'friendly' | 'persuasive'` - Writing tone (default: 'professional')
- `maxLength?: number` - Maximum content length in characters (default: 1000)

Returns:
- `content: string` - Generated content
- `tokensUsed: number` - API tokens consumed
- `model: string` - AI model used

### Google Ads

**`googleAds.getCampaigns()`**

Retrieves all active Google Ads campaigns.

**`googleAds.createCampaign(request: CreateGoogleAdsCampaignRequest)`**

Creates a new Google Ads campaign.

### Meta Ads

**`metaAds.getCampaigns()`**

Retrieves all Meta advertising campaigns.

**`metaAds.createCampaign(request: CreateMetaAdsCampaignRequest)`**

Creates a new Meta advertising campaign.

**`metaAds.pauseCampaign(campaignId: string)`**

Pauses a campaign.

**`metaAds.resumeCampaign(campaignId: string)`**

Resumes a paused campaign.

### Stripe

**`stripe.createCheckout(request: CreateCheckoutRequest)`**

Creates a Stripe checkout session.

**`stripe.createCustomer(email: string, name?: string)`**

Creates a new Stripe customer.

**`stripe.createSubscription(customerId: string, priceId: string)`**

Creates a subscription for a customer.

## Getting API Keys

### Claude API

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Navigate to Settings > API Keys
3. Create a new API key
4. Add to `.env.local` as `CLAUDE_API_KEY`

### OpenAI API

1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Navigate to API Keys
3. Create a new API key
4. Add to `.env.local` as `OPENAI_API_KEY`

### Google Ads API

1. Follow the [Google Ads API quickstart](https://developers.google.com/google-ads/api/docs/get-started/oauth-cloud-project)
2. Set up OAuth 2.0 credentials
3. Generate a refresh token
4. Add all credentials to `.env.local`

### Meta Ads API

1. Create a Meta Business account at [business.facebook.com](https://business.facebook.com)
2. Create an app at [developers.facebook.com](https://developers.facebook.com)
3. Get an access token with `ads_management` permission
4. Add to `.env.local`

### Stripe API

1. Sign up at [stripe.com](https://stripe.com)
2. Navigate to Developers > API Keys
3. Use test mode keys for development
4. Add both public and secret keys to `.env.local`

## Project Structure

```
with-ad-platforms/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── ai-content.ts      # AI content generation client
│   ├── google-ads.ts      # Google Ads API client
│   ├── meta-ads.ts        # Meta Ads API client
│   ├── stripe-client.ts   # Stripe API client
│   ├── types.ts           # TypeScript types
│   └── api-client.ts      # Unified export
├── .env.example
├── next.config.js
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Claude API Documentation](https://docs.anthropic.com/claude/reference)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Google Ads API Documentation](https://developers.google.com/google-ads/api)
- [Meta Ads API Documentation](https://developers.facebook.com/docs/marketing-apis)
- [Stripe API Documentation](https://stripe.com/docs/api)

## License

MIT
