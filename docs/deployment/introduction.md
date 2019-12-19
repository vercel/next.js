# Deployment

To go to production Next.js has a `next build` command. When ran it will compile your project and automatically apply numerous optimizations.

## ZEIT Now

The easiest way to deploy Next.js to production is using the [ZEIT Now hosting platform](https://zeit.co) from the creators of Next.js.

### Staging

ZEIT Now integrates directly with GitHub, GitLab, and Bitbucket to give you a unique shareable url for every commit and every pull request. This url can be shared with customers and can be used to run integration tests against.

### Hybrid Next.js

The [hybrid pages](/docs/basic-features/pages.md) approach is fully supported out of the box. Meaning that every page can either use Static Generation or Server-Side Rendering.

In case of Static Generation the page will automatically be served from the ZEIT Now Smart CDN.

When the page is using Server-Side rendering it will become an isolated serverless function automatically. This allows the page rendering to scale automatically and be independent, errors on one page won't affect another.

API routes will also become separate serverless functions that execute and scale separately from eachother.

### CDN + HTTPS by default

Assets (JavaScript, CSS, images, fonts etc) and Statically Generated pages are automatically served through the ZEIT Now Smart CDN, ensuring these are always served close to your users.

HTTPS is enabled by default and doesn't require extra configuration.
