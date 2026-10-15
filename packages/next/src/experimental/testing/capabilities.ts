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
    context: [
      'task',
      'expect',
      'annotate',
      'signal',
      'regular-run bench diagnostic',
    ],
    metadata:
      'Stable task/file/suite identity, live task failure state, retained retry/repeat errors, tag definitions/priority/inheritance, mutable task meta and source-mapped annotations with retained local or inline/URL attachments',
    testOptions: [
      'tags',
      'meta',
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
      scopes: ['test', 'file', 'worker'],
      workerLifetime:
        'One isolated execution process owns the worker cache and cleanup after file fixtures. Cross-file isolate:false sharing is not implemented.',
      options: ['scope', 'auto'],
      overrides: 'test.override object syntax, scoped to the declaring suite',
      dependencies:
        'object-destructured names, aliases, and defaults; no rest, nested, or computed properties',
    },
    expectUtilities: [
      'createExpect',
      'context.expect',
      'expect.extend',
      'expect.soft',
      'expect.poll',
      'expect.addSnapshotSerializer',
      'expect.assertions',
      'expect.hasAssertions',
      'augmentable Assertion and AsymmetricMatchersContaining',
    ],
    typeAssertions: ['assertType', 'expectTypeOf'],
    typeAssertionScope:
      'Pinned expect-type primitives and TypeScript/editor assertions. One-shot tsc type-test files use the consumer TypeScript compiler in an owned process; original AST spans attribute diagnostics without evaluating callbacks. Focused type tasks, build, alternate checkers, watch/list/debug and full type-tooling conformance remain unqualified.',
    inSourceTests:
      'includeSource marker discovery and native exact-entry AST substitution share the active Vitest facade in fresh Node files. Ordinary app compilation defaults the marker to false for production removal. RSC, browser, cohorts and typed importMeta subpaths remain unqualified.',
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
    collectionAssertionScope:
      'Ordinary setup/spec collection assertions share an explicit file collection scope; async assertions are drained before sealing it, while case counters start fresh.',
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
      'vi.runAllTicks',
      'vi.advanceTimersToNextFrame',
      'vi.setTimerTickMode',
      'vi.waitFor',
      'vi.waitUntil',
      'vi.setConfig',
      'vi.resetConfig',
      'vi.dynamicImportSettled',
    ],
    setupSequence:
      'List by default, or explicit parallel ordering, through actual compiler-owned setup module imports; configured serializers load first. Parallel setup requires native test-entry ABI 3.',
    timerPrimitive:
      'Standalone fake-timers 15.4.0 with the published Vitest 5.0.4 patch; Date-only and async clock operations, project fakeTimers config, and waits using captured real deadlines. Node child workers cannot fake nextTick.',
    equalityTesters:
      'expect.addEqualityTesters shares the pinned recursive/asymmetric matcher registry across expectation instances; file disposal removes owned registrations.',
    runtimeUtilityConfig:
      'File-owned shallow setConfig/resetConfig, mutable clock/reset/poll/assertion settings and declaration-time timeout capture. Concurrent case execution remains incomplete; hook groups support stack, list and bounded parallel ordering.',
    importSettling:
      'The emitted Node/RSC runtime tracks real chunk/external loads and asynchronous module evaluation. Repeated captured real turns include unreturned nested imports; cleanup cancels waits and restores loader descriptors.',
    utilityLifetime:
      'File-owned clocks, global/environment stubs and mocks; explicit restore or final realm disposal releases resources. Async scope guards remain attempt-owned.',
    mockResetDefaults: {
      clearMocks: true,
      mockReset: false,
      restoreMocks: false,
      unstubGlobals: false,
      unstubEnvs: false,
      scope:
        'Configured resets run before each retry/repeat, before user setup and fixtures.',
    },
    hookSequence: {
      supported: ['stack', 'list', 'parallel'],
      setupFiles: 'list by default; explicit parallel ordering',
      maxConcurrency:
        '5 by default; shared bounded hook/listener/cleanup budget',
      boundaries: 'parent-before-child setup and child-before-parent teardown',
      unsupported: ['concurrent case execution remains unimplemented'],
    },
    snapshots: {
      default: 'create missing snapshots locally and in watch; read-only in CI',
      update:
        'new-only locally, or explicit all with --update/watch u; coordinated external, inline, and raw bytes commit only after successful authoritative parent exit and cleanup',
      profiles:
        'route-less development and production Node/RSC/browser; browser commits after browser and application-server disposal',
      inlineSourceRevision:
        'the parent requires the exact source hash captured across compilation and rejects concurrent edits',
      unchecked:
        'skipped/unselected declared tests retain their keys; complete full or filtered all-mode execution prunes obsolete checked-owner/absent keys, including selected tests with no snapshots',
      obsolete:
        'complete full or filtered read-only execution fails on remaining obsolete keys; all-mode empty snapshot files are removed after parent authorization',
      publicationFailure:
        'restore published bytes on a later failure; preserve concurrent user edits and retain recovery backups if restoration is refused',
      unsupported: [
        'complete custom environment/domain snapshot and crash-recovery matrix',
      ],
    },
    unsupported: [
      'concurrent execution and shuffled suites',
      'aroundEach/aroundAll',
      'full Vitest task/result introspection',
      'cross-file worker fixture reuse with isolate:false; rest/nested/computed fixture dependencies',
      'untransformed vi.mock/vi.importActual/vi.hoisted',
    ],
    differences: [
      'Assertion counts finalize before afterEach, fixture teardown and listeners; later assertions remain observed without changing the completed count check.',
      'Final assertion/spy disposal errors fail attempts but do not re-enter failure listeners.',
      'Failure listener receives supported TestContext, not full Vitest task/result inspection.',
      'Static factory mocks require compiler transformation and are limited to development Node specs.',
      'File-owned fake timers never replace captured runner, polling, import-settling or parent process/resource deadlines.',
    ],
    scope:
      'Conservative verified authoring subset of the pinned Vitest reference.',
  },
  execution: {
    defaultMode:
      'Watch with interactive stdin outside CI and detected agent environments; one-shot for CI, agents, piped stdin, --run and explicitly one-shot operations.',
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
    debugging: {
      supported: true,
      scope:
        'Explicit --inspect [host:]port opens the debugger in the actual isolated file worker. One-shot execution requires one active file worker; --no-file-parallelism selects that limit. Coordinator/compiler arguments are not inherited.',
      unsupported: [
        'watch debugging',
        'coverage with debugging',
        'inspectBrk',
        'editor control protocol',
      ],
    },
    scheduling: {
      supported: true,
      maxWorkers: { default: 1, minimum: 1, maximum: 64 },
      scope:
        'One-shot bounded Node/RSC file workers; one compiler and one browser/server lease at a time.',
      sharding:
        'One-based INDEX/COUNT; root-relative physical-path SHA-1 hashes after filtering, stable balanced contiguous partitions, then fresh-run project name and descending file size order. More shards than files require passWithNoTests; allowed empty assignments publish zero-test results.',
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
    listing: {
      supported: true,
      scope:
        'Plain --list shows selected files. Default --list --json parses declaration syntax through the native SWC parser without executing setup/specification modules; it retains literal/expression names, parameter placeholders, original UTF-16 locations, explicit project names and cross-file focus. --staticParse=false explicitly collects name/file facts through the Next compiler and owned worker without running hooks, fixture factories or test bodies. Static discovery does not yet apply custom application transforms or resolve re-exported declaration helpers; full transform/project/focus qualification remains release work.',
    },
    orderedSetup: {
      supported: true,
      scope: 'Sequential compiled setup in the same isolated file collection.',
    },
    staticFactoryMocks: {
      supported: true,
      api: 'vi.mock',
      scope:
        'Development Node specs with ordered compiled setup; compiler-transformed top-level spec registration only.',
      targets:
        'String-literal and type-safe literal import() project-local ESM targets with static exports, resolved through the actual Next compiler context.',
      factories:
        'Inline synchronous or asynchronous factories with statically known object export keys; partial spreads only from compiler-verified awaited importOriginal namespaces.',
      bindings:
        'Factory object properties, including spread scalars, are captured values. Actual namespaces retain their live bindings and identity; static and dynamic mocked consumers share one compiler-owned namespace.',
      helpers:
        'Validated vi.hoisted declarations, literal vi.importActual and supplied importOriginal callbacks use compiler-owned source identities.',
      automatic:
        'Literal local ESM mocks without a factory use the pinned mockObject primitive; spy:true retains behavior and mock call state. Later actual imports retain their separate reference evaluation.',
      manual:
        'Regular project-local __mocks__ ESM files redirect through the normal graph, preserving live exports, TLA and direct namespace identity.',
      unsupported: [
        'RSC/browser/production mocks',
        'dynamic targets, queries, fragments, or import attributes',
        'CommonJS targets or cycles involving mocked originals',
        'framework/native/external/node_modules/spec-self targets',
        'use-client/use-server target boundaries',
        'arbitrary/computed/accessor export shapes or arbitrary spreads',
        'dynamic imports inside factories; use supplied importOriginal',
        'BOM-prefixed mocked specs',
        'captured spec-local bindings outside validated hoisted declarations',
        'static factories combined with runtime registration or module-cache resets; nonliteral actual imports',
        'setup-file mock registration and direct returned namespace factories',
        'manual files with mocking helpers or earlier hoisted dynamic imports',
        'manual symlink/directory/external/CommonJS sources',
      ],
    },
    runtimeFactoryMocks: {
      supported: true,
      api: 'vi.doMock/vi.doUnmock',
      scope:
        'Isolated development Node entries; direct imported vi/vitest calls with literal project-local leaf ESM targets and inline factories returning statically named object exports.',
      behavior:
        'Factories retain lexical closures and run lazily. Future direct dynamic imports use the registered namespace; re-registration and unregistration preserve already held namespaces. Actual module-cache reset preserves registrations and cached factory results.',
      ownership:
        'Native compiler identities select actual loader callbacks. Pending factory work remains visible to import settling and file disposal; closed asynchronous origins reject.',
      unsupported: [
        'static/hoisted mock mixtures, nonliteral requests, import attributes and foreign user importers',
        'transitive user targets, CommonJS, external packages, queries, fragments and symlink resolution',
        'computed/accessor/spread factory exports, then exports, prototype mutation and non-inline factories',
        'setup, serializers, coverage, custom realms, in-source entries, inspectors and shared cohorts',
        'RSC, browser and production profiles',
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
      reporters: [
        'default',
        'verbose',
        'dot',
        'tap',
        'tap-flat',
        'github-actions',
        'json',
        'junit',
        'blob',
      ],
      custom:
        'One-shot file-backed JavaScript completion adapters run initialization, final task-tree callbacks and owned close callbacks in a supervised reporter process. Live/watch hooks, package/TypeScript adapters and advanced task/context APIs remain unimplemented.',
      scope:
        'Final retry outcomes, full attempt evidence, mapped errors, attributed output, attachments and snapshot summaries; fresh machine reports after cleaned development Node/RSC watch generations. --merge-reports merges disjoint versioned Next blobs or projects validated Vitest 5.0.4 final tasks to JSON without compilation or fabricated Next history. Foreign coverage/pending/other reporters, full schema/terminal conformance, snapshot statistics and advanced custom adapters remain release work.',
    },
    testNamePattern: {
      supported: true,
      scope:
        'One-shot and initial watch selection using -t/--testNamePattern against full ancestor-qualified names; explicit --list --json --staticParse=false uses the same selection for collected name/file facts. Plain file listing does not accept name filters.',
    },
    typescriptConfig: {
      supported: true,
      scope:
        'Next, Vitest, and Vite test configs load in an isolated retained realm; compatible discovery, globals, setup/global setup and provided context are translated. Compiler overrides and unimplemented settings receive explicit errors.',
    },
    coverage: {
      supported: true,
      mode: 'development',
      environment: 'node',
      execution: 'opt-in one-shot',
      reports: ['json', 'text', 'lcov'],
      scope:
        'Route-less development Node tests accumulate real V8 hits across files and retries, including failed attempts. Bare --coverage retains mapped-line reports; explicit --coverage.* flags select standard JSON/LCOV for syntax-preserved JavaScript, source include/exclude, unimported zero-hit files, global percentage thresholds and reportOnFailure.',
      metric:
        'Bare coverage counts original lines with mapped generated spans. Standard coverage maps retained generated AST/V8 ranges to original statement, function and branch declarations, then derives Istanbul line totals. TypeScript/JSX declaration recovery and full provider parity remain unqualified.',
      unsupported: [
        'production, RSC, and browser coverage',
        'route context',
        'module-mocked artifacts',
        'watch',
        'combining coverage with snapshot updates',
        'coverage-provider compatibility',
        'TypeScript/JSX standard coverage',
        'custom providers and project-configured coverage',
        'non-JSON/LCOV standard reporters and advanced threshold modes',
      ],
    },
  },
} as const

export type TestCapability = keyof typeof testCapabilities.features

export function requireTestCapability(capability: TestCapability): void {
  const feature: { readonly supported: boolean; readonly reason?: string } =
    testCapabilities.features[capability]
  if (!feature.supported) {
    throw new Error(
      `Unsupported test capability "${capability}": ${feature.reason ?? 'This capability is not available.'}`
    )
  }
}
