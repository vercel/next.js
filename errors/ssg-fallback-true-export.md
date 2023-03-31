# SSG `fallback: true` Export Error

#### Why This Error Occurred

You attempted to export a page with a `fallback: true` return value from `getStaticPaths` which is invalid. `fallback: true` is meant for building pages on-demand after a build has occurred, exporting disables this functionality

#### Possible Ways to Fix It

If you would like the `fallback: true` behavior, you must remove `output: 'export'` and remove `next export` in favor of a different [deployment solution](https://nextjs.org/docs/deployment).

### Useful Links

- [deployment documentation](https://nextjs.org/docs/deployment#vercel-recommended)
- [`fallback: true` documentation](https://nextjs.org/docs/api-reference/data-fetching/get-static-paths#fallback-true)
