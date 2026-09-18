/**
 * Execution support, independently of which profiles discovery can describe.
 * Change an unavailable entry only with its compiler/runtime integration.
 */
export const testCapabilities = {
  version: 1,
  compatibility: {
    api: 'vitest',
    reference: '0780a8e5b7967a4168173599e9c74fb79aab2483',
    scope: 'Explicit Next-owned subset; not the full Vitest API or ecosystem.',
  },
  authoring: {
    schemaVersion: 1,
    reference: {
      vitestRevision: '0780a8e5b7967a4168173599e9c74fb79aab2483',
      primitiveVersion: '5.0.1',
      snapshotPatch: 'patches/@vitest__snapshot@5.0.1.patch',
    },
    declarations: ['test', 'it', 'describe', 'suite'],
    declarationModifiers: ['skip', 'only', 'todo', 'fails', 'skipIf', 'runIf'],
    parameterization: [
      'test.each',
      'test.for',
      'describe.each',
      'describe.for',
    ],
    testOptions: [
      'timeout',
      'retry',
      'repeats',
      'fails',
      'skip',
      'only',
      'todo',
      'concurrent: false',
    ],
    hooks: [
      'beforeAll',
      'afterAll',
      'beforeEach',
      'afterEach',
      'onTestFinished',
      'onTestFailed',
    ],
    fixtures: {
      api: 'test.extend',
      scopes: ['test', 'file'],
      options: ['scope', 'auto'],
      overrides: 'test.override object syntax, scoped to the declaring suite',
      dependencies:
        'object-destructured names, aliases, and defaults; no rest, nested, or computed properties',
    },
    expectUtilities: [
      'expect.extend',
      'expect.soft',
      'expect.poll',
      'expect.addSnapshotSerializer',
      'expect.assertions',
      'expect.hasAssertions',
    ],
    assertionModifiers: ['not', 'resolves', 'rejects'],
    verifiedMatcherSubset: [
      'toBe',
      'toEqual',
      'toThrow',
      'toHaveBeenCalled',
      'toHaveBeenCalledTimes',
      'toHaveBeenCalledWith',
      'toMatchSnapshot',
      'toMatchInlineSnapshot',
      'toMatchFileSnapshot',
      'arrayContaining',
    ],
    matcherInventoryScope:
      'Conservative tested subset, not an exhaustive name enumeration of the pinned assertion primitive.',
    spies: [
      'vi.fn',
      'vi.spyOn',
      'vi.isMockFunction',
      'vi.clearAllMocks',
      'vi.resetAllMocks',
      'vi.restoreAllMocks',
      'vi.stubGlobal',
      'vi.stubEnv',
      'vi.useFakeTimers',
      'vi.useRealTimers',
      'vi.advanceTimersByTime',
      'vi.runAllTimers',
    ],
    snapshots: {
      default: 'read-only',
      update:
        'explicit one-shot or watch u command; coordinated external, inline, and raw bytes commit only after successful authoritative parent exit and cleanup',
      profiles:
        'route-less development and production Node/RSC/browser; browser commits after browser and application-server disposal',
      inlineSourceRevision:
        'the parent requires the exact source hash captured across compilation and rejects concurrent edits',
      unchecked: 'always preserve; no pruning',
      noFinalSnapshotAssertions: 'no write plan or normalization',
      unsupported: ['automatic watch updates'],
    },
    unsupported: [
      'concurrent execution and shuffled suites',
      'async describe',
      'aroundEach/aroundAll',
      'implicit new snapshot mode',
      'assertType/expectTypeOf',
      'full Vitest task/result introspection',
      'worker scope/rest-nested-computed dependency destructuring/builder fixture forms',
      'untransformed vi.mock/vi.importActual/vi.hoisted',
    ],
    differences: [
      'Next checks assertion counts after teardown/finished listeners; pinned Vitest checks counts before afterEach.',
      'Final assertion/spy disposal errors fail attempts but do not re-enter failure listeners.',
      'Failure listener receives supported TestContext, not full Vitest task/result inspection.',
      'Static factory mocks require compiler transformation and are limited to development Node specs.',
      'Attempt-owned fake timers never replace runner deadlines, polling schedules, or parent process/resource deadlines.',
    ],
    scope:
      'Conservative verified authoring subset of the pinned Vitest reference.',
  },
  execution: {
    modes: ['development', 'production'],
    environments: ['node', 'rsc', 'browser'],
    runtime: 'nodejs',
    bundler: 'turbopack',
    routeContext: false,
    browser: 'Node driver with a real Next application and browser fixtures.',
    platforms: ['darwin', 'linux'],
    note: 'POSIX process ownership is required; independent native/runtime acceptance is recorded for darwin-arm64.',
  },
  features: {
    listing: { supported: true },
    orderedSetup: {
      supported: true,
      scope: 'Sequential compiled setup in the same isolated file collection.',
    },
    staticFactoryMocks: {
      supported: true,
      api: 'vi.mock',
      scope:
        'Development Node specs, including ordered compiled setup files; compiler-transformed top-level calls only.',
      targets:
        'String-literal and type-safe literal import() project-local ESM targets with static exports, resolved through the actual Next compiler context.',
      factories:
        'Inline synchronous or asynchronous factories with statically known object export keys; partial spreads only from compiler-verified awaited importOriginal namespaces.',
      bindings:
        'Explicit factory exports are fixed values; non-overridden exports inherited from importOriginal remain live ESM bindings. Static and dynamic consumers share one mocked namespace.',
      unsupported: [
        'RSC/browser/production mocks',
        'dynamic targets, queries, fragments, or import attributes',
        'CommonJS targets or cycles involving mocked originals',
        'framework/native/external/node_modules/spec-self targets',
        'use-client/use-server target boundaries',
        'arbitrary/computed/accessor export shapes or arbitrary spreads',
        'dynamic imports inside factories; use supplied importOriginal',
        'BOM-prefixed mocked specs',
        'captured spec-local bindings',
        'automatic mocks, vi.importActual, vi.hoisted, or runtime registration',
      ],
    },
    watch: {
      supported: true,
      scope:
        'Route-less development Node/RSC on POSIX; fresh runs with conservative full invalidation, owned process cleanup, live terminal progress, and interactive rerun, filter, snapshot update, and quit commands.',
    },
    snapshotUpdate: {
      supported: true,
      scope:
        'Explicit one-shot for route-less development/production Node, RSC, and browser profiles, plus watch u for development Node/RSC. Browser writes wait for browser/server disposal; unchecked snapshots are preserved.',
    },
    production: {
      supported: true,
      environments: ['node', 'rsc', 'browser'],
      scope:
        'Isolated production Node tests, route-less RSC dynamic-subtree tests, and Node browser drivers compiled with real production conditions and optimization. Browser drivers use a separately built application; instant() requires explicit production instrumentation.',
      unsupported: [
        'route or layout context for isolated tests',
        'prerender/PPR and Server Action transport for isolated RSC tests',
        'production component mounting',
        'production module mocks',
        'production coverage',
      ],
    },
    browserComponents: {
      supported: true,
      mode: 'development',
      browser: 'chromium',
      scope:
        'Registered standalone server fixtures rendered as real Next App Pages with SSR and client-boundary hydration; Node drivers select fixture IDs and pass JSON props.',
      registration: 'projects[].browserFixtures: { id, module, exportName? }',
      unsupported: [
        'production component mounting',
        'implicit application route or layout context',
        'arbitrary module paths, React values or functions over transport',
        'browser watch',
      ],
    },
    typescriptConfig: {
      supported: false,
      reason:
        'Use next.test.config.json; executable test configuration is not loaded.',
    },
    coverage: {
      supported: true,
      mode: 'development',
      environment: 'node',
      execution: 'opt-in one-shot',
      reports: ['json', 'text'],
      scope:
        'Imported project sources in route-less Node tests, accumulated across files and retries, including failed attempts.',
      metric:
        'Original source lines with non-whitespace mapped generated spans. Mapped delimiters can count; syntax eliminated from generated output is absent. This is not Istanbul line, branch, or function coverage parity.',
      unsupported: [
        'production, RSC, and browser coverage',
        'route context',
        'module-mocked artifacts',
        'watch',
        'combining coverage with snapshot updates',
        'coverage-provider compatibility',
        'branch or function coverage',
        'thresholds and unimported-file expansion',
      ],
    },
  },
} as const

export type TestCapability = keyof typeof testCapabilities.features

export function requireTestCapability(capability: TestCapability): void {
  const feature = testCapabilities.features[capability]
  if (!feature.supported) {
    throw new Error(
      `Unsupported test capability "${capability}": ${feature.reason}`
    )
  }
}
