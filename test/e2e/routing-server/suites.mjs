// Whole-file routing suites, grouped by the public behavior they exercise.
// Existing fixtures stay in their feature directories. Focused cases from
// broader suites are selected separately in contracts.json.
export default {
  http: [
    // Payloads, status codes, streaming, compression, and request admission.
    'test/e2e/routing-server/http/docs-http-contract/docs-http-contract.test.ts',
    'test/e2e/routing-server/http/compression-contract/compression-contract.test.ts',
    'test/e2e/routing-server/http/action-origin-contract/action-origin-contract.test.ts',

    // Proxy request-header overrides and response headers/cookies.
    'test/e2e/middleware-request-header-overrides/test/index.test.ts',
    'test/e2e/middleware-responses/test/index.test.ts',

    // Listener, connection timeout, and background-work lifecycle.
    'test/e2e/routing-server/http/lifecycle-contract/lifecycle-contract.test.ts',
  ],
  router: [
    // Filesystem selection, dynamic paths, private files, and custom extensions.
    'test/e2e/routing-server/router/docs-route-selection/docs-route-selection.test.ts',
    'test/e2e/app-dir/dynamic-params-request-modes/dynamic-params-request-modes.test.ts',
    'test/e2e/app-dir/underscore-ignore-app-paths/underscore-ignore-app-paths.test.ts',
    'test/e2e/custom-page-extension/custom-page-extension.test.ts',
    'test/e2e/app-dir/proxy-page-extensions/proxy-page-extensions.test.ts',
    'test/e2e/routing-server/router/route-definition-conflicts/route-definition-conflicts.test.ts',
    'test/e2e/routing-server/router/filesystem-optout-contract/filesystem-optout-contract.test.ts',

    // Configured headers, redirects, rewrites, conditions, and routing phase order.
    'test/e2e/routing-server/router/docs-router-contract/docs-router-contract.test.ts',
    'test/e2e/routing-server/router/conditional-routes/conditional-routes.test.ts',
    'test/e2e/custom-routes/custom-routes.test.ts',

    // URL/query policy, basePath, asset prefixes, and trailing slashes.
    'test/e2e/routing-server/router/docs-url-policy/docs-url-policy.test.ts',
    'test/e2e/routing-server/router/docs-url-policy/asset-prefix-data.test.ts',
    'test/e2e/basepath/basepath.test.ts',
    'test/e2e/basepath/error-pages.test.ts',
    'test/e2e/basepath/query-hash.test.ts',
    'test/e2e/basepath/redirect-and-rewrite.test.ts',
    'test/e2e/basepath/router-events.test.ts',
    'test/e2e/basepath/trailing-slash.test.ts',
    'test/e2e/trailing-slashes/basepath.test.ts',
    'test/e2e/trailing-slashes/with-trailing-slash.test.ts',
    'test/e2e/trailing-slashes/without-trailing-slash.test.ts',
    'test/e2e/skip-trailing-slash-redirect/index.test.ts',

    // Proxy matching, redirects, rewrites, and request normalization.
    'test/e2e/middleware-custom-matchers/test/index.test.ts',
    'test/e2e/middleware-custom-matchers/test/node-runtime.test.ts',
    'test/e2e/middleware-custom-matchers-basepath/test/index.test.ts',
    'test/e2e/middleware-custom-matchers-i18n/test/index.test.ts',
    'test/e2e/middleware-matcher/index.test.ts',
    'test/e2e/middleware-redirects/test/index.test.ts',
    'test/e2e/middleware-redirects/test/node-runtime.test.ts',
    'test/e2e/middleware-rewrites/test/index.test.ts',
    'test/e2e/routing-server/router/proxy-normalization-config/proxy-normalization-config.test.ts',

    // Internationalized routing through Proxy and app/[lang].
    'test/e2e/routing-server/router/app-i18n-contract/app-i18n-contract.test.ts',

    // Navigation requests, search params, parallel slots, and intercepted routes.
    'test/e2e/routing-server/router/rsc-contract/rsc-contract.test.ts',
    'test/e2e/app-dir/multi-value-search-params-stale/multi-value-search-params-stale.test.ts',
    'test/e2e/app-dir/pages-to-app-routing/pages-to-app-routing.test.ts',
    'test/e2e/app-dir/parallel-routes-and-interception/parallel-routes-and-interception.test.ts',
    'test/e2e/app-dir/parallel-routes-catchall-default/parallel-routes-catchall-default.test.ts',
    'test/e2e/app-dir/interception-segments-two-levels-above/interception-segments-two-levels-above.test.ts',

    // Cached handlers, revalidation, last-good ISR, and Draft Mode lifecycle.
    'test/e2e/routing-server/router/docs-handler-cache/docs-handler-cache.test.ts',
    'test/e2e/routing-server/router/isr-last-good/isr-last-good.test.ts',
    'test/e2e/routing-server/router/docs-draft-lifecycle/docs-draft-lifecycle.test.ts',

    // Image endpoint remote-source matching and admission.
    'test/e2e/routing-server/router/docs-remote-images/docs-remote-images.test.ts',
  ],
}
