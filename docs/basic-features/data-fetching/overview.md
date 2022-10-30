---
description: 'Next.js allows you to fetch data in multiple ways, with pre-rendering, server-side rendering or static-site generation, and incremental static regeneration. Learn how to manage your application data in Next.js.'
---

# Data Fetching Overview

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-wordpress">WordPress Example</a> (<a href="https://next-blog-wordpress.vercel.app">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/blog-starter">Blog Starter using markdown files</a> (<a href="https://next-blog-starter.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-datocms">DatoCMS Example</a> (<a href="https://next-blog-datocms.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-takeshape">TakeShape Example</a> (<a href="https://next-blog-takeshape.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-sanity">Sanity Example</a> (<a href="https://next-blog-sanity.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-prismic">Prismic Example</a> (<a href="https://next-blog-prismic.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-contentful">Contentful Example</a> (<a href="https://next-blog-contentful.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-strapi">Strapi Example</a> (<a href="https://next-blog-strapi.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-prepr">Prepr Example</a> (<a href="https://next-blog-prepr.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-agilitycms">Agility CMS Example</a> (<a href="https://next-blog-agilitycms.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-cosmic">Cosmic Example</a> (<a href="https://next-blog-cosmic.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-buttercms">ButterCMS Example</a> (<a href="https://next-blog-buttercms.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-storyblok">Storyblok Example</a> (<a href="https://next-blog-storyblok.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-graphcms">GraphCMS Example</a> (<a href="https://next-blog-graphcms.vercel.app/">Demo</a>)</li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-kontent">Kontent Example</a> (<a href="https://next-blog-kontent.vercel.app/">Demo</a>)</li>
    <li><a href="https://static-tweet.vercel.app/">Static Tweet Demo</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/cms-enterspeed">Enterspeed Example</a> (<a href="https://next-blog-demo.enterspeed.com/">Demo</a>)</li>
  </ul>
</details>

> **Note**: Next.js 13 introduces the `app/` directory (beta). This new directory has support for [colocated data fetching](https://beta.nextjs.org/docs/data-fetching/fundamentals) at the component level, using the new React `use` hook and an extended `fetch` Web API.
>
> [Learn more about incrementally adopting `app/`](https://beta.nextjs.org/docs/upgrade-guide).

Data fetching in Next.js allows you to render your content in different ways, depending on your application's use case. These include pre-rendering with **Server-side Rendering** or **Static Generation**, and updating or creating content at runtime with **Incremental Static Regeneration**.

<div class="card">
  <a href="/docs/basic-features/data-fetching/get-server-side-props.md">
    <b>SSR: Server-side rendering</b>
    <small>Learn more about server-side rendering in Next.js with getServerSideProps.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/data-fetching/get-static-props.md">
    <b>SSG: Static-site generation</b>
    <small>Learn more about static site generation in Next.js with getStaticProps.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/data-fetching/client-side.md">
    <b>CSR: Client-side rendering</b>
    <small>Learn more about client side rendering in Next.js with SWR.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/data-fetching/get-static-paths.md">
    <b>Dynamic routing</b>
    <small>Learn more about dynamic routing in Next.js with getStaticPaths.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/data-fetching/incremental-static-regeneration.md">
    <b>ISR: Incremental Static Regeneration</b>
    <small>Learn more about Incremental Static Regeneration in Next.js.</small>
  </a>
</div>

## Learn more

<div class="card">
  <a href="/docs/advanced-features/preview-mode.md">
    <b>Preview Mode:</b>
    <small>Learn more about the preview mode in Next.js.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/routing/introduction.md">
    <b>Routing:</b>
    <small>Learn more about routing in Next.js.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/typescript.md#pages">
    <b>TypeScript:</b>
    <small>Add TypeScript to your pages.</small>
  </a>
</div>
