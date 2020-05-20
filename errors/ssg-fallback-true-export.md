# SSG `fallback: true` Export Error

#### Why This Error Occurred

You attempted to export a page with a `fallback: true` return value from `getStaticPaths` which is invalid. `fallback: true` is meant for building pages on-demand after a build has occurred, exporting disables this functionality

#### Possible Ways to Fix It

If you would like the `fallback: true` behavior, `next export` should not be used. Instead follow the [deployment documentation](https://nextjs.org/docs/deployment) to deploy your incrementally generated static site.

### Useful Links

- [deployment documentation](https://nextjs.org/docs/deployment#vercel-recommended)
- [`fallback: true` documentation](https://nextjs.org/docs/basic-features/data-fetching#fallback-true)
