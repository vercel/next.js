// Architecture regression selections, separate from the public documentation contracts.
// Explicit modes, bundlers, and case filters preserve each fixture's supported scope.
export default [
  // A: Live route discovery, inventory updates, and conflict recovery.
  {
    id: 'A',
    project: 'Turbopack route discovery',
    selections: [
      // Native subscription inventory and emitted route kinds (Turbopack only).
      {
        file: 'test/development/basic/next-rs-api.test.ts',
        modes: ['dev'],
        bundlers: ['turbo'],
        hostingPath: 'Rust/N-API subscription',
        testNamePattern:
          'next\\.rs api (?:should detect the correct routes|reports route kinds|should allow to write (?:root page|pages |app ))',
      },
      {
        file: 'test/development/empty-project/empty-project.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/e2e/next-head/index.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
        testNamePattern: 'next/head dev route discovery',
      },
      {
        file: 'test/development/app-hmr/hmr.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
        testNamePattern:
          'renaming a folder|server advanced while the client was disconnected',
      },
      {
        file: 'test/development/app-dir/hmr-deleted-page/hmr-deleted-page.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/development/app-dir/hmr-intercept-routes/hmr-intercept-routes.test.ts',
        modes: ['dev'],
        bundlers: ['turbo'],
        hostingPath: 'Node CLI',
      },
      // Conflicts must surface and recover; metadata and parallel routes remain discoverable.
      {
        file: 'test/e2e/conflicting-app-page-error/index.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
        testNamePattern: 'development',
      },
      {
        file: 'test/e2e/routing-server/router/route-definition-conflicts/route-definition-conflicts.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/e2e/app-dir/metadata-static-file/metadata-static-file-group-route.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/e2e/app-dir/metadata-static-file/metadata-static-file-parallel-route.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/e2e/app-dir/middleware-rewrite-catchall-priority-with-parallel-route/middleware-rewrite-catchall-priority-with-parallel-route.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
    ],
  },
  // B: Equivalent routing policy through Node, the reference adapter, and emitted handlers.
  {
    id: 'B',
    project: 'Shared Node and adapter routing policy',
    selections: [
      {
        file: 'test/e2e/routing-server/router/docs-router-contract/docs-router-contract.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/e2e/routing-server/router/conditional-routes/conditional-routes.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/production/adapter-config/adapter-config.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI + @next/routing + emitted handlers',
        testNamePattern: 'reference routing adapter',
      },
    ],
  },
  // C: Route catalogs across generations, inner-server dispatch, and revalidation.
  {
    id: 'C',
    project: 'Generation-scoped route catalog',
    selections: [
      {
        file: 'test/e2e/routing-server/router/filesystem-optout-contract/filesystem-optout-contract.test.ts',
        modes: ['dev', 'start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath:
          'outer router + production inner render; dev custom forwarding',
      },
      {
        file: 'test/e2e/routing-server/router/isr-last-good/isr-last-good.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node + internal on-demand revalidation',
      },
      {
        file: 'test/development/empty-project/empty-project.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
        testNamePattern: 'higher-priority routes',
      },
      {
        file: 'test/development/app-dir/hmr-deleted-page/hmr-deleted-page.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
        testNamePattern: 'discard manifests',
      },
    ],
  },
  // D: Request-body, header/cookie, cancellation, and tracing handoff.
  {
    id: 'D',
    project: 'Typed invocation and middleware handoff',
    selections: [
      {
        file: 'test/production/reading-request-body-in-middleware/index.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/e2e/middleware-request-header-overrides/test/index.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/e2e/middleware-responses/test/index.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/e2e/cancel-request/stream-cancel.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      // Focused tracing cases retain parent ancestry through direct handler invocation.
      {
        file: 'test/e2e/opentelemetry/instrumentation/opentelemetry.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node + direct emitted handler',
        testNamePattern:
          'all spans .*inherit traceId|should propagate incoming context without next-server wrapper|should add route names to handleRequest and parent spans',
      },
    ],
  },
  // E: Custom-server upgrade ownership, shutdown, and runtime disposal.
  {
    id: 'E',
    project: 'Runtime services and lifecycle',
    selections: [
      {
        file: 'test/e2e/custom-server/custom-server.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'custom automatic/explicit upgrade',
        testNamePattern: 'upgrade ownership|custom server lifecycle ownership',
      },
      // Mode-specific case filters keep dev children separate from production listeners.
      {
        file: 'test/production/graceful-shutdown/index.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'next start + standalone',
        testNamePattern: 'Graceful Shutdown production',
      },
      // Mode-specific case filters keep dev children separate from production listeners.
      {
        file: 'test/production/graceful-shutdown/index.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'next dev child',
        testNamePattern: 'Graceful Shutdown development',
      },
      {
        file: 'test/e2e/app-dir/graceful-shutdown-next-after/custom-server/index.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'custom server',
      },
      {
        file: 'test/e2e/app-dir/graceful-shutdown-next-after/next-start/index.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
    ],
  },
  // F: CLI and custom-server bundler selection, including conflicting options.
  {
    id: 'F',
    project: 'Unified bundler selection',
    selections: [
      {
        file: 'test/development/bundler-selection-contract/bundler-selection-contract.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'isolated CLI + custom next()',
      },
    ],
  },
  // G: Environment and TypeScript alias changes during development.
  {
    id: 'G',
    project: 'Semantic dev configuration operations',
    selections: [
      {
        file: 'test/development/app-hmr/hmr-env.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
      {
        file: 'test/development/tsconfig-path-reloading/index.test.ts',
        modes: ['dev'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'Node CLI',
      },
    ],
  },
  // H: Adapter output inventories, packaged handlers, and deterministic build hashes.
  {
    id: 'H',
    project: 'Build adapter output collection and lowering',
    selections: [
      {
        file: 'test/production/adapter-config/adapter-config.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'build onBuildComplete + Node',
      },
      {
        file: 'test/production/adapter-config-i18n/adapter-config-i18n.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'build onBuildComplete',
      },
      {
        file: 'test/production/adapter-root/adapter-root.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'build onBuildComplete',
      },
      {
        file: 'test/production/adapter-pages-api-runtime/adapter-pages-api-runtime.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'packaged emitted handler',
      },
      {
        file: 'test/production/app-dir/adapter-partial-fallback-disabled/adapter-partial-fallback-disabled.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'build onBuildComplete',
      },
      {
        file: 'test/production/app-dir/adapter-dynamic-routes/dynamic-routes-base-path.test.ts',
        modes: ['start'],
        bundlers: ['turbo', 'webpack'],
        hostingPath: 'build onBuildComplete',
      },
      // Content-hash assertions retain their original production Turbopack scope.
      {
        file: 'test/production/deterministic-build/adapter-content-hashes.test.ts',
        modes: ['start'],
        bundlers: ['turbo'],
        hostingPath: 'build content hashes',
      },
    ],
  },
]
