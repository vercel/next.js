# Rewriting to Auto Export or Fallback Dynamic Route

#### Why This Error Occurred

One of your rewrites in your `next.config.js` point to a [dynamic route](https://nextjs.org/docs/routing/dynamic-routes) that is automatically statically optimized or is a [fallback SSG page](https://nextjs.org/docs/basic-features/data-fetching#the-fallback-key-required).

Rewriting to these pages are not yet supported since rewrites are not available client-side and the dynamic route params are unable to be parsed. Support for this may be added in a future release.

#### Possible Ways to Fix It

For fallback SSG pages you can add the page to the list of [prerendered paths](https://nextjs.org/docs/basic-features/data-fetching#the-paths-key-required).

For static dynamic routes, you will currently need to either rewrite to non-dynamic route or opt the page out of the static optimization with [`getServerSideProps`](https://nextjs.org/docs/basic-features/data-fetching#getserversideprops-server-side-rendering)

### Useful Links

- [Dynamic Routes Documentation](https://nextjs.org/docs/routing/dynamic-routes)
- [Fallback Documentation](https://nextjs.org/docs/basic-features/data-fetching#the-fallback-key-required)
