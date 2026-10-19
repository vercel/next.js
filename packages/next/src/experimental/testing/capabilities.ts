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
    declarationModifiers: [
      'skip',
      'only',
      'todo',
      'fails',
      'skipIf',
      'runIf',
      'concurrent',
      'describe.shuffle',
    ],
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
    artifacts:
      'Node recordArtifact(task, artifact) retains serializable custom artifact data, original task attribution, mapped locations and supported attachments for started tasks while their file remains open. Live custom-reporter hooks, Browser artifact parity and collected-but-unrun tasks remain unqualified.',
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
      'concurrent',
    ],
    hooks: [
      'beforeAll',
      'afterAll',
      'beforeEach',
      'afterEach',
      'aroundEach',
      'aroundAll',
      'onTestFinished',
      'onTestFailed',
    ],
    fixtures: {
      api: 'test.extend',
      scopes: ['test', 'file', 'worker'],
      workerLifetime:
        'Isolated files own their worker cache through file cleanup. Explicit serial development Node isolate:false cohorts share worker fixtures across files and dispose them after the cohort; broader worker/profile interactions remain unqualified.',
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
      'expect.unreachable',
      'augmentable Assertion and AsymmetricMatchersContaining',
    ],
    assertionHelpers:
      'vi.defineHelper preserves callable types, receivers, arguments and return/rejection values. Development Node and Chromium diagnostics present the outer helper caller while retaining raw stacks. Chromium qualification covers nested, async and soft failures in the five-case development fixture; broader Browser modes remain unqualified.',
    typeAssertions: ['assertType', 'expectTypeOf'],
    typeAssertionScope:
      'Pinned expect-type primitives and TypeScript/editor assertions. One-shot tsc type-test files use the consumer TypeScript compiler in an owned process; original AST spans attribute diagnostics without evaluating callbacks. Focused type tasks, build, alternate checkers, watch/list/debug and full type-tooling conformance remain unqualified.',
    inSourceTests:
      'includeSource marker discovery and native exact-entry AST substitution share the active Vitest facade in fresh Node files. Ordinary app compilation defaults the marker to false for production removal. RSC, browser, cohorts and typed importMeta subpaths remain unqualified.',
    chaiAssertions:
      'Chai 6 compatible assert, should and chai namespace APIs with plugins, utilities and legacy Assertion settings. Development Chromium includes chai/should namespace routing and plugin assertions; attempt/file scope access guards.',
    assertionModifiers: ['not', 'resolves', 'rejects'],
    verifiedMatcherSubset: [
      'toBe',
      'toEqual',
      'toThrow',
      'toHaveBeenCalled',
      'toHaveBeenCalledTimes',
      'toHaveBeenCalledWith',
      'toHaveBeenExhausted',
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
      'vi.when',
      'vi.isWhenChain',
      'vi.clearAllMocks',
      'vi.resetAllMocks',
      'vi.restoreAllMocks',
      'vi.stubGlobal',
      'vi.unstubAllGlobals',
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
      'Standalone fake-timers 15.4.0 with the published Vitest 5.0.4 patch; Node supports Date-only and async clock operations, project fakeTimers config, and waits using captured real deadlines. Node child workers cannot fake nextTick.',
    browserRealWaits:
      'Serial development Chromium client files support vi.waitFor/vi.waitUntil with captured real timers, detached calls, immediate values, async polling, error/timeout/thenable behavior and pending waits through afterAll or the following case. File cleanup stops unused waits without draining or synthetic rejection. Late snapshot or async/soft/custom-matcher failure attribution, other browsers and other profiles remain unqualified.',
    browserFakeTimers:
      'Serial development Chromium supports per-call vi.useFakeTimers, Date-only system time, timeout/interval cancellation, synchronous and asynchronous advancement, timer counts and restoration with public vi return identity. The measured corpus includes nested timers and promise continuations, waits advancing the active clock before each callback, cross-case clock persistence and callbacks with live common or held local expectation state. Explicit restoration discards pending callbacks. Frame/tick-mode/microtask-option breadth, other browsers and other profiles remain unqualified.',
    browserFakeTimerConfig:
      'Serial development Chromium forwards numeric project fakeTimers now, selected toFake arrays, loopLimit and shouldClearNativeTimers. Per-call options shallowly override project defaults and replace toFake arrays. The measured corpus covers inherited loop limits, Date-only selection and native timer cancellation with an explicit per-call override. Date-valued project time, broader option combinations, other browsers and other profiles remain unqualified.',
    browserRetryRepeats:
      'Serial development Chromium supports numeric project retry defaults and suite/test retry and repeat counts. Published context, task, signal and local expect identities persist across attempts. Recovered retries report a passed logical case while retaining earlier attempt diagnostics; a failed repeat keeps the logical case failed. The measured serial corpus covers inherited and overridden counts, hook counters, runtime skip, blocked suites and independent hook/file failures. Object retry, concurrency, deadline/cancellation breadth, exact URL-bearing stack presentation, other browsers and other profiles remain unqualified.',
    equalityTesters:
      'expect.addEqualityTesters shares the pinned recursive/asymmetric matcher registry across expectation instances; file disposal removes owned registrations.',
    runtimeUtilityConfig:
      'File-owned shallow setConfig/resetConfig, mutable clock/reset/poll/assertion settings and declaration-time timeout capture. Concurrent utility-mutation interactions remain unqualified; hook groups support stack, list and bounded parallel ordering.',
    importSettling:
      'The emitted Node/RSC runtime tracks real chunk/external loads and asynchronous module evaluation. Repeated captured real turns include unreturned nested imports; cleanup cancels waits and restores loader descriptors.',
    utilityLifetime:
      'File-owned clocks, global/environment stubs and mocks; explicit restore or final realm disposal releases resources. Development Chromium global stubs retain descriptors and explicit cross-case lifetime, with fluent mock/global utilities returning its public vi facade. While the Browser file remains open, bare/extracted expect follows common test state and held context.expect retains local state; completed test assertion counts are not revalidated. Other utility access retains its existing scope checks.',
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
      unsupported: [
        'complete concurrent hook/timeout/resource-mutation qualification',
      ],
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
      'complete concurrent timeout/snapshot/resource-mutation interactions',
      'complete around-hook failure/timeout conformance',
      'full Vitest task/result introspection',
      'shared worker profiles beyond serial development Node cohorts; rest/nested/computed fixture dependencies',
      'untransformed vi.mock/vi.importActual/vi.hoisted',
    ],
    differences: [
      'Assertion counts finalize before afterEach, fixture teardown and listeners; later assertions remain observed without changing the completed count check.',
      'Final assertion/spy disposal errors fail attempts but do not re-enter failure listeners.',
      'Failure listener receives supported TestContext, not full Vitest task/result inspection.',
      'Static factory mocks require compiler transformation and retain the profile-specific bounds listed under staticFactoryMocks.',
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
    routeContextScope:
      'Explicit development RSC routes use the actual AppProject page, loader tree and request stores. Full layout/HTML, production/watch and broader route semantics remain unqualified.',
    fileIsolation:
      'Fresh realms by default; explicit isolate:false uses serial development Node compiler cohorts with parent-owned worker and artifact cleanup.',
    browser:
      'Node drivers with real development/production Next applications, plus bounded serial development Chromium client-realm files with immutable collected case identities and async suite/case hooks and around hooks; broader browser async compatibility remains unqualified.',
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
        'Bounded Node/RSC file workers for one-shot execution and development watch; browser client files and browser/application leases run serially.',
      sharding:
        'One-based INDEX/COUNT; root-relative physical-path SHA-1 hashes after filtering, stable balanced contiguous partitions, then fresh-run project name and descending file size order. More shards than files require passWithNoTests; allowed empty assignments publish zero-test results.',
      mixedProfiles:
        'Development/production Node/RSC projects run in separate supervised processes, serially to preserve configured output ownership.',
      unsupported: [
        'concurrent browser-client cases',
        'watch sharding',
        'unqualified concurrent timeout/snapshot/resource-mutation interactions',
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
        'Compiler-transformed static declarations in development Node, route-less RSC and development Chromium client entries, plus bounded production Node factories. Ordered setup-file registrations retain native input generations in development Node.',
      targets:
        'String-literal and type-safe literal import() ESM targets with static exports, including compiled package sources, resolved through the actual Next compiler context.',
      factories:
        'Inline synchronous or asynchronous factories with statically known object export keys; partial spreads only from compiler-verified awaited importOriginal namespaces.',
      bindings:
        'Factory object properties, including spread scalars, are captured values. Actual namespaces retain their live bindings and identity; static and dynamic mocked consumers share one compiler-owned namespace.',
      helpers:
        'Validated vi.hoisted declarations, literal vi.importActual and supplied importOriginal callbacks use compiler-owned source identities. Route-less development Node supports literal vi.importMock and hoisted vi.unmock, including ordered setup overrides, cached factory/manual namespaces and fresh automatic mocks. Development Chromium also supports literal local ESM importMock/unmock in the bounded Browser scope below.',
      browserImportMock: {
        scope:
          'Route-less development Chromium entries with literal local ESM targets, without setup files, serializers or module-cache resets; cached factory/manual namespaces and hoisted unmock ordering are retained.',
        automatic:
          'The actual Browser loader evaluates a separate original root. Root evaluation and the first mock pass are cached by resolved target, captured native timestamp and automock/autospy mode; each call returns a fresh outer namespace retaining cached mock functions. Ordinary dependencies, cycle backedges and held normal namespaces keep their existing cache.',
        asynchronous:
          'Original top-level await, native failure identity and afterAll release use the real loader completion. Unused pending imports are not automatically drained at file teardown; the per-file Browser realm closes normally.',
        unqualified: [
          'full Vitest import.meta.url scheme and pathname layout parity',
          'broader Browser setup, reset, coverage, automatic/runtime mock combinations and other profiles',
        ],
      },
      cycles:
        'Development Node: one static target can lazily load a native-certified ESM original cycle, preserving pending ancestor bindings, new member awaits and namespace identity. Multi-target, dynamic-only, manual/setup and competing-actual cycles remain unqualified.',
      automatic:
        'Literal local ESM mocks without a factory use the pinned mockObject primitive; spy:true retains behavior and mock call state. Isolated Node named ESM consumers can spy on one leaf CommonJS implementation when its native static export table and actual import references certify every requested name. Later actual imports retain their separate reference evaluation.',
      manual:
        'Regular project-local __mocks__ ESM files redirect through the normal graph, preserving live exports, TLA and direct namespace identity.',
      unsupported: [
        'broader RSC/browser/production setup, reset and runtime mock combinations; automatic mocks outside the described Node/Browser subsets',
        'dynamic targets, queries, fragments, or import attributes',
        'CommonJS value/factory mocks, default/namespace/reexport/dynamic/require consumers, unknown export tables, helper graphs or cycles involving mocked originals',
        'CommonJS spies with setup, serializers, coverage, custom realms, in-source entries, inspectors, shared workers, RSC/browser or production',
        'protected framework/native, genuine external and spec-self targets',
        'use-client/use-server target boundaries',
        'arbitrary/computed/accessor export shapes or arbitrary spreads',
        'dynamic imports inside factories; use supplied importOriginal',
        'BOM-prefixed mocked specs',
        'captured spec-local bindings outside validated hoisted declarations',
        'static factories combined with runtime registration or module-cache resets; nonliteral actual/mock imports or unmock targets',
        'importMock/unmock outside route-less development Node or the bounded development Chromium subset, or inside hoisted callbacks/factories; unmock combined with hoisted dynamic imports',
        'setup registration outside qualified development Node input layers; direct returned namespace factories',
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
        'Development Node/RSC, Node browser drivers and serial development Chromium client files on POSIX; fresh execution, parent-owned browser/server leases, conservative invalidation, live terminal progress and interactive commands.',
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
        'Isolated production Node tests, route-less RSC dynamic-subtree tests and Node browser drivers use real production conditions. Registered component fixtures compile as genuine production App Pages with SSR and hydration. Browser drivers use a separately built application; instant() requires explicit production instrumentation.',
      unsupported: [
        'route or layout context for isolated tests',
        'prerender/PPR and Server Action transport for isolated RSC tests',
        'production automatic/manual/runtime mocks and broader setup/reset combinations',
        'RSC and broader transformed production coverage',
      ],
    },
    browserComponents: {
      supported: true,
      mode: 'development',
      modes: ['development', 'production'],
      browser: 'chromium',
      scope:
        'Registered standalone server fixtures rendered as real Next App Pages with SSR and client-boundary hydration; Node drivers select fixture IDs and pass JSON props.',
      registration: 'projects[].browserFixtures: { id, module, exportName? }',
      unsupported: [
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
      execution:
        'opt-in one-shot; explicit standard flags also support development watch',
      profiles: [
        'development Node',
        'production Node',
        'development Chromium client',
      ],
      reports: ['json', 'text', 'lcov'],
      custom:
        'Supervised provider hooks retain opaque original payloads and owned cleanup; broader provider services and transforms remain unqualified.',
      scope:
        'Real V8 counters cover syntax-preserved JavaScript in development/production Node and development Chromium client files. Explicit standard flags support development Node/client watch with validated per-entry replacement, initial/full-rerun source expansion and retained facts when cleanOnRerun is false. Development Node static mock coverage retains native source evidence. Bare --coverage keeps its separate one-shot development Node line metric.',
      metric:
        'Bare coverage counts original lines with non-whitespace mapped generated spans. Standard coverage maps retained generated AST/V8 ranges to original statement, function and branch declarations, then derives Istanbul line totals. Type-erasure TypeScript is qualified in development/production Node with unique authored associations and real counters, including proven direct variable-arrow bindings. Parent-selected untouched typed sources use the same native compiler profile without execution, with zero-only analyses, checked source/config inputs and exact runtime descriptor agreement. Other arrow forms, runtime-generating TypeScript, JSX, arbitrary effective-config dependencies and full provider parity remain unqualified.',
      unsupported: [
        'RSC coverage and production Browser Mode coverage',
        'route context',
        'runtime/CommonJS mocks and unqualified cross-profile mock coverage',
        'production watch and legacy line-coverage watch',
        'combining coverage with snapshot updates',
        'coverage-provider compatibility',
        'unqualified typed-source compiler configurations, non-variable arrow bindings, runtime-generating TypeScript and JSX standard coverage',
        'project-configured standard coverage and broader custom-provider service/transform dependencies',
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
