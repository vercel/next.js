---
description: Deploy your Next.js app to production with ZEIT Now and other hosting options.
---

# Deployment

## ZEIT Now (Recommended)

The easiest way to deploy Next.js to production is using the **[ZEIT Now platform](https://zeit.co)** from the creators of Next.js. [ZEIT Now](https://zeit.co) is an all-in-one platform with global CDN that supports as static & JAMstack deployment and serverless functions.

### Getting started

If you haven’t already done so, push your Next.js app to a Git provider of your choice: [GitHub](http://github.com/), [GitLab](https://gitlab.com/), or [BitBucket](https://bitbucket.org/). Your repository can be private or public.

Then, follow these steps:

1. [Sign up to ZEIT Now](https://zeit.co/signup) (no credit card is required).
2. After signing up, you’ll be on the [“Create a new project”](https://zeit.co/new) page. Under “From your existing code”, choose the Git provider you use and set up an integration. (Instructions: [GitHub](https://zeit.co/docs/v2/git-integrations/zeit-now-for-github) / [GitLab](https://zeit.co/docs/v2/git-integrations/zeit-now-for-gitlab) / [BitBucket](https://zeit.co/docs/v2/git-integrations/zeit-now-for-bitbucket)).
3. Once that’s set up, click “New Project From …” and import your Next.js app. It auto-detects that your app is using Next.js and sets up the build configuration for you. No need to change anything—everything just works!
4. After importing, it’ll deploy your Next.js app and give you a deployment URL. Click “Visit” to see your app in production.

Congratulations! You’ve just deployed your Next.js app! If you have questions, take a look at the [ZEIT Now documentation](https://zeit.co/docs).

> If you’re using a [custom server](/docs/advanced-features/custom-server.md) (which we don’t recommend), consider [other hosting options](#other-hosting-options).

### DPS: Develop, Preview, Ship

Let’s talk about the workflow we recommend using. [ZEIT Now](https://zeit.co) supports what we call the **DPS** workflow: **D**evelop, **P**review, and **S**hip:

- **Develop:** When you work on something new, create a new Git branch and push to GitHub / GitLab / BitBucket.
- **Preview:** Every time you push changes to a branch, ZEIT Now automatically creates a new deployment with a unique URL. You can view them on GitHub when you open a pull request or under “Preview Deployments” on your project page on ZEIT Now. [Learn more about it here](https://zeit.co/features/deployment-previews).
- **Ship:** When you’re ready to ship, merge the pull request to your default branch (e.g. `master`). ZEIT Now will automatically create a production deployment.

By using the DPS workflow, instead of doing _code reviews_, your can do _deployment previews_. Each deployment creates a unique URL which can be shared or used for integration tests.

### Optimized for Next.js

[ZEIT Now](https://zeit.co) is made by the creators of Next.js. That means it has various optimizations specifically for Next.js.

For example, the [hybrid pages](/docs/basic-features/pages.md) approach is fully supported out of the box.

- Every page can either use [Static Generation](/docs/basic-features/pages.md#static-generation) or [Server-Side Rendering](/docs/basic-features/pages.md#server-side-rendering).
- Pages that use [Static Generation](/docs/basic-features/pages.md#static-generation) and assets (JS, CSS, images, fonts etc) will automatically be served from the [ZEIT Now Smart CDN](https://zeit.co/smart-cdn), which is blazingly fast.
- Pages that use [Server-Side Rendering](/docs/basic-features/pages.md#server-side-rendering) and [API routes](/docs/api-routes/introduction.md) will automatically become isolated serverless functions. This allows page rendering and API requests to scale infinitely.

### Custom Domains, Environment Variables, and more

- **Custom Domains:** Once deployed on [ZEIT Now](https://zeit.co), you can assign a custom domain to your Next.js app. Take a look at [our documentation here](https://zeit.co/docs/v2/custom-domains). Note that HTTPS is enabled by default (including custom domains) and doesn't require extra configuration.
- **Environment Variables:** You can also set environment variables on ZEIT Now. Take a look at [our documentation here](https://zeit.co/docs/v2/build-step#using-environment-variables-and-secrets). You can then [use those environment variables](/docs/api-reference/next.config.js/environment-variables.md) in your Next.js app.
- **More:** [Read our documentation](https://zeit.co/docs) to learn more about the ZEIT Now platform. You can deploy non-Next.js apps to ZEIT Now as well—[check out our how-to guides](https://zeit.co/guides).

## Other hosting options

### Node.js Server

Next.js can be deployed to any hosting provider that supports Node.js. This is the approach you should take if you’re using a [custom server](/docs/advanced-features/custom-server.md).

Make sure your `package.json` has `build` and `start` scripts:

```json
{
  "scripts": {
    "dev": "next",
    "build": "next build",
    "start": "next start"
  }
}
```

`build` builds the production application in the `.next` folder. After building, `start` starts a Node.js server that supports [hybrid pages](/docs/basic-features/pages.md), serving both statically generated and server-side rendered pages.

>

### Static HTML Export

If you’d like to do a static HTML export of your Next.js app, follow the directions on [our documentation](/docs/advanced-features/static-html-export.md). By default, `next export` will generate an `out` directory, which can be served by any static site server.

> We strongly recommend using [ZEIT Now](https://zeit.co/) even if your Next.js app is fully static. [ZEIT Now](https://zeit.co/) is optimized to make static Next.js apps blazingly fast.
>
> **Note:** If you use [ZEIT Now](https://zeit.co/), you don’t need to use `next export`. It’ll automatically serve all pages from the [ZEIT Now Smart CDN](https://zeit.co/smart-cdn).
