# Automatic Static Optimization

Next.js automatically determines that a page is static (can be prerendered) if it has no blocking data requirements. This determination is made by the absence of `getInitialProps` in the page.

This feature allows Next.js to emit hybrid applications that contain **both server-rendered and statically generated pages**.

> Statically generated pages are still reactive: Next.js will hydrate your application client-side to give it full interactivity.

One of the main benefits this feature is that optimized pages require no server-side computation, and can be instantly streamed to the end-user from multiple CDN locations. The result is an _ultra fast_ loading experience for your users.

## How it works

If `getInitialProps` is present, Next.js will use its default behavior and render the page on-demand, per-request (meaning Server-Side Rendering).

If `getInitialProps` is absent, Next.js will **statically optimize** your page automatically by prerendering the page to static HTML. During prerendering, the router's `query` object will be empty since we do not have `query` information to provide during this phase. Any `query` values will be populated client-side after hydration.

`next build` will emit `.html` files for statically optimized pages. For example, the result for the page `pages/about.js` would be:

```bash
.next/server/static/${BUILD_ID}/about.html
```

And if you add `getInitialProps` to the page, it will then be JavaScript, like so:

```bash
.next/server/static/${BUILD_ID}/about.js
```

In development you'll know if `pages/about.js` is optimized or not thanks to the included [static optimization indicator](https://www.notion.so/zeithq/Static-Optimization-Indicator-82769ca8b46d4d95b95046f19aad21da).

## Caveats

- If you have a [custom `<App>`](https://www.notion.so/zeithq/Custom-App-ee9e71d6b13848f1b58ae97b6690508a) with `getInitialProps` then this optimization will be disabled for all pages.
- If you have a [custom `<Document>`](https://www.notion.so/zeithq/Custom-Document-b9ece843914443519c952a53ecc4d389) with `getInitialProps` be sure you check if `ctx.req` is defined before assuming the page is server-side rendered. `ctx.req` will be `undefined` for pages that are prerendered.
