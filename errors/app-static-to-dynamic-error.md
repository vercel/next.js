# &#x60;app/&#x60; Static to Dynamic Error

#### Why This Error Occurred

Inside of one of your `app/` pages, the page was initially generated statically at build time and then during runtime either a fallback path or path being revalidated attempted to leverage dynamic server values e.g. `cookies()` or `headers()`.

This is a hard error by default as a path generated statically can't switch between types during runtime currently.

#### Possible Ways to Fix It

Prevent usage of these dynamic server values conditionally which can cause the static/dynamic mode of the page to differ between build time and runtime.

Leverage `export const dynamic = 'force-static'` to ensure the page is handled statically regardless of the usage of dynamic server values. Alternatively if you prefer your page to allows be dynamic you can set `export const dynamic = 'force-dynamic'` and it won't attempt to have the page be statically generated.

### Useful Links

- [static/dynamic rendering](https://beta.nextjs.org/docs/rendering/static-and-dynamic-rendering)
- [dynamic server value methods](https://beta.nextjs.org/docs/data-fetching/fetching#server-component-functions)
