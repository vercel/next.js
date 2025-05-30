# next

## 15.4.0-canary.55

### Patch Changes

- [#79302](https://github.com/vercel/next.js/pull/79302) [`aa7d4de`](https://github.com/vercel/next.js/commit/aa7d4de472519f1b1a7a191177edfd08ab61b521) Thanks [@unstubbable](https://github.com/unstubbable)! - Enable `ppr` when `dynamicIO` is enabled

- [#79565](https://github.com/vercel/next.js/pull/79565) [`e0d4df2`](https://github.com/vercel/next.js/commit/e0d4df2180111bcb1511fc08d40d4c1b237326dd) Thanks [@wyattjoh](https://github.com/wyattjoh)! - Resolved bug where hitting the parameterized path directly would cause a fallback shell generation instead of just rendering the route with the parameterized placeholders.

- [#79248](https://github.com/vercel/next.js/pull/79248) [`21e4411`](https://github.com/vercel/next.js/commit/21e4411648cd82f91f31d08114678c37efc27fec) Thanks [@ijjk](https://github.com/ijjk)! - Fix dangling promise in unstable_cache

- [#79213](https://github.com/vercel/next.js/pull/79213) [`0c0262e`](https://github.com/vercel/next.js/commit/0c0262e604d92ffd9b92c83e8277dcb0222240ed) Thanks [@unstubbable](https://github.com/unstubbable)! - Always pass implicit/soft tags into the `CacheHandler.get` method

- [#79144](https://github.com/vercel/next.js/pull/79144) [`d16d9f4`](https://github.com/vercel/next.js/commit/d16d9f46b647469fdc49e8408b0fd3b645ccce98) Thanks [@devjiwonchoi](https://github.com/devjiwonchoi)! - [TypeScript Plugin] Match method signature (`someFunc(): void`) type for client boundary warnings.

- [#79204](https://github.com/vercel/next.js/pull/79204) [`8eaf44b`](https://github.com/vercel/next.js/commit/8eaf44b0364b7bca794918da990f8c73420cff7f) Thanks [@devjiwonchoi](https://github.com/devjiwonchoi)! - Fixed rewrite params of the interception routes not being parsed correctly in certain deployed environments

- [#79299](https://github.com/vercel/next.js/pull/79299) [`e2837fb`](https://github.com/vercel/next.js/commit/e2837fb3b485bde391f1dfb1d6fdb87f4bd71d1e) Thanks [@unstubbable](https://github.com/unstubbable)! - Use `onPostpone` to determine if segment prefetch is partial

- [#79193](https://github.com/vercel/next.js/pull/79193) [`3ecf087`](https://github.com/vercel/next.js/commit/3ecf087f10fdfba4426daa02b459387bc9c3c54f) Thanks [@devjiwonchoi](https://github.com/devjiwonchoi)! - [TypeScript Plugin] Moved the diagnostics' positions to the prop's type instead of the value for client-boundary warnings.

- [#79658](https://github.com/vercel/next.js/pull/79658) [`c513008`](https://github.com/vercel/next.js/commit/c51300807ea7e0590104343b8616572503f0b78d) Thanks [@eps1lon](https://github.com/eps1lon)! - [dev-overlay] Show error overlay on any thrown value

  We used to only show the error overlay on thrown values with a stack property.
  On other thrown values we kept the overlay collapsed.

- [#79448](https://github.com/vercel/next.js/pull/79448) [`8751df4`](https://github.com/vercel/next.js/commit/8751df4ee3d78a5ba53ae2ab7103da02d2637a06) Thanks [@unstubbable](https://github.com/unstubbable)! - [Segment Cache] Fix: Ensure server references can be prerendered

- [#79109](https://github.com/vercel/next.js/pull/79109) [`854992f`](https://github.com/vercel/next.js/commit/854992f4d7ca576390c231c1ab97643b37dc44f6) Thanks [@eps1lon](https://github.com/eps1lon)! - Sourcemap errors during prerender if `experimental.enablePrerenderSourceMaps` is enabled

- [#79657](https://github.com/vercel/next.js/pull/79657) [`1f25118`](https://github.com/vercel/next.js/commit/1f2511839052b0a66d70ff1e328af6ac816db1ff) Thanks [@unstubbable](https://github.com/unstubbable)! - Fix name tracking for closures in server actions transform

- [#78882](https://github.com/vercel/next.js/pull/78882) [`5136f8e`](https://github.com/vercel/next.js/commit/5136f8ecfd06f638325a2f45656744cbebd3fe97) Thanks [@unstubbable](https://github.com/unstubbable)! - [dynamicIO] Avoid timeout errors with dynamic params in `"use cache"`
