# Example using Stripe with TypeScript and react-stripe-js

This is a full-stack TypeScript example using:

- Frontend:
  - Next.js
  - [react-stripe-js](https://github.com/stripe/react-stripe-js) for [Checkout](https://stripe.com/checkout) and [Elements](https://stripe.com/elements)
- Backend
  - Next.js [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) and [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/forms-and-mutations)
  - [stripe-node with TypeScript](https://github.com/stripe/stripe-node#usage-with-typescript)

## Demo

- [Live demo](https://nextjs-with-stripe-typescript-demo.vercel.app)
- [Guide](https://vercel.com/guides/getting-started-with-nextjs-typescript-stripe)

The demo is running in test mode -- use `4242424242424242` as a test card number with any CVC + future expiration date.

Use the `4000002760003184` test card number to trigger a 3D Secure challenge flow.

[Read more](https://stripe.com/docs/testing) about testing on Stripe.

<details><summary>Checkout Donations Demo</summary>
<img src="./public/checkout_demo.gif" alt="A gif of the Checkout payment page." align="center">
</details>

<details><summary>Elements Donations Demo</summary>
<img src="./public/elements_demo.gif" alt="A gif of the custom Elements checkout page." align="center">
</details>

## Deploy your own

Once you have access to [the environment variables you'll need](#required-configuration) from the [Stripe Dashboard](https://dashboard.stripe.com/apikeys), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example).

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-stripe-typescript&project-name=with-stripe-typescript&repository-name=with-stripe-typescript&env=NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,STRIPE_SECRET_KEY&envDescription=Enter%20your%20Stripe%20Keys&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-stripe-typescript%23required-configuration)

## Included functionality

- Stripe Checkout
  - Custom Amount Donation with redirect to Stripe Checkout:
    - Server Component: [app/donate-with-checkout/page.tsx](app/donate-with-checkout/page.tsx)
    - Server Action: [app/actions/stripe.ts](app/actions/stripe.ts)
    - Checkout Session 'success' page fetches the Checkout Session object from Stripe: [donate-with-checkout/result/page.tsx](app/donate-with-checkout/result/page.tsx)
- Stripe Elements
  - Custom Amount Donation with Stripe Payment Element & PaymentIntents:
    - Server Component: [app/donate-with-elements/page.tsx](app/donate-with-elements/page.tsx)
    - Server Action: [app/actions/stripe.ts](app/actions/stripe.ts)
    - Payment Intent 'success' page (via `returl_url`) fetches the Payment Intent object from Stripe: [donate-with-elements/result/page.tsx](app/donate-with-elements/result/page.tsx)
- Webhook handling for [post-payment events](https://stripe.com/docs/payments/handling-payment-events)
  - Route Handler: [app/api/webhooks/route.ts](app/api/webhooks/route.ts)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-stripe-typescript with-stripe-typescript-app
```

```bash
yarn create next-app --example with-stripe-typescript with-stripe-typescript-app
```

```bash
pnpm create next-app --example with-stripe-typescript with-stripe-typescript-app
```

### Required configuration

Copy the `.env.local.example` file into a file named `.env.local` in the root directory of this project:

```bash
cp .env.local.example .env.local
```

You will need a Stripe account ([register](https://dashboard.stripe.com/register)) to run this sample. Go to the Stripe [developer dashboard](https://dashboard.stripe.com/apikeys) to find your API keys and replace them in the `.env.local` file.

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<replace-with-your-publishable-key>
STRIPE_SECRET_KEY=<replace-with-your-secret-key>
```

Now install the dependencies and start the development server.

```bash
npm install
npm run dev
# or
yarn
yarn dev
# or
pnpm install
pnpm dev
```

### Forward webhooks to your local dev server

First [install the CLI](https://stripe.com/docs/stripe-cli) and [link your Stripe account](https://stripe.com/docs/stripe-cli#link-account).

Next, start the webhook forwarding:

```bash
stripe listen --forward-to localhost:3000/api/webhooks
```

The CLI will print a webhook secret key to the console. Set `STRIPE_WEBHOOK_SECRET` to this value in your `.env.local` file.

### Setting up a live webhook endpoint

After deploying, copy the deployment URL with the webhook path (`https://your-url.vercel.app/api/webhooks`) and create a live webhook endpoint [in your Stripe dashboard](https://stripe.com/docs/webhooks/setup#configure-webhook-settings).

Once created, you can click to reveal your webhook's signing secret. Copy the webhook secret (`whsec_***`) and add it as a new environment variable in your [Vercel Dashboard](https://vercel.com/dashboard):

- Select your newly created project.
- Navigate to the Settings tab.
- In the general settings scroll to the "Environment Variables" section.

After adding an environment variable you will need to rebuild your project for it to become within your code. Within your project Dashboard, navigate to the "Deployments" tab, select the most recent deployment, click the overflow menu button (next to the "Visit" button) and select "Redeploy".

### Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-stripe-typescript&project-name=with-stripe-typescript&repository-name=with-stripe-typescript&env=NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,STRIPE_SECRET_KEY&envDescription=Enter%20your%20Stripe%20Keys&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-stripe-typescript%23required-configuration)

## Authors

- [@thorsten-stripe](https://twitter.com/thorwebdev)
- [@lfades](https://twitter.com/luis_fades)
- [@jsteele-stripe](https://twitter.com/ynnoj)
