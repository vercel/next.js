<h1 align="center">Next.js and Neon Starter Kit</h1>

<p align="center">
 The fastest way to build apps with Next.js and Neon
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#deploy-to-vercel"><strong>Deploy to Vercel</strong></a> ·
  <a href="#clone-and-run-locally"><strong>Clone and run locally</strong></a> ·
  <a href="#how-it-works"><strong>How it works</strong></a> ·
  <a href="#feedback-and-issues"><strong>Feedback and issues</strong></a> ·
  <a href="#more-neon-examples"><strong>More Examples</strong></a>
</p>
<br/>

## Features

- Works across the entire [Next.js](https://nextjs.org) stack
  - App Router
  - Proxy
  - Client
  - Server
  - It just works!
- [Neon Auth](https://neon.com/docs/auth/overview) with `@neondatabase/auth`, which keeps the session in HTTP-only cookies on your own domain
  - Email and password sign up, sign in, sign out and password reset
  - Users and sessions live in the `neon_auth` schema of your Neon database, so they branch with your data
- [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver) (`@neondatabase/serverless`) to query Postgres over HTTP from Server Components, Server Actions and Route Handlers
- Styling with [Tailwind CSS](https://tailwindcss.com)
- Components with [shadcn/ui](https://ui.shadcn.com/)
- Optional deployment with the [Neon Vercel integration and Vercel deploy](#deploy-to-vercel)

## Deploy to Vercel

Vercel deployment will guide you through creating a Neon account and project with the [Neon integration](https://vercel.com/marketplace/neon), which sets `DATABASE_URL` on your Vercel project. You'll also be asked for `NEON_AUTH_COOKIE_SECRET`, which you can generate with `openssl rand -base64 32`.

After the first deployment, open the project in the Neon Console, go to **Auth**, and click **Enable Auth**. The integration then adds `NEON_AUTH_BASE_URL` to your Vercel project. Redeploy to pick it up, and add your deployment URLs as [trusted domains](https://neon.com/docs/auth/guides/configure-domains).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-neon&project-name=nextjs-with-neon&repository-name=nextjs-with-neon&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22neon%22%2C%22integrationSlug%22%3A%22neon%22%7D%5D&env=NEON_AUTH_COOKIE_SECRET&envDescription=A+random+secret+of+at+least+32+characters+that+signs+the+session+cookie.+Generate+one+with%3A+openssl+rand+-base64+32&envLink=https%3A%2F%2Fneon.com%2Fdocs%2Fauth%2Freference%2Fnextjs-server%23environment-variables&demo-title=nextjs-with-neon&demo-description=This+starter+configures+Neon+Auth+to+use+cookies%2C+making+the+user%27s+session+available+throughout+the+entire+Next.js+app+-+Client+Components%2C+Server+Components%2C+Route+Handlers%2C+Server+Actions+and+Proxy.&external-id=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-neon)

The above will also clone the Starter kit to your GitHub, you can clone that locally and develop locally.

If you wish to just develop locally and not deploy to Vercel, [follow the steps below](#clone-and-run-locally).

## Clone and run locally

1. You'll first need a Neon project which can be made [via the Neon Console](https://pg.new). In the project, open the **Auth** page and click **Enable Auth**.

2. Create a Next.js app using the Neon Starter template npx command

   ```bash
   npx create-next-app --example with-neon with-neon-app
   ```

   ```bash
   yarn create next-app --example with-neon with-neon-app
   ```

   ```bash
   pnpm create next-app --example with-neon with-neon-app
   ```

3. Use `cd` to change into the app's directory

   ```bash
   cd with-neon-app
   ```

4. Rename `.env.example` to `.env.local` and update the following:

```env
DATABASE_URL=[INSERT NEON CONNECTION STRING]
NEON_AUTH_BASE_URL=[INSERT NEON AUTH URL]
NEON_AUTH_COOKIE_SECRET=[INSERT A RANDOM SECRET OF AT LEAST 32 CHARACTERS]
```

`DATABASE_URL` is in your project's **Connect** dialog, and `NEON_AUTH_BASE_URL` is under **Auth > Configuration** in the [Neon Console](https://console.neon.tech). Generate `NEON_AUTH_COOKIE_SECRET` with `openssl rand -base64 32`. It's also needed when you run `next build`, because the auth instance validates it on startup.

5. You can now run the Next.js local development server:

   ```bash
   npm run dev
   ```

   The starter kit should now be running on [localhost:3000](http://localhost:3000/).

6. This template comes with the default shadcn/ui style initialized. If you instead want other ui.shadcn styles, delete `components.json` and [re-install shadcn/ui](https://ui.shadcn.com/docs/installation/next)

> Check out [Neon branching](https://neon.com/docs/introduction/branching) to give every developer and preview deployment its own copy of the database and its users.

## How it works

| File                              | Purpose                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `lib/auth/server.ts`              | `createNeonAuth()` instance for Server Components, Server Actions, Route Handlers and the proxy       |
| `lib/auth/client.ts`              | `createAuthClient()` for the sign in, sign up, sign out and password reset forms in Client Components |
| `app/api/auth/[...path]/route.ts` | Proxies auth requests to Neon Auth so session cookies are set on your domain                          |
| `proxy.ts`                        | Validates and refreshes the session, and redirects signed-out users away from `/protected`            |
| `lib/db.ts`                       | `neon()` SQL client from the serverless driver                                                        |

## Feedback and issues

Please file feedback and issues over on the [neon-js repository](https://github.com/neondatabase/neon-js/issues).

## More Neon examples

- [Neon Auth examples](https://github.com/neondatabase/neon-js/tree/main/examples)
- [Neon Auth Next.js quickstart](https://neon.com/docs/auth/quick-start/nextjs-api-only)
- [Connect a Next.js application to Neon](https://neon.com/docs/guides/nextjs)
