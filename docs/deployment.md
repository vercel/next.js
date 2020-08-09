---
description: Deploy your Next.js app to production with Vercel and other hosting options.
---

# Deployment

## Vercel (Recommended)

The easiest way to deploy Next.js to production is to use the **[Vercel platform](https://vercel.com)** from the creators of Next.js. [Vercel](https://vercel.com) is an all-in-one platform with Global CDN supporting static & Jamstack deployment and Serverless Functions.

### Getting started

If you haven’t already done so, push your Next.js app to a Git provider of your choice: [GitHub](http://github.com/), [GitLab](https://gitlab.com/), or [BitBucket](https://bitbucket.org/). Your repository can be private or public.

Then, follow these steps:

1. [Sign up to Vercel](https://vercel.com/signup) (no credit card is required).
2. After signing up, you’ll arrive on the [“Import Project”](https://vercel.com/import) page. Under “From Git Repository”, choose the Git provider you use and set up an integration. (Instructions: [GitHub](https://vercel.com/docs/v2/git-integrations/vercel-for-github) / [GitLab](https://vercel.com/docs/v2/git-integrations/vercel-for-gitlab) / [BitBucket](https://vercel.com/docs/v2/git-integrations/vercel-for-bitbucket)).
3. Once that’s set up, click “Import Project From …” and import your Next.js app. It auto-detects that your app is using Next.js and sets up the build configuration for you. No need to change anything — everything should work just fine!
4. After importing, it’ll deploy your Next.js app and provide you with a deployment URL. Click “Visit” to see your app in production.

Congratulations! You’ve just deployed your Next.js app! If you have questions, take a look at the [Vercel documentation](https://vercel.com/docs).

> If you’re using a [custom server](/docs/advanced-features/custom-server.md), we strongly recommend migrating away from it (for example, by using [dynamic routing](/docs/routing/dynamic-routes.md)). If you cannot migrate, consider [other hosting options](#other-hosting-options).

### DPS: Develop, Preview, Ship

Let’s talk about the workflow we recommend using. [Vercel](https://vercel.com) supports what we call the **DPS** workflow: **D**evelop, **P**review, and **S**hip:

- **Develop:** Write code in Next.js. Keep the development server running and take advantage of [React Fast Refresh](https://nextjs.org/blog/next-9-4#fast-refresh).
- **Preview:** Every time you push changes to a branch on GitHub / GitLab / BitBucket, Vercel automatically creates a new deployment with a unique URL. You can view them on GitHub when you open a pull request, or under “Preview Deployments” on your project page on Vercel. [Learn more about it here](https://vercel.com/features/deployment-previews).
- **Ship:** When you’re ready to ship, merge the pull request to your default branch (e.g. `master`). Vercel will automatically create a production deployment.

By using the DPS workflow, in addition to doing _code reviews_, you can do _deployment previews_. Each deployment creates a unique URL that can be shared or used for integration tests.

### Optimized for Next.js

[Vercel](https://vercel.com) is made by the creators of Next.js and has first-class support for Next.js.

For example, the [hybrid pages](/docs/basic-features/pages.md) approach is fully supported out of the box.

- Every page can either use [Static Generation](/docs/basic-features/pages.md#static-generation) or [Server-Side Rendering](/docs/basic-features/pages.md#server-side-rendering).
- Pages that use [Static Generation](/docs/basic-features/pages.md#static-generation) and assets (JS, CSS, images, fonts, etc) will automatically be served from the [Vercel's Edge Network](https://vercel.com/docs/v2/edge-network/overview), which is blazingly fast.
- Pages that use [Server-Side Rendering](/docs/basic-features/pages.md#server-side-rendering) and [API routes](/docs/api-routes/introduction.md) will automatically become isolated Serverless Functions. This allows page rendering and API requests to scale infinitely.

### Custom Domains, Environment Variables, Automatic HTTPS, and more

- **Custom Domains:** Once deployed on [Vercel](https://vercel.com), you can assign a custom domain to your Next.js app. Take a look at [our documentation here](https://vercel.com/docs/v2/custom-domains).
- **Environment Variables:** You can also set environment variables on Vercel. Take a look at [our documentation here](https://vercel.com/docs/v2/build-step#using-environment-variables-and-secrets). You can then [use those environment variables](/docs/api-reference/next.config.js/environment-variables.md) in your Next.js app.
- **Automatic HTTPS:** HTTPS is enabled by default (including custom domains) and doesn't require extra configuration. We auto-renew SSL certificates.
- **More:** [Read our documentation](https://vercel.com/docs) to learn more about the Vercel platform.

## Other hosting options

### Node.js Server

Next.js can be deployed to any hosting provider that supports Node.js. This is the approach you should take if you’re using a [custom server](/docs/advanced-features/custom-server.md).

Make sure your `package.json` has the `"build"` and `"start"` scripts:

```json
{
  "scripts": {
    "dev": "next",
    "build": "next build",
    "start": "next start"
  }
}
```

`next build` builds the production application in the `.next` folder. After building, `next start` starts a Node.js server that supports [hybrid pages](/docs/basic-features/pages.md), serving both statically generated and server-side rendered pages.

### Static HTML Export

If you’d like to do a static HTML export of your Next.js app, follow the directions on [our documentation](/docs/advanced-features/static-html-export.md). By default, `next export` will generate an `out` directory, which can be served by any static hosting service or CDN.

> We strongly recommend using [Vercel](https://vercel.com/) even if your Next.js app is fully static. [Vercel](https://vercel.com/) is optimized to make static Next.js apps blazingly fast. `next export` works with Zero Config deployments on Vercel.
