# Max Custom Routes Reached

#### Why This Error Occurred

The number of combined routes from `headers`, `redirects`, and `rewrites` exceeds 1000. This can impact performance because each request will iterate over all routes to check for a match in the worst case.

#### Possible Ways to Fix It

- Leverage dynamic routes inside of the `pages` folder to reduce the number of rewrites needed
- Combine headers routes into dynamic matches e.g. `/first-header-route` `/second-header-route` -> `/(first-header-route$|second-header-route$)`

### Useful Links

- [Dynamic Routes documentation](https://nextjs.org/docs/routing/dynamic-routes)
- [Rewrites documentation](https://nextjs.org/docs/api-reference/next.config.js/rewrites)
- [Redirects documentation](https://nextjs.org/docs/api-reference/next.config.js/redirects)
- [Headers documentation](https://nextjs.org/docs/api-reference/next.config.js/headers)
