# Test instructions

## Cache Components compatibility

All newly created e2e tests must work with Cache Components both enabled and
disabled. The test infrastructure runs both variants. In the enabled variant,
`__NEXT_CACHE_COMPONENTS=true` enables Cache Components even when the fixture's
`next.config` does not declare `cacheComponents`.

- Write fixtures that conform to Cache Components rules by default: put
  uncached or request-time work behind appropriate `<Suspense>` boundaries,
  and use `"use cache"` for work that should be cached. Preserve what the test
  is intended to cover when adapting the fixture.
- Do not pin `cacheComponents: false` or skip the enabled variant just to make
  an otherwise compatible test pass. If behavior legitimately differs, keep
  meaningful assertions in both variants; use the resolved-config runtime
  `gate()` helper rather than checking environment variables.
- Only exclude the Cache Components variant when the feature under test is
  explicitly unsupported, such as Edge Runtime or another incompatible feature.
  Explain the incompatibility in a comment and use a test gate. For a fixture
  that cannot build or run with Cache Components, put the gate directly above
  the suite's `describe`:

  ```ts
  // Edge Runtime is not supported with Cache Components.
  // @force-gate !cacheComponents
  describe('edge runtime', () => {
    // ...
  })
  ```

  `@force-gate` skips the incompatible variant; `@gate` instead runs the test
  with an expected failure and detects stale gates. The `cacheComponents`
  condition reads the fixture's resolved config, not just the environment.
  See [the gate reference](lib/gate/README.md) and `$gate-tests` for directive
  selection, build-skipping limitations, and verification guidance.

## Code review

- During code review, flag any change that newly disables, skips, or omits deploy-mode tests or assertions, including `skipDeployment: true` and `isNextDeploy` conditionals. Only allow this when the assertion is inherently specific to self-hosted behavior; even then, prefer an explicit deploy-mode assertion that documents the different deployed semantics.
- During code review, flag any new hardcoded cache tag or any `revalidatePath('/')` (including `('/', 'layout')`) in a deploy-active fixture. Revalidation invalidates at Vercel project scope and every deploy suite shares one project per matrix dimension, so suites using the same tag or path purge each other's cache. Tags (`cacheTag`/`revalidateTag`/`updateTag`/`next.tags`) get a suite-slug prefix, e.g. `app-static:thankyounext`. Paths must name a real route, so a fixture that needs to revalidate `/` moves its page to a suite-unique route first (see `parallel-routes-revalidation`'s `/prr`). A revalidation route handler that takes the tag/path from a request parameter is fine as long as the values the tests pass are suite-unique.
- During code review, flag any fetch URL a fixture shares with another fixture when a test depends on the cached value. Fetch cache entries are keyed by URL across deployments, so two fixtures fetching the same URL share one entry, and either fixture's writes or revalidations change the value the other sees. Give the data endpoint suite-unique query params, e.g. `api/random?app-static-page` instead of `api/random?page`.
