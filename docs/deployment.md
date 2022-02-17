---
description: Learn how to deploy your Next.js app to production, either managed or self-hosted.
---

# Deployment

Congratulations, you are ready to deploy your Next.js application to production. This document will show how to deploy either managed or self-hosted using the [Next.js Build API](#nextjs-build-api).

## Next.js Build API

`next build` generates an optimized version of your application for production. This standard output includes:

- HTML files for pages using `getStaticProps` or [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md)
- CSS files for global styles or for individually scoped styles
- JavaScript for pre-rendering dynamic content from the Next.js server
- JavaScript for interactivity on the client-side through React

This output is generated inside the `.next` folder:

- `.next/static/chunks/pages` – Each JavaScript file inside this folder relates to the route with the same name. For example, `.next/static/chunks/pages/about.js` would be the JavaScript file loaded when viewing the `/about` route in your application
- `.next/static/media` – Statically imported images from `next/image` are hashed and copied here
- `.next/static/css` – Global CSS files for all pages in your application
- `.next/server/pages` – The HTML and JavaScript entry points prerendered from the server. The `.nft.json` files are created when [Output File Tracing](/docs/advanced-features/output-file-tracing.md) is enabled and contain all the file paths that depend on a given page.
- `.next/server/chunks` – Shared JavaScript chunks used in multiple places throughout your application
- `.next/cache` – Output for the build cache and cached images, responses, and pages from the Next.js server. Using a cache helps decrease build times and improve performance of loading images

All JavaScript code inside `.next` has been **compiled** and browser bundles have been **minified** to help achieve the best performance and support [all modern browsers](/docs/basic-features/supported-browsers-features.md).

## Managed Next.js with Vercel

[Vercel](https://vercel.com/) is a frontend cloud platform from the creators of Next.js. It's the fastest way to deploy your managed Next.js application with zero configuration.

When deploying to Vercel, the platform automatically detects Next.js, runs `next build`, and optimizes the build output for you, including:

- Persisting cached assets across deployments if unchanged
- [Immutable deployments](https://vercel.com/features/previews) with a unique URL for every commit
- [Pages](/docs/basic-features/pages.md) are automatically statically optimized, if possible
- Assets (JavaScript, CSS, images, fonts) are compressed and served from a [Global Edge Network](https://vercel.com/features/infrastructure)
- [API Routes](/docs/api-routes/introduction.md) are automatically optimized as isolated [Serverless Functions](https://vercel.com/features/infrastructure) that can scale infinitely
- [Middleware](/docs/middleware.md) are automatically optimized as [Edge Functions](https://vercel.com/features/edge-functions) that have zero cold starts and boot instantly

In addition, Vercel provides features like:

- Automatic performance monitoring with [Next.js Analytics](https://vercel.com/analytics)
- Automatic HTTPS and SSL certificates
- Automatic CI/CD (through GitHub, GitLab, Bitbucket, etc.)
- Support for [Environment Variables](https://vercel.com/docs/environment-variables)
- Support for [Custom Domains](https://vercel.com/docs/custom-domains)
- Support for [Image Optimization](/docs/basic-features/image-optimization.md) with `next/image`
- Instant global deployments via `git push`

You can start using Vercel (for free) through a personal hobby account, or create a team to start the next big thing. Learn more about [Next.js on Vercel](https://vercel.com/solutions/nextjs) or read the [Vercel Documentation](https://vercel.com/docs).

[![Deploy with Vercel]([https://vercel.com/button](https://vercel.com/button))](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/hello-world&project-name=hello-world&repository-name=hello-world&utm_source=github.com&utm_medium=referral&utm_campaign=deployment)

## Managed Next.js with Firebase

[Firebase](https://firebase.google.com/) is a hosting platform from Google for mobile and web applications and microservices.

To deploy your Next.js site to Firebase:

1. Go to https://console.firebase.google.com/

2. Create a new project

3. Install the Firebase CLI using the command: `npm install -g firebase-tools`

4. Log in to your account via the CLI with `firebase login`

5. In your project directory, initiate Firebase: `firebase init`

6. Select Firebase Hosting and select `out` as the build folder to deploy

7. Define your build commands in the "scripts" property of your `package.json` file

```json
"build": "next build && next export"
```

8. Run your build command: `npm run build`

9. Deploy your generated site to Firebase:  `firebase deploy — only hosting`

## Managed Next.js  with DigitalOcean App Platform

### As a static site

To deploy Next.js as a static site to App platform, follow these steps:

1. Create an `npm run export` script to run `next build` and `next export`  consecutively in package.json like so:

```json
"scripts": {
    "export": "npm run build && next export -o _static"
},
// This will create a _static folder for Digital ocean with all your project files
```

1. Add the `_static` folder to .gitignore
2. Push the project to Github
3. Log into your DigitalOcean [App Platform Dashboard](https://cloud.digitalocean.com/apps) and create a new app by clicking the **Create New App** button.
4. Select the GitHub repository that contains your app and click **Next**
5. Select a preferred region
6. Select your preferred Git branch and choose the option to Autodeploy code changes
7. Change Node.js type to Static Site
8. Change build command to `npm run export` 
9. Select starter plan and click **Launch Starter App** to deploy your Next.js app

## Managed Next.js with Netlify

[Netlify](https://www.netlify.com/) is a cloud platform for building, deploying and scaling web projects.

When you link a repository for a new site, Netlify detects the framework your project is using. If your project uses Next.js, Netlify automatically installs the [[Essential Next.js build plugin](https://docs.netlify.com/configure-builds/common-configurations/next-js/#essential-next-js-build-plugin)]([https://docs.netlify.com/configure-builds/common-configurations/next-js/#essential-next-js-build-plugin](https://docs.netlify.com/configure-builds/common-configurations/next-js/#essential-next-js-build-plugin)) and provides [[suggested configuration values](https://docs.netlify.com/configure-builds/common-configurations/next-js/#suggested-configuration-values)](https://docs.netlify.com/configure-builds/common-configurations/next-js/#suggested-configuration-values). 

For existing sites already linked to Netlify, you can choose to [[install](http://app.netlify.com/plugins/@netlify/plugin-nextjs/install)](https://app.netlify.com/teams/danaiszuul/plugins/@netlify/plugin-nextjs/install) the plugin yourself.

You can start using Netlify (for free) through a personal hobby account. Learn more about [Next.js on Netlify](https://docs.netlify.com/configure-builds/common-configurations/next-js/) or read the [Netlify Documentation](https://docs.netlify.com/).

[![Deploy to Netlify]([https://www.netlify.com/img/deploy/button.svg](https://www.netlify.com/img/deploy/button.svg))]([https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/next](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/next)-netlify-starter)

## Managed Next.js with Render

[Render](https://render.com/) is a unified cloud provider to build and run apps and websites.

You can deploy a Next.js application on Render in just a few clicks.

1.  Fork [nextjs-hello-world](https://github.com/render-examples/nextjs-hello-world/tree/master) on GitHub.

2.  Create a new **Web Service** on Render, and give Render permission to access your new repo.

3.  Use the following values during creation:

- **Environment**:  `Node`

- **Build Command**:  `yarn` OR `yarn build`

- **Start Command**:  `yarn start`

Your website will be live on your Render URL as soon as the build finishes.

## Self-Hosting

You can self-host Next.js with support for all features using Node.js or Docker. You can also do a Static HTML Export, which [has some limitations](/docs/advanced-features/static-html-export.md).

### Node.js Server

Next.js can be deployed to any hosting provider that supports Node.js. For example, [AWS EC2](https://aws.amazon.com/ec2/) or a [DigitalOcean Droplet](https://www.digitalocean.com/products/droplets/).

First, ensure your `package.json` has the `"build"` and `"start"` scripts:

```json
{

	"scripts": {
	
	"dev": "next dev",
	
	"build": "next build",
	
	"start": "next start"
	
	}

}
```

Then, run `next build` to build your application. Finally, run `next start` to start the Node.js server. This server supports all features of Next.js.

> If you are using [`next/image`](/docs/basic-features/image-optimization.md), consider adding `sharp` for more performant [Image Optimization](/docs/basic-features/image-optimization.md) in your production environment by running `npm install sharp` in your project directory. On Linux platforms, `sharp` may require [additional configuration](https://sharp.pixelplumbing.com/install#linux-memory-allocator) to prevent excessive memory usage.
> 

## Docker Image

Next.js can be deployed to any hosting provider that supports [Docker](https://www.docker.com/) containers. You can use this approach when deploying to container orchestrators such as [Kubernetes](https://kubernetes.io/) or [HashiCorp Nomad](https://www.nomadproject.io/), or when running inside a single node in any cloud provider.

1. [Install Docker](https://docs.docker.com/get-docker/) on your machine

1. Clone the [with-docker](https://github.com/vercel/next.js/tree/canary/examples/with-docker) example

1. Build your container: `docker build -t nextjs-docker .`

1. Run your container: `docker run -p 3000:3000 nextjs-docker`

### Static HTML Export

If you’d like to do a static HTML export of your Next.js app, follow the directions on our [Static HTML Export documentation](/docs/advanced-features/static-html-export.md).

### Automatic Updates

When you deploy your Next.js application, you want to see the latest version without needing to reload.

Next.js will automatically load the latest version of your application in the background when routing. For client-side navigations, `next/link` will temporarily function as a normal `<a>` tag.

**Note:** If a new page (with an old version) has already been prefetched by `next/link`, Next.js will use the old version. Navigating to a page that has _not_ been prefetched (and is not cached at the CDN level) will load the latest version.

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/going-to-production.md">
    <b>Going to Production:</b>
    <small>Ensure the best performance and user experience.</small>
  </a>
</div>
