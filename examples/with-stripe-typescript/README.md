# Example using Stripe with TypeScript and react-stripe-js 🔒💸

- Demo: https://nextjs-typescript-react-stripe-js.now.sh/
- CodeSandbox: https://codesandbox.io/s/nextjs-typescript-react-stripe-js-rqrss
- Tutorial: https://dev.to/thorwebdev/type-safe-payments-with-next-js-typescript-and-stripe-4jo7

This is a full-stack TypeScript example using:

- Frontend:
  - Next.js and [SWR](https://github.com/zeit/swr)
  - [react-stripe-js](https://github.com/stripe/react-stripe-js) for [Checkout](https://stripe.com/checkout) and [Elements](https://stripe.com/elements)
- Backend
  - Next.js [API routes](https://nextjs.org/docs/api-routes/introduction)
  - [stripe-node with TypeScript](https://github.com/stripe/stripe-node#usage-with-typescript)

### Included functionality

- Making `.env` variables available to next: [next.config.js](next.config.js)
  - **Note**: When deploying with Now you need to [add your secrets](https://zeit.co/docs/v2/serverless-functions/env-and-secrets) and specify a [now.json](/now.json) file.
- Implementation of a Layout component that loads and sets up Stripe.js and Elements for usage with SSR via `loadStripe` helper: [components/Layout.tsx](components/Layout.tsx).
- Stripe Checkout
  - Custom Amount Donation with redirect to Stripe Checkout:
    - Frontend: [pages/donate-with-checkout.tsx](pages/donate-with-checkout.tsx)
    - Backend: [pages/api/checkout_sessions/](pages/api/checkout_sessions/)
    - Checkout payment result page that uses [SWR](https://github.com/zeit/swr) hooks to fetch the CheckoutSession status from the API route: [pages/result.tsx](pages/result.tsx).
- Stripe Elements
  - Custom Amount Donation with Stripe Elements & PaymentIntents (no redirect):
    - Frontend: [pages/donate-with-elements.tsx](pages/donate-with-checkout.tsx)
    - Backend: [pages/api/payment_intents/](pages/api/payment_intents/)
- Webhook handling for [post-payment events](https://stripe.com/docs/payments/accept-a-payment#web-fulfillment)
  - By default Next.js API routes are same-origin only. To allow Stripe webhook event requests to reach our API route, we need to add `micro-cors` and [verify the webhook signature](https://stripe.com/docs/webhooks/signatures) of the event. All of this happens in [pages/api/webhooks/index.ts](pages/api/webhooks/index.ts).
- Helpers
  - [utils/api-helpers.ts](utils/api-helpers.ts)
    - helpers for GET and POST requests.
  - [utils/stripe-helpers.ts](utils/stripe-helpers.ts)
    - Format amount strings properly using `Intl.NumberFormat`.
    - Format amount for usage with Stripe, including zero decimal currency detection.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-stripe-typescript with-stripe-typescript-app
# or
yarn create next-app --example with-stripe-typescript with-stripe-typescript-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-stripe-typescript
cd with-stripe-typescript
```

### Required configuration

Copy the `.env.example` file into a file named `.env` in the root directory of this project:

```bash
cp .env.example .env
```

You will need a Stripe account ([register](https://dashboard.stripe.com/register)) to run this sample. Go to the Stripe [developer dashboard](https://stripe.com/docs/development#api-keys) to find your API keys and replace them in the `.env` file.

```bash
STRIPE_PUBLISHABLE_KEY=<replace-with-your-publishable-key>
STRIPE_SECRET_KEY=<replace-with-your-secret-key>
```

Now install the dependencies and start the development server.

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

### Forward webhooks to your local dev server

First [install the CLI](https://stripe.com/docs/stripe-cli) and [link your Stripe account](https://stripe.com/docs/stripe-cli#link-account).

Next, start the webhook forwarding:

```bash
stripe listen --forward-to localhost:3000/api/webhooks
```

The CLI will print a webhook secret key to the console. Set `STRIPE_WEBHOOK_SECRET` to this value in your `.env` file.

### Deploy

Deploy it to the cloud with [ZEIT Now](https://zeit.co/new?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

**Note**: You must add your Stripe secrets using the ZEIT Now CLI ([Download here](https://zeit.co/download)):

```bash
now secrets add stripe_publishable_key pk_***
now secrets add stripe_secret_key sk_***
now secrets add stripe_webhook_secret whsec_***
```

After deploying, copy the deployment URL with the webhook path (`https://your-url.now.sh/api/webhooks`) and create a live webhook endpoint [in your Stripe dashboard](https://stripe.com/docs/webhooks/setup#configure-webhook-settings).

**Note**: Your live webhook will have a different secret. To update it in your deployed application you will need to first remove the existing secret and then add the new secret:

```bash
now secrets rm stripe_webhook_secret
now secrets add stripe_webhook_secret whsec_***
```

As the secrets are set as env vars in the project at deploy time, we will need to redeploy our app after we made changes to the secrets.
