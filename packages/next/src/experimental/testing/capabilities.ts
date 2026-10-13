import compatibilityInventory from './compatibility-inventory.json'

/**
 * Execution support, independently of which profiles discovery can describe.
 * Change an unavailable entry only with its compiler/runtime integration.
 */
export const testCapabilities = {
  version: 1,
  compatibility: {
    api: 'vitest',
    targetVersion: '5.0.4',
    supportedVersionRange: null,
    stableReady: false,
    reference: '6a11cf66f99fa610b7364363d5ca42b66d994f40',
    scope: 'Explicit Next-owned subset; not the full Vitest API or ecosystem.',
  },
  compatibilityInventory,
  authoring: {
    schemaVersion: 1,
    reference: {
      vitestRevision: '6a11cf66f99fa610b7364363d5ca42b66d994f40',
      primitiveVersion: '5.0.4',
      snapshotPatch: 'patches/@vitest__snapshot@5.0.4.patch',
    },
    declarations: ['test', 'it', 'describe', 'suite'],
    asynchronousSuites:
      'Async callbacks retain suite ownership across await; nested collection settles before execution and rejected collection is retained.',
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
    typeAssertions: ['assertType', 'expectTypeOf'],
    typeAssertionScope:
      'Pinned expect-type primitives and TypeScript/editor assertions. Running compiler-backed type-test suites and typecheck configuration remains unimplemented.',
    chaiAssertions:
      'assert (Chai 6 compatible static API; attempt/file scope access guards)',
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
      default: 'create missing snapshots locally and in watch; read-only in CI',
      update:
        'new-only locally, or explicit all with --update/watch u; coordinated external, inline, and raw bytes commit only after successful authoritative parent exit and cleanup',
      profiles:
        'route-less development and production Node/RSC/browser; browser commits after browser and application-server disposal',
      inlineSourceRevision:
        'the parent requires the exact source hash captured across compilation and rejects concurrent edits',
      unchecked:
        'skipped tests are retained; full all-mode selections prune obsolete entries, while partial selections preserve unchecked keys',
      obsolete:
        'full read-only selections fail on obsolete snapshots; all-mode empty snapshot files are removed after parent authorization',
      publicationFailure:
        'restore published bytes on a later failure; preserve concurrent user edits and retain recovery backups if restoration is refused',
      unsupported: ['complete filtered obsolete/pruning parity'],
    },
    unsupported: [
      'concurrent execution and shuffled suites',
      'aroundEach/aroundAll',
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
    scheduling: {
      supported: true,
      maxWorkers: { default: 1, minimum: 1, maximum: 64 },
      scope:
        'One-shot bounded Node/RSC file workers; one compiler and one browser/server lease at a time.',
      sharding:
        'One-based INDEX/COUNT; sorted project:path IDs after filtering, round-robin assignment; empty shards succeed.',
      mixedProfiles:
        'Development/production Node/RSC projects run in separate supervised processes, serially to preserve configured output ownership.',
      unsupported: [
        'parallel cases within a file',
        'watch scheduling',
        'mixed-mode browser projects',
        'snapshot updates selecting one source file in multiple profiles',
        'concurrent shards sharing application output',
      ],
    },
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
        'Local new-only and explicit all updates for route-less development/production Node, RSC, and browser profiles, plus watch for development Node/RSC. Browser writes wait for browser/server disposal; partial selections preserve unchecked snapshots.',
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
    resultReports: {
      supported: true,
      reporters: ['default', 'json', 'junit', 'blob'],
      scope:
        'One-shot results, final retry outcomes, full attempt evidence, mapped errors, attributed output, attachments and snapshot summaries. Full reporter schema conformance, snapshot statistics, watch/custom reporter adapters and Vitest blob-format compatibility remain release blockers. --merge-reports merges disjoint versioned Next blobs without compilation.',
    },
    testNamePattern: {
      supported: true,
      scope:
        'One-shot and initial watch selection using -t/--testNamePattern against full ancestor-qualified names. Name-filtered listing requires collection and remains unimplemented.',
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
