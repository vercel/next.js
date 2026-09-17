# Parameter matching regression coverage

These suites test the contract across build, request handling, caches, client
navigation, and deployment. Emitting the expected matcher or returning HTTP 200
is not sufficient: an admitted request must reach the right page with the right
params, and a rejected request must not render that page's nested not-found UI.

The new regression assertions are intentionally not gated on the presence of a
bug. Keep the tests unchanged when fixing the implementation. Mode gates only
exclude unavailable capabilities, such as prefetching in development or reading
local build artifacts from a deployment.

## Request and deployment boundaries

| Contract | Fixture and assertions |
| --- | --- |
| A closed prefix does not close its open suffix | This suite: `lang: not-found`, `top: blocking`, `bottom: fallback`; seeded and on-demand-only pages; both `en` and `es`; cold and repeated document requests |
| Dynamic suffixes are not captured in prerenders | This suite: different bottom values beneath the same generated or novel top; [runtime suite](../param-matching-runtime/param-matching-runtime.test.ts): compare shell generations across top and bottom changes |
| Parameter encoding survives routing and cache lookup | This suite: multi-part catch-all with spaces and a literal percent sign |
| Routing rejection applies to every request form | This suite: documents, RSC, route-tree prefetches, unmatched static segments, and nested not-found boundaries |
| Client route discovery preserves admission | This suite: prefetch a 404 before navigating to an allowed open suffix; prefetch an allowed suffix before navigating to a rejected prefix; compare with refresh |
| Seeded outputs remain admissible after revalidation | This suite: `revalidatePath` for fully closed and partially closed routes; verify a new generation and continued rejection of an invalid prefix |
| Expected misses are not internal server errors | This suite: inspect local server output after a routing 404 |
| Blocking means concrete generation before the response | [Runtime suite](../param-matching-runtime/param-matching-runtime.test.ts): seeded and seedless routes, different cold keys, concurrent cold requests, and warm requests |
| Fallback and upgrade are distinct operations | Runtime suite: shared first-visitor HTML, concrete response params, subsequent upgrade when Partial Prefetching is enabled, and unchanged shared shell when it is disabled |
| An unresolved root must not contaminate cached computations | [Root-param suite](../param-matching-root-params/param-matching-root-params.test.ts): cached and uncached root reads for seeded and novel languages; repeated visits, cross-root navigation, and refresh |
| Deployment cache-key names agree with routing | Root-param suite: every `allowQuery` key on the root fallback is actually forwarded by the corresponding routing destination |
| Non-URL tree depth does not change policy order | [Parallel/group suite](../../../production/app-dir/param-matching-route-groups/param-matching-route-groups.test.ts): identical URL policies with aligned branches, a group in the named slot, and a group in children; static and generated exports |

The root tests describe the currently accepted `lang: fallback` configuration.
If root fallbacks are deliberately prohibited instead, that is an API decision,
not a reason to weaken assertions about corrupted cached content.

## Existing compiler and validation coverage

These tests complement, rather than replace, the existing suites:

- [Main API suite](../generate-prerender-matching/generate-prerender-matching.test.ts): inheritance and explicit overrides, uniform policies, inferred policies, holes, dynamic tails, emitted matchers, root/catch-all/optional-catch-all routes, parallel agreement, typegen key visibility, feature/Cache Components requirements, export restrictions, empty-shell validation, and anonymized dev validation.
- [Export validation](../param-matching-exports/param-matching-exports.test.ts): static versus generated exports, invalid return values, parameter visibility, and checking the feature flag before executing a generator.
- [Not-found coherence](../../../production/app-dir/param-matching-not-found/param-matching-not-found.test.ts): missing sibling/ancestor/parallel declarations, route groups, generated declarations, inherited overrides, explicit disagreement, and independent parameters with the same name.
- [Parallel inheritance](../../../production/app-dir/param-matching-parallel-inheritance/param-matching-parallel-inheritance.test.ts): preserve each branch's inherited policy while combining parallel branches.
- [Unseeded prefixes](../../../production/app-dir/param-matching-unseeded-prefix/param-matching-unseeded-prefix.test.ts): explicit policies extend the prerenderable prefix; empty/nonempty shell inference; unconfigured tails remain dynamic.
- [Inferred root behavior](../../../production/app-dir/param-matching-root-fallback/param-matching-root-fallback.test.ts): inferred root blocking and policies beneath a known root.
- [Closed client routes](../segment-cache-closed-params/segment-cache-closed-params.test.ts) and [legacy dynamicParams](../segment-cache-dynamic-params/segment-cache-dynamic-params.test.ts): client-cache admission and the non-Cache Components comparison.

## Verification matrix

Run the runtime and routing suites with both bundlers and with Partial
Prefetching enabled and disabled. Their default configuration enables it;
`__NEXT_TEST_AXIS=A` disables it. Assertions about explicit policy do not change
between the two configurations. The upgrade assertions account separately for
the existing Partial-Prefetching-only upgrade feature.

```sh
pnpm test-start-turbo test/e2e/app-dir/param-matching-runtime test/e2e/app-dir/param-matching-routing
__NEXT_TEST_AXIS=A pnpm test-start-turbo test/e2e/app-dir/param-matching-runtime test/e2e/app-dir/param-matching-routing
pnpm test-start-webpack test/e2e/app-dir/param-matching-runtime test/e2e/app-dir/param-matching-routing
__NEXT_TEST_AXIS=A pnpm test-start-webpack test/e2e/app-dir/param-matching-runtime test/e2e/app-dir/param-matching-routing

pnpm test-start-turbo test/e2e/app-dir/param-matching-root-params test/production/app-dir/param-matching-route-groups
pnpm test-start-webpack test/e2e/app-dir/param-matching-root-params test/production/app-dir/param-matching-route-groups

pnpm test-dev-turbo test/e2e/app-dir/generate-prerender-matching test/e2e/app-dir/param-matching-exports test/e2e/app-dir/param-matching-root-params test/e2e/app-dir/param-matching-routing
pnpm test-dev-webpack test/e2e/app-dir/generate-prerender-matching test/e2e/app-dir/param-matching-exports test/e2e/app-dir/param-matching-root-params test/e2e/app-dir/param-matching-routing
```

Run the existing production suites above as well. They cover configuration and
validation combinations that the request fixtures intentionally keep simple.

## Deployment is a separate acceptance check

The routing and root-param HTTP/browser assertions also support deployment
mode. The query-contract assertion is local-only and must not substitute for a
real adapter deployment:

```sh
NEXT_ENABLE_ADAPTER=1 pnpm test-deploy-turbo test/e2e/app-dir/param-matching-routing test/e2e/app-dir/param-matching-root-params
NEXT_ENABLE_ADAPTER=1 pnpm test-deploy-webpack test/e2e/app-dir/param-matching-routing test/e2e/app-dir/param-matching-root-params
```

Use the configured deployment-test credentials. Do not embed a local adapter
checkout, substitute a mocked function launcher, or change metadata in a test
adapter to make these requests pass.

A local `next start` pass does not establish adapter compatibility. Before
declaring the closed-prefix deployment issue fixed, confirm the deployment
actually uses grouped functions and exercises the cold open suffixes in this
fixture. Function grouping and routing-level rejection without function/ISR
invocation require deployment evidence; this suite does not infer either from
HTTP status alone. Revalidation and cold requests must work on that deployment
with the unchanged adapter, not just against captured routing regexes.
