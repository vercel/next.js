---
title: Deploying
description: Learn how to deploy your Next.js app to production, either managed or self-hosted.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

Congratulations! You're here because you are ready to deploy your Next.js application. This page will show how to deploy either managed or self-hosted using the [Next.js Build API](#nextjs-build-api).

## Next.js Build API

`next build` generates an optimized version of your application for production. This standard output includes:

- HTML files for pages using `getStaticProps` or [Automatic Static Optimization](/docs/pages/building-your-application/rendering/automatic-static-optimization)
- CSS files for global styles or for individually scoped styles
- JavaScript for pre-rendering dynamic content from the Next.js server
- JavaScript for interactivity on the client-side through React

This output is generated inside the `.next` folder:

- `.next/static/chunks/pages` – Each JavaScript file inside this folder relates to the route with the same name. For example, `.next/static/chunks/pages/about.js` would be the JavaScript file loaded when viewing the `/about` route in your application
- `.next/static/media` – Statically imported images from `next/image` are hashed and copied here
- `.next/static/css` – Global CSS files for all pages in your application
- `.next/server/pages` – The HTML and JavaScript entry points prerendered from the server. The `.nft.json` files are created when [Output File Tracing](/docs/pages/api-reference/next-config-js/output) is enabled and contain all the file paths that depend on a given page.
- `.next/server/chunks` – Shared JavaScript chunks used in multiple places throughout your application
- `.next/cache` – Output for the build cache and cached images, responses, and pages from the Next.js server. Using a cache helps decrease build times and improve performance of loading images

All JavaScript code inside `.next` has been **compiled** and browser bundles have been **minified** to help achieve the best performance and support [all modern browsers](/docs/architecture/supported-browsers).

## Managed Next.js with Vercel

[Vercel](https://vercel.com?utm_source=next-site&utm_medium=docs&utm_campaign=next-website) is the fastest way to deploy your Next.js application with zero configuration.

When deploying to Vercel, the platform [automatically detects Next.js](https://vercel.com/solutions/nextjs?utm_source=next-site&utm_medium=docs&utm_campaign=next-website), runs `next build`, and optimizes the build output for you, including:

- Persisting cached assets across deployments if unchanged
- [Immutable deployments](https://vercel.com/features/previews?utm_source=next-site&utm_medium=docs&utm_campaign=next-website) with a unique URL for every commit
- [Pages](/docs/pages/building-your-application/rendering/automatic-static-optimization) are automatically statically optimized, if possible
- Assets (JavaScript, CSS, images, fonts) are compressed and served from a [Global Edge Network](https://vercel.com/features/infrastructure?utm_source=next-site&utm_medium=docs&utm_campaign=next-website)
- [API Routes](/docs/pages/building-your-application/routing/api-routes) are automatically optimized as isolated [Serverless Functions](https://vercel.com/features/infrastructure?utm_source=next-site&utm_medium=docs&utm_campaign=next-website) that can scale infinitely
- [Middleware](/docs/pages/building-your-application/routing/middleware) is automatically optimized as [Edge Functions](https://vercel.com/features/edge-functions?utm_source=next-site&utm_medium=docs&utm_campaign=next-website) that have zero cold starts and boot instantly

In addition, Vercel provides features like:

- Automatic performance monitoring with [Next.js Speed Insights](https://vercel.com/analytics?utm_source=next-site&utm_medium=docs&utm_campaign=next-website)
- Automatic HTTPS and SSL certificates
- Automatic CI/CD (through GitHub, GitLab, Bitbucket, etc.)
- Support for [Environment Variables](https://vercel.com/docs/environment-variables?utm_source=next-site&utm_medium=docs&utm_campaign=next-website)
- Support for [Custom Domains](https://vercel.com/docs/custom-domains?utm_source=next-site&utm_medium=docs&utm_campaign=next-website)
- Support for [Image Optimization](/docs/pages/building-your-application/optimizing/images) with `next/image`
- Instant global deployments via `git push`

[Deploy a Next.js application to Vercel](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/hello-world&project-name=hello-world&repository-name=hello-world&utm_source=next-site&utm_medium=docs&utm_campaign=next-website) for free to try it out.

## Self-Hosting

You can self-host Next.js with support for all features using Node.js or Docker. You can also do a Static HTML Export, which [has some limitations](/docs/app/building-your-application/deploying/static-exports).

### Node.js Server

Next.js can be deployed to any hosting provider that supports Node.js. For example, [AWS EC2](https://aws.amazon.com/ec2/) or a [DigitalOcean Droplet](https://www.digitalocean.com/products/droplets/).

First, ensure your `package.json` has the `"build"` and `"start"` scripts:

```json filename="package.json"
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

Then, run `npm run build` to build your application. Finally, run `npm run start` to start the Node.js server. This server supports all features of Next.js.

> If you are using [`next/image`](/docs/pages/building-your-application/optimizing/images), consider adding `sharp` for more performant [Image Optimization](/docs/pages/building-your-application/optimizing/images) in your production environment by running `npm install sharp` in your project directory. On Linux platforms, `sharp` may require [additional configuration](https://sharp.pixelplumbing.com/install#linux-memory-allocator) to prevent excessive memory usage.

### Docker Image

Next.js can be deployed to any hosting provider that supports [Docker](https://www.docker.com/) containers. You can use this approach when deploying to container orchestrators such as [Kubernetes](https://kubernetes.io/) or [HashiCorp Nomad](https://www.nomadproject.io/), or when running inside a single node in any cloud provider.

1. [Install Docker](https://docs.docker.com/get-docker/) on your machine
1. Clone the [with-docker](https://github.com/vercel/next.js/tree/canary/examples/with-docker) example
1. Build your container: `docker build -t nextjs-docker .`
1. Run your container: `docker run -p 3000:3000 nextjs-docker`

If you need to use different Environment Variables across multiple environments, check out our [with-docker-multi-env](https://github.com/vercel/next.js/tree/canary/examples/with-docker-multi-env) example.

### Static HTML Export

If you’d like to do a static HTML export of your Next.js app, follow the directions on our [Static HTML Export documentation](/docs/app/building-your-application/deploying/static-exports).

## Other Services

The following services support Next.js `v12+`. Below, you’ll find examples or guides to deploy Next.js to each service.

### Managed Server

- [AWS Copilot](https://aws.github.io/copilot-cli/)
- [Digital Ocean App Platform](https://docs.digitalocean.com/tutorials/app-nextjs-deploy/)
- [Google Cloud Run](https://github.com/vercel/next.js/tree/canary/examples/with-docker)
- [Heroku](https://elements.heroku.com/buildpacks/mars/heroku-nextjs)
- [Railway](https://docs.railway.app/getting-started)
- [Render](https://render.com/docs/deploy-nextjs-app)

> **Good to know**: There are also managed platforms that allow you to use a Dockerfile as shown in the [example above](#docker-image).

### Static Only

The following services only support deploying Next.js using [`output: 'export'`](/docs/app/building-your-application/deploying/static-exports).

- [GitHub Pages](https://github.com/vercel/next.js/tree/canary/examples/github-pages)

You can also manually deploy the output from [`output: 'export'`](/docs/app/building-your-application/deploying/static-exports) to any static hosting provider, often through your CI/CD pipeline like GitHub Actions, Jenkins, AWS CodeBuild, Circle CI, Azure Pipelines, and more.

### Serverless

- [AWS Amplify](https://aws.amazon.com/blogs/mobile/amplify-next-js-13/)
- [Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/nextjs)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-nextjs-site/)
- [Firebase](https://firebase.google.com/docs/hosting/nextjs)
- [Netlify](https://docs.netlify.com/integrations/frameworks/next-js)
- [Terraform](https://github.com/milliHQ/terraform-aws-next-js)
- [SST](https://docs.sst.dev/start/nextjs)

> **Good to know**: Not all serverless providers implement the [Next.js Build API](#nextjs-build-api) from `next start`. Please check with the provider to see what features are supported.

## Automatic Updates

When you deploy your Next.js application, you want to see the latest version without needing to reload.

Next.js will automatically load the latest version of your application in the background when routing. For client-side navigations, `next/link` will temporarily function as a normal `<a>` tag.

> **Good to know**: If a new page (with an old version) has already been prefetched by `next/link`, Next.js will use the old version. Navigating to a page that has _not_ been prefetched (and is not cached at the CDN level) will load the latest version.

## Manual Graceful shutdowns

When self-hosting, you might want to run code when the server shuts down on `SIGTERM` or `SIGINT` signals.

You can set the env variable `NEXT_MANUAL_SIG_HANDLE` to `true` and then register a handler for that signal inside your `_document.js` file. You will need to register the env variable directly in the `package.json` script, not in the `.env` file.

> **Good to know**: Manual signal handling is not available in `next dev`.

```json filename="package.json"
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "NEXT_MANUAL_SIG_HANDLE=true next start"
  }
}
```

```js filename="pages/_document.js"
if (process.env.NEXT_MANUAL_SIG_HANDLE) {
  // this should be added in your custom _document
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM: ', 'cleaning up')
    process.exit(0)
  })

  process.on('SIGINT', () => {
    console.log('Received SIGINT: ', 'cleaning up')
    process.exit(0)
  })
}
```
