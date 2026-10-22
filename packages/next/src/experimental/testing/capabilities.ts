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
    publicDeclarationTypes:
      'The public vitest bridge exports TestOptions, SuiteOptions and TestFunction<ExtraContext = object>. Clean installed Bundler and Node16 consumers with skipLibCheck:false retain positive/negative option checks, generic fixture contexts and callback return types. Named OnTestFinishedHandler and OnTestFailedHandler aliases require void or PromiseLike<void>; context/global listeners retain that public contract through modifiers, tables, fixtures and suite factories. Internal collectors keep their actual broader callback return type, with byte-identical runtime JavaScript. The maintained appended declaration controls pass independently; the complete older fixture retains its existing invalid next-timer argument check.',
    nativeAsyncHookAssertions:
      'Actual isolated Node authored beforeEach and afterEach callbacks retain their own immutable phase and exact native Promise identities. The private hook observation flags are disabled elsewhere. Node26 development/production matches the measured afterEach seven-case statuses, error headers, native globals and complete lifecycle; ordinary body joins and external checkpoint failures retain their own behavior. Node20/22/24 retain the measured header and native-channel comparisons, while Node20/24 production pending-afterEach timer ordering remains a demonstrated gap. Actual returned beforeEach cleanup now retains its own cleanup assertion phase and exact native Promise through the real callback. Node26 development/production matches the measured seven-case statuses, native globals and full lifecycle; prior V8 reports and snapshot bytes remain held. Returned beforeEach cleanup is called with no arguments and an undefined receiver, retaining bound and lexical receiver behavior. The unchanged eight-case corpus matches development/production Node20/24/26, including the intended destructuring error. Production mixed Node chunks retain function strictness through the existing flat writer during minification; strict, sloppy and unminified writer branches retain their actual prior outputs. Cleanup budget behavior, hook snapshots/coverage, other fixture phases and rich diagnostics remain separate qualification work.',
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
    parameterizationTemplates:
      'Array and tagged-template each/for declarations retain the public target overloads. Tagged test.for preserves extended fixture context; strict clean-package types and the same six literal cases match the pinned target in development and production Node.',
    suiteAliases:
      'Extended and modified test APIs expose the public describe/suite facade with independent suite modifiers. Deprecated test.scoped delegates to the existing fixture override with the measured warning and receiver identity. Strict installed consumer TestAPI context types and the unchanged eight-case development/production Node corpus match the target; broader profile and type-tooling combinations remain unqualified.',
    fixturePropertyNames:
      'Fixture registrations and dependency values preserve valid names that shadow Object.prototype, including constructor, toString and __proto__. The unchanged development/production Node corpus covers static values, factory and builder dependencies, chained extensions, overrides and reverse cleanup, with strict installed bundler and Node16 types. Broader fixture/lifecycle/profile combinations remain unqualified.',
    suiteFactoryTestAPI:
      'Each direct suite factory receives a fresh base test API, distinct from the public test facade and other factories. The unchanged development/production Node corpus covers synchronous and asynchronous factories, hooks, extensions, nesting and skipped children; parameterized suite callbacks retain exactly their row arguments. Strict installed bundler and Node16 types match the reference. Broader profiles and API combinations remain unqualified.',
    unicodeFixtureDependencies:
      'Ordinary and builder fixture factories accept ECMAScript Unicode identifier dependencies, including aliases and nested destructuring. The unchanged two-case development/production Node corpus retains its complete setup, override and cleanup trace. Existing rest/computed-pattern limits and broader fixture/profile combinations remain unqualified.',
    typescriptImports:
      'Development and production Node test imports fall back from unresolved relative .js paths to .ts/.tsx, .mjs to .mts and .cjs to .cts through the actual test compiler context. Existing JavaScript files retain precedence and application resolution is unchanged. This does not change CommonJS module-format rules or qualify every TypeScript syntax/profile combination.',
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
    hookContextTypes:
      'The six global lifecycle hooks accept explicit extra-context type parameters and their measured suite arguments. Strict clean installed consumer types and the same nine-event development/production Node trace match the target. Fixture-wrapped before/afterEach retain the measured absent suite argument; broader suite-context fixture access remains unqualified.',
    concurrentSuiteOwnership:
      'Queued cases and sibling suites retain their enqueue-time asynchronous ancestors, FIFO reservations and separate concurrency budgets. Clean installed development/production Node runs match all five nested failure cases, the complete 51-event trace and both genuine suite errors; the four-case overlap control and strict Bundler/Node16 types also match. Broader timeout, clock, snapshot and worker-profile combinations remain unqualified.',
    concurrentTimeoutOwnership:
      'Only an attempt that captures its own deadline aborts its signal during cleanup. A healthy concurrent sibling retains its live signal, fixture teardown and listeners; unopened-work poisoning and real-work settlement fences remain unchanged. The three-case development/production Node corpus retains the complete 39-event inventory and functional outcomes with strict installed types. Actual case-body deadlines retain the genuine complete timeout message and real declaration-origin stack from a nonenumerable registration Error. Explicit, runner and collection budgets are covered; registered timeout budgets remain invariant through supported runtime-config changes in retries/repeats. Cooperative aroundEach setup/teardown deadlines retain the actual wrapper operation, distinct captured registration Errors for each phase and genuine processed names, messages and saved declaration origins. New work resumes only after the real wrapper, fixtures, assertions, cleanup and async scopes close; an unsettled wrapper still cancels unopened work, while healthy concurrent siblings keep live signals. Four clean installed development/production corpora retain all 38 and 18 events and phase error origins with strict types. Settled case-body timeouts admit the next retry/repeat of the same logical case after actual teardown and scope closure; unopened or foreign unresolved work remains blocked. Successful later ordinary retries account for every same-case body deadline before final publication, retaining disposal, late-error and snapshot rollback checks. The clean Node corpus matches eight complete retry/repeat reports, four snapshot update/read reports, strict consumer types and both complete V8 coverage reports. The measured eighteen body-timeout frames now use uniquely associated authored call origins from the actual leased JavaScript, maps and retained entry bytes. Raw Error fields and stacks remain intact; absent, ambiguous, foreign, stale or imported-helper associations keep the existing diagnostic. Supported serial development Node cohorts retain their actual selected-file origins. Settled expected-failure body deadlines account only for their own actual completed operations after teardown and listeners close; ordinary retries retain their separate same-case accounting. Clean development/production Node now retains complete snapshot update/read reports, nine events and exact bytes, and coverage publication preserves all prior maps/counters. The measured raw JavaScript numeric conditional consequent endpoint now retains its authored terminal through unique actual AST/native-map associations; complete coverage descriptors and counters match in both Node modes. Broader branch shapes remain coverage work. Unsettled expected-failure operations and final-failed snapshot publication remain explicit compatibility gaps. Measured beforeEach, afterEach and returned beforeEach cleanup deadlines retain the complete native Hook timeout message and original registration frames across stack, list and parallel ordering in isolated development/production Node. Eighteen complete public rows and six clean installed profiles match; actual Error fields, budgets, abort identity, poisoning and continuation policies remain held. Registered authored beforeAll and afterAll callbacks also retain complete Hook timeout messages and declaration frames in stack, list and parallel ordering. Twelve complete ordinary and twelve clean installed Node development/production profiles match; twenty-eight further budget and multiple-hook profiles preserve explicit zero, inherited limits and healthy siblings. All 476 affected owner controls retain the old 467 byte prefix and nine appended cases. Generic integration, finalizer, disposal and returned-All-cleanup deadlines retain their existing behavior. All-hook error ownership beyond the qualified Node completion adapters, broader rendered failure text, hook publication, aroundAll recovery and combinations remain release work.',
    fixtures: {
      api: 'test.extend',
      scopes: ['test', 'file', 'worker'],
      workerLifetime:
        'Isolated files own their worker cache through file cleanup. Explicit serial development Node isolate:false cohorts share worker fixtures across files and dispose them after the cohort; broader worker/profile interactions remain unqualified.',
      options: ['scope', 'auto', 'injected'],
      injected:
        'Node development/production object-form tuples resolve provided values at registration, with nullish fallback to the declared value or lazy factory. Explicit false, zero and empty strings are retained; suite overrides preserve their own injection setting. Browser fixtures and all builder overload combinations remain unqualified.',
      fileAssertions:
        'Development and production Node file fixtures retain a live assertion owner through shared concurrent setup and deferred cleanup. Global soft assertions and snapshots use only a currently live case; completed cases cannot supply an identity during teardown. The unchanged 21-case reference corpus retains complete file outcomes, traces and snapshot counts, including intentional setup and cleanup failures. Local context.expect counts remain case-owned; worker-fixture and broader profile combinations remain unqualified.',
      overrides: 'test.override object syntax, scoped to the declaring suite',
      builderReceivers:
        'Development/production Node extend and override dispatch through the actual receiver, including borrowed methods and the public facade. Extend returns a fresh unmodified run API; override retains actual receiver identity and current suite scope. Complete nine-case/thirteen-event reference corpora, strict installed types and a six-case/eight-event serial development cohort retain cached receiver ownership. Options-only normalization, describe registration timing and broader receiver/profile forms remain unqualified.',
      dependencies:
        'object-destructured names, aliases, defaults and the bounded unicodeFixtureDependencies nested-destructuring subset; rest/computed and broader dependency forms remain unqualified',
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
      'Chai 6 compatible assert, should and chai namespace APIs with plugins, utilities and legacy Assertion settings. Development Chromium includes chai/should namespace routing and plugin assertions; attempt/file scope access guards. Configurable function-valued Chai namespace prototype data/getter/setter descriptors preserve actual flags, lazy calls and live-scope callable/constructor identity through the existing receiver/result/scope checks. All496 affected controls preserve the old495 names and duplicates; four maintained children and both ordinary/clean installed modes match allnine complete cases. Collection-created plugin callables crossing into later cases, nonconfigurable/object-valued descriptors, raw reflection and broader profiles remain unqualified.',
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
      'Standalone fake-timers 15.4.0 with the published Vitest 5.0.4 patch; Node supports Date-only and async clock operations, project fakeTimers config, and waits using captured real deadlines. Node child workers cannot fake nextTick. Public setTimerTickMode overloads preserve a single argument for manual/nextTimerAsync and an optional numeric interval only for interval mode, including detached/fluent types. Strict genuine and fresh installed Bundler/Node16 consumers match; all309 affected controls, the old maintained type diagnostic and emitted utility/facade runtime bytes remain held.',
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
      publicHelpers:
        'Snapshots exposes toMatchSnapshot, toMatchInlineSnapshot, toMatchFileSnapshot, toMatchDomainSnapshot and toMatchDomainInlineSnapshot through the actual custom matcher receiver and existing assertion/snapshot owner. Ordinary isolated development/production Node retains complete five-case update/read/failure reports, events, processed public task errors, exact managed snapshot bytes, automatic custom/domain inline updates and the empty optional-properties inline count. Four strict Bundler/Node16 TypeScript consumers match. Staged parent publication, closed-owner guards and existing failure-publication differences remain; Browser, cohorts, polling, expected-failure and broader domain/custom-environment combinations remain unqualified.',
      default: 'create missing snapshots locally and in watch; read-only in CI',
      update:
        'new-only locally, or explicit all with --update/watch u; coordinated external, inline, and raw bytes require authoritative parent completion and cleanup. Isolated one-shot development/production Node also publishes measured fully settled body failures after every selected entry, compiler, worker and source transaction closes; host/project diagnostics veto this failed-outcome branch',
      profiles:
        'route-less development and production Node/RSC/browser; browser commits after browser and application-server disposal',
      failedBodyPublication:
        'The private default remains disabled outside isolated Node workers. Thirty complete portable report/event/status rows and twenty-six exact snapshot phase/profile comparisons cover fresh/update/filter/legacy and external/inline/raw transactions, with four strict TypeScript consumers. Isolated development/production Node also publishes measured fully settled soft, assertion-count and owned promise/consumption body failures. Existing assertion records retain the actual attempt and async phase; only the exact settled native finish emission supplies this private fact. Hook, fixture, cleanup, late-owner, timeout and host-error publication vetoes remain. Twenty complete portable phase reports with exact snapshot bytes, four full negative comparisons, ten complete Istanbul reports and four strict consumers pass. Filtered CI key order, async-function unawaited diagnostic details, final-failed timeouts, coverage with explicit updates and broader profiles remain explicit differences.',
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
      'shared worker profiles beyond serial development Node cohorts; rest/computed and nested fixture dependencies beyond the unicodeFixtureDependencies subset',
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
    runtimeWindow:
      'Node test graphs retain runtime typeof-window observations, including actual global stubs and installed DOM providers; ordinary application server/client contexts keep their own compiler folding. The unchanged two-case development/production Node corpus compares actual stubbed and restored branches and complete reference rows. Broader global/compiler/profile combinations remain unqualified.',
    routeContext: false,
    routeContextScope:
      'Explicit development and production Node RSC routes use the actual AppProject page, loader tree, effective route configuration, manifests and request stores for a supplied subtree. The measured ASCII and encoded route corpora retain params/root params, headers and cookies, plus actual new/existing production snapshots. Normal dynamic-param helpers encode user-facing root and catch-all values after decoded logical request validation, matching ordinary app requests for spaces, Unicode, literal percent and encoded slash. The separate rsc.renderRoute and rsc.renderRouteStream helpers render actual ancestor layouts and buffered or streaming HTML/Flight for the qualified explicit force-dynamic route contracts described under features.rscRouteRendering. Implicit routing, production watch, static/cache/PPR and broader route semantics remain unqualified.',
    routeDefaultSlots:
      'Explicit force-dynamic development/production Node initial HTML/Flight rendering includes actual default-only named slots through the real AppProject loader tree. Eight installed cases match complete ordinary application rows for root and nested routes, both default slots, provider/client context, root params, repeated queries, headers, cookies and after callbacks. Existing unique-page/AppPath, named-page/interception, Node runtime and dynamicParams gates remain. Matching named slot pages, navigation, static/PPR/actions, streaming and broader hydration remain unqualified.',
    routeNotFound:
      'Explicit force-dynamic development/production Node rsc.renderRoute retains ordinary root and nested notFound boundary HTML404 and Flight200 results. Eight complete normal application and test rows match, including the following healthy provider, client, query, params, request and after-callback observations. Maintained physical-package verification preserves authored fixture and reference bytes. Broader implicit routing, navigation, streaming, static/cache/PPR and boundary combinations remain unqualified.',
    routeAuthInterrupts:
      'The measured explicit force-dynamic root and nested forbidden/unauthorized renderRoute contracts retain ordinary HTML403/401 and Flight200 interruption digests, followed by healthy rendering in the same leased application. Sixteen complete development/production normal application and test rows match through maintained physical-package verifiers. Auth interruption configuration remains explicit; broader boundary and execution combinations remain unqualified.',
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
        'Explicit --inspect [host:]port opens the debugger in the actual isolated file worker. One-shot execution requires one active file worker; --no-file-parallelism selects that limit. Explicit --inspectBrk and --inspect-brk pause at worker entry before authored evaluation, with genuine CDP resume and paused cancellation in development/production Node. Break-zero selects the measured default port; ordinary inspect-zero stays ephemeral. Coordinator/compiler arguments are not inherited.',
      unsupported: [
        'watch debugging',
        'coverage with debugging',
        'first-authored-line pause equivalence and long debugger pauses',
        'individual editor selection, debugging and snapshot controls',
      ],
    },
    scheduling: {
      supported: true,
      maxWorkers: { default: 1, minimum: 1, maximum: 64 },
      workerPercentages:
        'Explicit --max-workers, familiar --maxWorkers and maxWorkers configuration accept host-relative percentages with the measured reference parseInt, rounding and host clamp, followed by the existing 1..64 scheduling budget. The unchanged two-file development/production CLI corpus matches complete cases and rows; percentages resolving above 64, broader defaults and browser/watch combinations remain unqualified.',
      scope:
        'Bounded Node/RSC file workers for one-shot execution and development watch; browser client files and browser/application leases run serially.',
      inputAcquisition:
        'Initial and later input snapshots retain the complete existing baseline and publication barriers. A cooperative32-slot scheduler refills completed reads while slow paths retain their slots; cancellation and failure join every started operation. Sixty old watch controls and four real held-read/fact/closure controls pass, as do the unchanged rapid/config/snapshot startup deadlines and fresh development/production component/setup watch runs with twelve generations, twenty-four full reference rows and four active cancellations. Keyed consumers do not rely on map insertion order; simultaneous filesystem failures now retain the first observed original error rather than the first failed input in a former batch. Full composed regression qualification remains required.',
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
    editorControls: {
      supported: true,
      scope:
        'One-shot --api discovery advertises cancellation and the actual running ID. POST /v1/runs/<encoded ID>/cancel acknowledges before entering the existing SIGINT cleanup path; stale or terminal IDs are refused. Physical development and production Node runs retain exit 130, cancelled summary, complete cleanup phases, omitted snapshot updates and released API, locks, revisions and owned processes. Existing three-argument API callers remain read-only. Explicit development and production Node --watch --api keeps discovery across generations and advertises full-run rerun and cancellation. POST /v1/runs/<encoded ID>/rerun schedules the current settled generation through its actual watch owner; repeated commands schedule once and stale/running IDs are refused. The same unchanged actual CLI body passes four generations in each Node mode, retaining full rerun, active cancellation, recovery, all fixture/listener/afterAll cleanup and released API/locks, with the original20s readiness checks. All1006 composed tooling/lifecycle/rendering controls pass; fresh packed production terminal watch also passes with identical installed runtime bytes. Exact physical-file/profile reruns use POST /v1/runs/<encoded ID>/files/<encoded entry ID>/rerun for isolated development and production Node watch without coverage. The current settled catalog is retained; duplicate same-file commands schedule once, conflicting/stale/running/unsupported actions are refused, and full rerun/cancellation/recovery retain actual ownership. The same actual CLI body passes seven real generations and thirteen authored body/finished/cleanup rows in each mode, including exact file/profile selection, full rerun, active cancellation, recovery and final owned shutdown under the unchanged deadlines. All397 CLI controls pass with repository types/lint/style; the existing deterministic selected-file removal after acknowledgement still fails without running another file or applying passWithNoTests. Clean installed production file-control admission is verified separately; broader runtime/platform lifetime combinations remain unqualified. Individual case selection, editor debugging, snapshot updates, coverage, broader globalSetup/profile combinations and existing-extension compatibility remain unqualified.',
    },
    nativeBrowserWheel: {
      supported: true,
      scope:
        'Development and production Chromium userEvent.wheel and Locator.wheel use native hover and wheel events for measured pixel deltas, named directions and repeated steps. Eight complete reference cases/rows retain native scroll effects and controlled React render turns. Fake-clock/RAF interactions, other engines and wider profile combinations remain unqualified.',
    },
    nativeBrowserTyping: {
      supported: true,
      scope:
        'Development and production Chromium client userEvent.type accepts Element or Locator text with measured skipClick behavior; userEvent.keyboard operates on the active element with bounded text and named editing/selection descriptors. Twelve complete reference cases/rows retain native events, caret/focus, BMP Unicode and controlled React render turns, including recoverable authored action errors and terminal malformed transport. No Locator.type alias is added. Independent userEvent.setup instances and the default instance retain measured modifier, repeat and release state across commands. Type skipAutoClose retains the measured native-release/bookkeeping behavior. Default keys close before the next attempt and file disposal, including after authored failures; setup-owned keys retain their own lifetime. Twenty-four complete reference cases/rows across both modes include the intentional failure and following clean case per profile. Factory-owned copy/cut/paste delegate to the actual native ControlOrMeta keyboard descriptors and retain setup-owned key lifetimes. Eight complete development/production Darwin Chromium cases and event/clipboard/input/component rows match; all forty-four earlier keyboard/held-key/wheel rows remain held. Physical [code] descriptors now resolve the measured default-map letter, digit, bracket, space, editing and left/right modifier codes case-insensitively to the actual native key, preserving existing release/repeat grammar and held state. All22 complete development/production Chromium native-event/component rows match the reference in ordinary and fresh installed runs, including canonical left modifier events for right-side aliases. All497 focused controls and unchanged typing12, held24, clipboard8 and native-action cancellation in both modes pass in the owner; twelve direct ownership controls pass on Node20/22/24/26, with real Browser proof on Node26 only. Progress callbacks remain synchronous. Other default-map codes, clipboard forms/platforms, wider setup/options, other engines and the supplementary-Unicode reference defect remain unqualified.',
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
      staticImportOriginalCallback:
        'The supplied static factory importOriginal callback is an ordinary zero-argument Function. Eight complete freshly packed development/production Node20/22/24/26 callback rows retain every function descriptor, brand and original evaluation count. The existing inner async operation, Promise adoption, shared deferred original and owner fences remain unchanged. All1081 compiler/mock/execution controls pass with the complete old1080 names and606 compiler-test source prefix held. Browser and broader callback/profile combinations remain unqualified.',
      commonJsOriginals:
        'Isolated development Node literal vi.importActual admits compiled CommonJS object, callable-default, esModule, primitive and Promise exports, retaining normal namespace/cache identity. Aliases of the resolved target share an inner original-import promise, including fulfilled/rejected then adoption, while API calls return fresh outer promises. CommonJS-exported Promises remain default values in ordinary application imports as well. The bounded callable publication path described under callablePublication separately qualifies selected actual namespace presentation; combinations with module-cache reset and broader cross-profile combinations remain unqualified.',
      commonJsImportMock:
        'Isolated development Node literal vi.importMock automatically mocks compiled CommonJS object, esModule, primitive and falsy esModule exports. Ordinary callable originals publish the same named getters before their default data descriptor, retaining complete key order, mock identities and cached original evaluation across seven measured callable forms. Twenty-eight complete ordinary rows and four independent alias/laziness rows match across Node20/22/24/26 through a fresh installed package. Automatic mocks remain fresh and unused targets remain unevaluated. Certified async/generator callable publication now has sixteen complete matching rows, and four richer callable rows also match. The separate thirty-two truthy-export profiles retain twenty complete matching rows and twenty-eight passing bodies; hidden/default/getter flag forms remain measured gaps. Direct then-adopted root automocking, module-cache resets and other execution profiles remain unqualified.',
      callablePublication:
        'Isolated development Node literal importMock/importActual helpers publish compiler-certified successful leaf CommonJS FunctionBinding namespaces at actual module completion. Unique helper owner, typed request, raw require/resolve target and module-cache record associations preserve named-key order, inherited enumerable getters, default data descriptors, raw exports and strict function receivers. Partial or already published namespaces retain their old behavior. All1088 compiler/mock/execution controls and147 distinct Rust controls pass;128 complete mutation/namespace/getter/receiver rows match across Node20/22/24/26, with48 clean installed rows and30 unmarked Node/Browser rows. Only certified factories become strict, and three actual post-factory runtime consumers preserve the own publication marker. One exact top-level self-default binding assignment with exactly one literal true flag now retains the actual completed namespace and full original strict reset-certificate identity through a separate optional publication certificate. All1090 owner tests and150 distinct Rust controls pass, with44 new complete four-engine rows,92 installed rows and all prior128 publication/636 legacy rows held. Original truthy profiles improve from16 to20 complete rows outof32 while28 bodies pass; the other12 complete-row gaps remain open. Other truthy/default/getter variants, authored require consumers, cycles/reset/partial boundaries, broader TLA/Promise behavior and other profiles remain unqualified.',
      commonJsFactories:
        'Isolated development Node admits compiled CommonJS and empty CommonJS targets with explicit object factories whose authored export keys are statically known and contain no spreads. Replacements leave the original unevaluated unless importOriginal is requested; repeated original imports retain namespace/cache identity. Local object/default replacements and the unchanged server-only jsdom example are qualified. Other shapes, runtime registration, resets and execution profiles remain unqualified.',
      virtualBareFactories:
        'Isolated development Node explicit object factories may supply truly unresolved bare package requests, including scoped subpaths. Actual virtual compiler sources preserve one cached factory namespace across static, dynamic, transitive and reexport consumers, including descriptors and mutation. Literal vi.importMock returns the cached raw factory object, distinct from the graph namespace while retaining shared default/function mutations. Missing relative paths, configured ignored requests and genuine externals retain their prior admission. Missing-original error code, cause and importer parity, runtime registration/reset combinations and other profiles remain unqualified.',
      nodeBuiltinFactories:
        'Isolated development Node explicit object factories support native-certified Node builtin targets through project-local ESM consumers. Actual builtin identity unifies matching bare/node spellings and helper factory objects while lazy original imports retain native namespaces. Framework and dependency loaders keep their ordinary resolution. Literal importActual and ordinary static/dynamic native namespaces retain certified bare/node builtin identity on Node 22.12, 24.0 and 26. Mixed compiled importMock/importActual helpers reuse the exact eager registration module when ordinary builtin or external CommonJS imports occur in the same file. Complete measured reference rows retain namespace descriptors and registration identity. Hoisted builtin unmock respects certified bare/prefixed identity and declaration order without invoking cancelled factories; complete ordering rows match Node 22.12, 24.0 and 26. Configured certified spellings retain their independent resolution. Global bare-path aliases crossing framework consumers, CommonJS mock consumers, qualified requests, runtime registration/reset and other profiles remain unqualified.',
      nativeExternalPackages:
        'Isolated development Node explicit object/async factories support actual queryless native external packages through project-local ESM consumers. Lazy originals and ordinary external ESM edges retain genuine native namespaces, import conditions and static/dynamic identity. Native-captured regular package bytes and declared dependency topology preserve the measured shared diamond, CommonJS cycle and package data. Complete seven-case reference rows match on Node 22.12, 24.0 and 26 on macOS arm64. Literal importActual retains actual CJS/ESM lazy-original identity and native conditional static/dynamic namespaces through exact-field memoized native modules. Hoisted vi.unmock preserves both cut orders, unrelated factories and complete cancellation without invoking canceled factories. These complete reference rows also match Node 22.12, 24.0 and 26. CommonJS mock consumers, internal package symlinks, undeclared filesystem dependencies, native addons, runtime/reset combinations and other profiles remain unqualified.',
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
        'CommonJS mocks beyond the explicit object-factory and original-import subsets above; unqualified reexport/dynamic/require consumers, unknown export tables, helper graphs or cycles involving mocked originals',
        'CommonJS spies with setup, serializers, coverage, custom realms, in-source entries, inspectors, shared workers, RSC/browser or production',
        'protected framework/native and spec-self targets; genuine external targets beyond the bounded native package factory/actual/unmock scope',
        'use-client/use-server target boundaries',
        'arbitrary/computed/accessor export shapes or arbitrary spreads',
        'dynamic imports inside factories; use supplied importOriginal',
        'BOM-prefixed mocked specs',
        'captured spec-local bindings outside validated hoisted declarations',
        'static/runtime/reset combinations outside isolated development Node literal compiler-certified native pairs; nonliteral actual/mock imports or unmock targets',
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
        'Isolated development Node entries; direct imported vi/vitest calls with literal project-local leaf ESM targets and bounded compiler-certified native CommonJS/ESM package or builtin targets. Inline factories retain statically named object exports; straight-line throw-only factories require the existing native or compiled leaf-ESM certificate.',
      behavior:
        'Factories retain lexical closures and run lazily. Future direct dynamic imports use the registered namespace; re-registration and unregistration preserve already held namespaces. Actual module-cache reset preserves registrations and successful cached factory results. Certified native targets retain exact actual namespace/source identities. Pending compiled leaf and certified native factory overlap returns the original to the second consumer, including measured cold, synchronous and immediate-async ordering; failed factories retry with fresh wrappers retaining their exact cause. Native registration/unregistration without imports evaluates neither source nor factory. Literal certified native static factories can pair with runtime registration/reset in the same isolated development Node entry. Actual static namespaces remain protected while provider IDs reset; held static/runtime values, pending resolution/rejection, failed factory retries and unmock-first behavior match all 72 complete rows across Node20/22/24/26. Unused pairs execute neither source nor factories.',
      compiledStaticGraphs:
        'Isolated development Node explicit-object runtime factories support measured static relative queryless project ESM graphs, diamonds and cycles. Actual compiler module references bind sync static reads of completed mock namespaces and seed the existing dependency reset closure; only actual target parts alias the root. Thirty-two complete main/configured-alias rows across Node20/22/24/26 retain original/mock/reset/unmock, held namespaces, failed factory recovery and zero unused evaluations. Bounded distinct declared compiled factories start at actual certified static-import demand, with source-ordered real live namespaces and reset ownership anchored to current module cache records. The four-engine corpus retains112 complete reference rows for factory start/lifetime, namespace/getter/cycle/reset behavior, exact causes and namespace hygiene. Native imports mixed into these demanded graphs, broader async/dynamic/CommonJS graphs, static/runtime mixtures and other profiles remain unqualified; their diagnostics remain boundaries only.',
      globalSetupWatch:
        'Root JSON configuration with one isolated, route-less development Node project and no custom or standard coverage retains the actual fully fulfilled globalSetup context across watch generations. Each run receives a fresh clone, initial pending/failed/cancelled setup remains generation-owned, configuration replacement joins the old teardown, and final teardown follows actual run/fixture/afterAll drain. Thirteen maintained controls and all462 affected tests pass; the unchanged22-event authored trace matches the reference. Setup-source edits still produce an extra automatic Next generation, and executable configurations, multiple/external projects, other profiles and coverage combinations remain open.',
      deferredLocatorHover:
        'Initially absent query Locators admit hover and unhover through the existing tracked native action owner and actual-page realm barrier; unhover retains body hover semantics and all native options. Fourteen maintained controls and all551 affected tests pass. Eight complete primary reference rows and eight separately authored companion rows match in development/production. Original tight60ms healthy/body probes remain unchanged and fail under measured genuine and Next runs; broader timing and full raw error-stack parity remain open. Exactly two old negative-control inputs changed from hover to still-unsupported clear with direct user approval, retaining every assertion and expected result.',
      booleanEnvironmentStubs:
        'Node fallback vi.stubEnv treats exact DEV/PROD/SSR names with the measured truthiness to 1/empty-string behavior and undefined deletion; ordinary names retain primitive string coercion. Restoration captures the first value and retains fluent guards/disposal. An explicit generic public signature preserves boolean versus ordinary string constraints through the utility facade; other signatures and facade runtime bytes remain exact. Five appended controls and all309 affected tests pass; twelve cases/four authored traces and four strict genuine/clean-installed Bundler/Node16 consumers match. The old assertion/type prefixes and sole existing clock diagnostic remain held. Browser delegation and other utilities are unchanged.',
      suiteFactoryTypes:
        'The public type-only SuiteFactory export retains default/generic/primitive fixture intersections and PromiseLike<void> callbacks. Both direct suite declaration overloads infer an extra fixture context while retaining existing Context, void return and runtime collection behavior. Twelve strict genuine/clean-installed consumers pass under Bundler/Node16 with TS6 and skipLibCheck:false; four before/after maintained-fixture jobs retain only the pre-existing clock diagnostic. All304 affected controls and both five-case development/production CLI traces pass; emitted vitest/collector runtime bytes are identical. FixtureOptions/Use remain unexported because the pinned reference does not export them. No focused test-count increment, runtime algorithm or native/API transport change.',
      ownedWebKitHost:
        'The private WebKit host owns its installed SDK browser through public launch/bind/connect, authenticates the exact native context/page/shared session and reads actual frame/bootstrap bytes. Late launch/bind cancellation and partial acquisition join owned unbind/close; disposal is idempotent and preserves distinct errors. Ten new controls plus all490 host/server/execution tests pass; actual pinned SDK proof retains preconnection failure/recovery, exact GUID/bootstrap identity, unrelated-browser survival and empty registry/process cleanup. Omitted-engine Chromium paths remain unchanged. This qualifies only the internal host bridge; WebKit config/execution admission, classifier Promise semantics, coverage and Firefox remain open.',
      hookDeadlineSignal:
        'beforeEach, afterEach and returned beforeEach cleanup deadlines abort their exact case signal synchronously with the actual existing DeadlineError before rejection/publication. Twenty-seven appended controls and302 lifecycle/assertion/snapshot tests pass. Twenty-four measured public hook traces retain outcomes and the early abort/task-state boundary, with generic message differences still open; six ordinary throw traces remain exact without abort. Existing nonbody interruption, poisoning and publication rules remain unchanged. Twelve expected-failure exit differences and retry/repeat continuation differences remain unwaived. The redundant internal inline argument comment was removed to avoid an observed malformed native source-map coordinate; two complete namespace reports match, while the general compiler comment-mapping defect remains open. No native/public schema change.',
      returnedHookCleanupBudgets:
        'Serial returned beforeEach callbacks retain each hook local timeout, including explicit zero and inherited global budgets, without a second outer global cap. The existing parallel wrapper and all other cleanup callers retain their implementation. Twelve added controls and all275 lifecycle/assertion/snapshot checks pass. Twenty-four unchanged development/production public comparisons retain outcomes and cleanup receiver/argument rows; all12 successful extended controls retain complete authored event sequences. Timeout error text/origin and broader signal combinations remain open; hook-producer timing is qualified separately by hookDeadlineSignal. No native, transport or public schema change.',
      errorReflection:
        'Installed Node/Edge error formatters keep exact stack/frame-boundary metadata in a shared weak association rather than adding or overwriting authored Error properties. Pure module import does not install the cache. The existing stack-equality guard, fallback parser, headers and formatted output remain unchanged. Eighty actual development/production CLI cases retain all13 reflection/state fields against40 unchanged genuine cases across Node20/22/24/26. Twenty-eight consumer raw stacks, formatted strings and lookup sequences remain exact across module copies/formatter replacement, changed messages, frozen/sealed Errors and measured Edge/Node paths. One maintained test covers10 reflection and7 consumer controls; all170 original-unit/new checks and8 development overlay cases with6 snapshots pass. This fixes raw Error reflection while retaining framework formatting behavior; broader runtime combinations remain separately qualified.',
      deferredLocatorSelect:
        'Initially absent query Locators admit selectOptions through the existing native selection owner, preserving value validation before admission, string/scalar/array and element-handle paths, native options, event order, controlled React state and cleanup. Ten maintained controls and all561 affected tests pass. Fourteen new complete reference rows and150 preserved rows match in fresh development/production Chromium consumers, with both original25s native cancellation controls retained. No native/transport/schema or actual selectOption invocation changed. Other missing-query methods, broader engine behavior and full raw stack-text parity remain unqualified.',
      compiledEsmRuntime:
        'Isolated development Node compiled ESM leaf targets retain actual compiler-certified namespaces, original export order and authorized reset owners. Marked namespace code uses context.g builtins and pending-original fallback retains its actual owner. Optional multi-target graph-context inspection declines only typed unsupported candidates without emitting an issue; required graph admission retains exact old diagnostics, and operational errors propagate. Existing leaf top-level-await loading consequently works beside a second unused runtime target. All1075 compiler/mock/execution tests and129 next-api tests pass in the owner. All636 prior complete rows,12 ordinary-TLA rows,136 prior CJS/native rows,24 boundaries,four original-cycle andeight cancellation rows match across Node20/22/24/26, including the corrected Error reflection behavior. Unmarked output bytes/manifests remain exact. Exploratory literal-object factories execute64 cases but eight p/q completion-order rows still differ; returned-importOriginal namespace factory syntax remains refused before bodies. Broader asynchronous dependency graphs, dynamic/reexport/native combinations and other profiles remain unqualified. The coherent142 producer and affected checks passed; the current fresh I native retains the same complete producer roles plus its separately qualified anonymous CommonJS certificate. Full release qualification remains required.',
      importOriginalCallback:
        'The supplied importOriginal callback is an ordinary zero-argument Function, matching complete callback reflection and value rows on Node20/22/24/26. The existing inner async operation, Promise adoption, original owner and registration origin are unchanged. All1076 compiler/mock/execution controls and636 prior complete rows pass in the owner. The eight exploratory p/q completion-order differences and broader asynchronous/profile combinations remain open; callback shape does not claim to fix timing.',
      compiledCommonJsRuntime:
        'Isolated development Node runtime factories support measured relative queryless compiled CommonJS cohorts, including certified internal require edges, resets, cycles and registration replacement. Actual module/namespace ownership and published reset closure retain the original pending promise identities. File-owned successful, pending and invalidation work settles only at actual request boundaries; unused registrations evaluate neither source nor factory. Across Node20/22/24/26,548 admitted complete reference rows match, including40 request-time invalidations, with136 prior CommonJS/native rows and24 boundary controls retained. Factories completing last retain the measured cached value, including older pending factories that settle after replacement. Ordinary synchronous compiled ESM leaf namespaces are qualified separately under compiledEsmRuntime. Direct require mocking, broader async/native-demand combinations and other profiles remain unqualified.',
      compiledTerminalThrow:
        'Existing isolated development Node compiled leaf-ESM targets accept inline terminal-throw factories after the complete source/graph/alias/owner and then-export checks. Sixteen complete measured rows across Node20/22/24/26 retain synchronous/async retries, pending original fallback, raw causes, fresh wrappers and unused zero evaluations. Prior native, compiled, static/runtime and ownership rows remain intact; transitive graphs, CommonJS and broader profiles remain unqualified.',
      ownership:
        'Native compiler identities select actual loader callbacks. Pending factory work remains visible to import settling and file disposal; closed asynchronous origins reject.',
      unsupported: [
        'compiled static/runtime mixtures and other hoisted helpers; nonliteral requests, import attributes and foreign user importers',
        'uncertified compiled factory dependencies, broader asynchronous/dynamic or CommonJS graphs, uncertified external/native shapes, queries, fragments and symlink resolution',
        'complete mixed compiled/native namespace shape conformance; custom unhandled-listener terminal exit parity and factories crossing completed attempt scopes',
        'computed/accessor/spread factory exports, then exports, prototype mutation and non-inline factories',
        'setup, serializers, coverage, custom realms, in-source entries, inspectors and shared cohorts',
        'RSC, browser and production profiles',
      ],
    },
    retainedSetupWatchSelection: {
      supported: true,
      scope:
        'A fulfilled retained JSON single-project isolated development Node globalSetup owner can retain its current healthy editor run when only its existing setup source changes and actual source planning proves zero selected consumers. Ordinary imported setup consumers still rerun; new tests still execute independently. Actual configuration changes, failures, cancellations, explicit reruns, mixed changes and uncertain input/registry ownership retain ordinary execution. All701 affected owner controls pass, with five original reference body/config rows and unchanged setup traces. The final SIGINT teardown channel difference remains open, as do executable/multiple-project configurations, other profiles, coverage and broader setup lifetimes.',
    },
    moduleCacheReset: {
      anonymousFunctionExpressions:
        'Isolated development Node compiled CommonJS reset and runtime factory targets admit an actual terminal module.exports anonymous nonasync/nongenerator function expression with plain resolved identifier parameters, including certified require dependencies and cycles. Whole-function/global-binding checks and existing source/require/layer/namespace/reset proofs remain authoritative. Forty-eight complete dependency/cycle reset/runtime rows and twelve empty-require-closure leaf rows match across Node20/22/24/26, retaining engine-specific function caller/arguments descriptors. All1080 compiler/mock/execution controls and146 distinct Rust controls pass. All652 prior legacy/TLA/callback rows,136 prior CJS/native rows,24 boundaries,four originals,eight cancellation rows and unmarked/leaf output bytes remain held. Named/async/generator/arrow/class expressions, complex parameters and mixed actual-helper/runtime registration remain separate gaps; existing zero-body refusals do not count as functionality.',
      supported: true,
      api: 'vi.resetModules',
      scope:
        'Isolated development Node dynamic imports retain the existing compiled ESM reset path and compiled leaf CommonJS roots. Certified ordinary terminal module.exports object/callable graphs also retain actual require dependencies and cycles with separate resettable compiled implementations and protected original require layers. Literal relative queryless importActual helpers can use those same exact CommonJS namespace/reset generations; helper-only and unused targets remain lazy. Eighty complete new reference rows across Node20/22/24/26 retain namespace descriptors, defaults, receivers, mutations, held identities, resets and cycles. All earlier48 CommonJS and88 native ordering rows, twenty-four refused boundaries, eleven leaf factories and twenty-four unmarked factory bodies remain intact. Certified native package/builtin provider generations use actual compiler module IDs and original edges; native/Node source state and successful registrations remain held while provider namespaces follow the measured reset identities. Existing leaf Promise behavior on Node20/22 and ordinary single-root native namespace identity remain separate measured gaps.',
      unsupported: [
        'CommonJS graph syntax beyond certified ordinary object/callable terminal exports, unresolved or dynamic require references and unqualified external targets',
        'CommonJS resets combined with static/runtime mocks, nonrelative importActual helpers and other unqualified execution profiles',
        'other execution profiles and the complete reset/cache interaction matrix',
      ],
    },
    affectedSelection: {
      supported: true,
      scope:
        'One-shot --related and --changed use actual isolated Node compiler dependencies in development and production, retaining their respective package conditions. Missing, incomplete, stale or opaque source/configuration evidence conservatively widens selection. Development/production Node changed watch admits the measured dirty-HEAD initial dependency set and then follows actual source consumers, as described under changedNodeInitialSelection. Other execution profiles and broader Git/watch combinations remain unqualified; bounded development/production related watch is qualified separately under productionRelatedWatch.',
    },
    watch: {
      changedNodeInitialSelection:
        'Isolated development/production Node --watch --changed HEAD resolves the actual initial Git changed-source union inside the owned watch run and uses the existing compiler related-source planner. Explicit --related retains precedence; later edits retain the complete registry and use their actual compiler consumers. Five complete stages in both modes match the pinned reference and fresh installed consumers: dirty alpha only, beta edit only, shared edit both, unrelated edit no new report and alpha edit only. All417 sequential CLI/incremental controls pass with all old bodies, deadlines and assertions held. Empty initial selection, staged/untracked/additions/deletions and invalid-ref/no-Git watch combinations, other profiles/reporters/shards/platforms remain separate qualification work.',
      ordinaryProductionNode:
        'Plain isolated route-less production Node profiles use the existing Turbopack/nodejs watch owner. Five complete initial/source/dependency/configuration/manual-rerun rows match across Node20/22/24/26 on Darwin arm64, retaining production conditions and fresh state. Syntax failure reports no cases; healthy recovery preserves completed failure history. Actual active interruption closes130 without publishing an incomplete passing generation, joins owned processes and retains the last complete report. All527 owner CLI/server controls pass, including two additions and the exact user-approved old refusal-control input correction. Full-run production editor rerun/cancel/recovery is qualified separately under editorControls. Setup/globalSetup, coverage, snapshots, cohorts, mixed modes, RSC/routes, other platforms and broader combinations remain separate qualification work.',
      productionRegisteredComponents:
        'Route-less production Node browser drivers with nonempty actual registered component fixtures use real production application builds in watch. Three complete normal-app rows match through initial/source/CSS revisions, SSR and hydration, provider context and native events; a fourth real mounted native wait cancels with130 while preserving the previous completed report. Separate observed proof retains four distinct artifact roots, revisions, build IDs and fixture route prefixes, with each old server/build/artifact/lock owner closed before following mutation. All515 affected controls and uninstrumented maintained replays pass in the owner. Ordinary production Node watch is qualified separately under ordinaryProductionNode. Production RSC and unregistered application drivers, production setup/coverage, other engines/platforms and broader lifecycle combinations remain unqualified.',
      supported: true,
      scope:
        'The CLI retains exit status 1 after an actually completed failed watch generation even when later generations pass and the user quits or interrupts; all-passing quit and interruption retain 0 and 130. Fifteen clean installed development/production terminal scenarios retain forty-five complete reference generations and all actual cancellation facts. Active-q reference deadline behavior and broader engine/platform interactions remain unqualified. Development Node/RSC, Node browser drivers and serial development Chromium client files on POSIX; fresh execution, parent-owned browser/server leases, conservative invalidation, live terminal progress and interactive commands. Clean physical-package Chromium client corpora match three complete generations in development and production across imported source and CSS edits with fresh state and effect cleanup; active pending-render cancellation closes with status 130 and no retained owned processes. Production client watch retains actual production conditional exports, React production behavior, four distinct compiler revisions/artifact roots and complete source/CSS descriptor changes. Node22/24 and other engines/platforms, mixed compilation modes, production setup/coverage/unregistered application drivers and repeated cleanup stress remain unqualified. Cooperative metadata reconciliation recovers omitted native notifications and retains output exclusions and explicit dependency files. Rediscovery with an established baseline for the exact same configuration continues without joining an unrelated periodic scan; initial and changed configurations still await their baseline, and cleanup drains every started filesystem read.',
    },
    snapshotUpdate: {
      supported: true,
      scope:
        'Local new-only and explicit all updates for route-less development/production Node, RSC, and browser profiles, plus explicit development/production RSC routes with one selected source owner and watch for development Node/RSC. Browser writes wait for browser/server disposal; partial selections preserve unchecked snapshots.',
    },
    production: {
      supported: true,
      environments: ['node', 'rsc', 'browser'],
      scope:
        'Isolated production Node tests, route-less RSC dynamic-subtree tests, explicit RSC AppProject route subtrees and Node browser drivers use real production conditions. Production Chromium client files use the actual production compiler context and returned runtime bootstrap parameters. The bounded eight-case corpus retains real browser/production package conditions, React createRoot, JSX, CSS and native interactions, including a clean local native-package installation. Registered component fixtures compile as genuine production App Pages with SSR and hydration. Browser drivers use a separately built application; instant() requires explicit production instrumentation.',
      unsupported: [
        'implicit routing and streaming/static/route semantics beyond the explicit RSC subtree and force-dynamic full-route contracts',
        'prerender/PPR and Server Action transport for isolated RSC tests',
        'production automatic/manual/runtime mocks and broader setup/reset combinations',
        'RSC and broader transformed production coverage',
        'production Browser coverage, setup combined with mocks/resets, broader rendering-helper contracts and other engines',
      ],
    },
    rscRouteRendering: {
      supported: true,
      api: 'rsc.renderRoute',
      streamingApi: 'rsc.renderRouteStream',
      scope:
        'Explicit development/production Turbopack Node RSC force-dynamic routes with cacheScope: file use the real AppPage entrypoint, live loader tree and native manifests. Buffered HTML and Flight retain root/nested layouts, client-provider SSR context, request inputs, status and drained after work. Eight complete ordinary-app/installed cases, four cancellation outcomes, both normal deployment-attribute workflows and late-acquisition cleanup controls pass. Twenty additional HTML/Flight cases match complete ordinary-app rows for ASCII, spaces, Unicode, literal percent and encoded slash in root and catch-all inputs, retaining repeated queries, headers/cookies, layouts, provider context and drained after work. Twelve further temporary/permanent redirect and following-request rows retain genuine HTML status/Location, Flight redirect digests and status, drained after work and following provider context. Existing supplied-subtree render, ASCII/encoded route inputs and production snapshots remain held. Twelve complete buffered late-redirect and following HTML/Flight rows match development/production normal applications, retaining status, headers, refresh metadata or redirect digest, request/root/layout/provider/resume context and all after work. The fifteen authored application files remain exact; real component HTTP barriers and final cleanup are maintained. Ordinary application fallback-before-release timing is retained separately. The additive renderRouteStream API consumes the real AppPage HTML/Flight byte stream with native backpressure and first-commit response snapshots. Twenty-eight complete development/production live redirect, reader-cancel, explicit-dispose, held/rejected-after and healthy-following rows match ordinary applications; four real cleanup failures remain failed cases and CLI exits. All 260 owner controls preserve the old 234 tests and add 26 cases. Twenty-three actual native controls pass on Node 20.20, 22.22, 24.18 and 26.1, including queued-flow cancellation and early unread disposal. Original opaque cancellation reasons and real errors retain their identities; buffered contracts remain held. Development AppPage debug channels now retain actual separate bytes and request IDs through natural producer EOF or error, including main-response abort. The testing-owned Node Flight destination joins the actual producer before closing public cancellation. Thirty-two complete installed HTML/Flight rendering-error, boundary, digest and following-request rows match the ordinary applications, alongside the unchanged twenty-eight streaming rows and eight normal-app controls. All278 RSC/server controls, fourteen destination controls on four Node runtimes and four actual pinned producer proofs pass in the owner. Public debug transport and hydration, broader partial delivery, cache/staged/PPR/Edge cancellation, other profiles and platforms remain unqualified.',
      unsupported: [
        'implicit or static/prerender routes, Cache Components/PPR and Server Action transport',
        'client hydration, broader parallel/intercepted route contracts and other profiles/platforms',
      ],
    },
    browserComponents: {
      supported: true,
      mode: 'development',
      modes: ['development', 'production'],
      browser: 'chromium',
      scope:
        'Registered server fixtures render as real Next App Pages with SSR and client-boundary hydration; Node drivers select fixture IDs and pass JSON props. An optional explicit layout uses the actual project module and normal App Page loader tree. Development and production SSR provider content, CSS and hydration match the ordinary application route in the measured fixture. Development registered-component driver watch rebuilds nested component dependencies and remounts with fresh client state.',
      registration:
        'projects[].browserFixtures: { id, module, exportName?, layout? }',
      unsupported: [
        'implicit application route or layout context',
        'arbitrary module paths, React values or functions over transport',
        'production component watch beyond the registered-component subset qualified under watch.productionRegisteredComponents, and broader Browser Mode watch combinations',
      ],
    },
    browserSetup: {
      supported: true,
      modes: ['development', 'production'],
      browser: 'chromium',
      ordering: 'list',
      scope:
        'Ordered compiler-owned setup namespace modules execute inside the original Browser file collector before the test module, retaining actual top-level await, hooks, globals, CSS, file isolation and disposal. Fresh installed development/production Chromium corpora match eight cases and twelve full reference rows; exported Promise values remain namespace data, and rejected setup stops later setup and test loading. The maintained setup-watch corpus matches six generations, twelve cases and eighteen full rows across setup-only dependency and setup-imported CSS changes. Eight actual artifact roots/revisions retain ordered setup inputs and changed emitted JS/CSS bytes; all roots and both active cancellations close.',
      unsupported: [
        'parallel setup and setup combined with mocks, module reset, coverage, serializers or custom realms',
        'other browser engines and broader release qualification',
        'complete setup rejection diagnostic-format parity',
      ],
    },
    browserViewport: {
      supported: true,
      scope:
        'Development Chromium client contexts apply browser.viewport before page creation. Pinned defaults are 414 by 896; partial dimensions retain the other default, explicit zero is preserved, and negative or fractional dimensions fail before collection. Node application drivers retain their existing viewport behavior; broader Browser profiles remain unqualified.',
    },
    domProviderWindow: {
      supported: true,
      scope:
        'Explicit jsdom/happy-dom providers install proxy-hidden window addEventListener, removeEventListener and dispatchEvent methods with stable bound identities and a configurable matchMedia placeholder. Native JSDOM24 event identity, cancellation, listener removal, overrides/setter propagation and descriptor restoration match the pinned reference. Lazy getters remain deferred and teardown failures remain failures. The full downstream DOM/profile matrix is still being qualified.',
    },
    browserInstances: {
      supported: true,
      scope:
        'Explicit Chromium browser.instances expand to independent existing development/production profiles with opaque IDs and exact authored public project labels, including empty, spaced, slash and Unicode instance names. Instance defaults, inherited viewport, parent/exact --project selection, fresh realms and actual File.projectName retain complete pinned rows across fresh installed consumers. Twenty physical runs retain92 complete cases/rows and26 independent disposed hosts/artifact roots. Expanded instances also retain arbitrary and empty parent labels and exact parent --project selection; browser.enabled:false leaves instances inactive and executes the ordinary Node profile. Six additional fresh installed development/production runs retain18 full cases/rows, four disposed Chromium hosts and no Browser host for disabled instances. The measured legacy no-instances discrepancy, other engines and broader combinations remain qualification work; native/compiler profile descriptors are unchanged.',
    },
    browserRendering: {
      supported: true,
      scope:
        'Unchanged React Testing Library development Chromium bodies retain rendering, effects/cleanup, renderHook and act. The published vitest-browser-react helper also matches its four complete render/rerender/unmount, wrapper and hook/locator rows in development and production Chromium through physical package installations. Locator and/or composition uses live intersections and DOM-ordered deduplicated unions with native interaction and strict matching. Locator nth(-1) now retains the last actual node through live queries, matching last(), DOM reordering, bounds and closed scopes. Four complete development/production native-event and controlled React rows match the unchanged reference, with all122 prior Browser cases retained. Ordinary production RTL depends on unavailable React production act in both measured runners; broader helper versions, profiles, engines and concurrency remain unqualified.',
    },
    browserUserEvent: {
      supported: true,
      scope:
        'Development Chromium client userEvent exports click, dblClick, tripleClick, hover, unhover, fill, clear and selectOptions for existing locators or HTMLElement targets. In development/production Chromium, selectOptions accepts string values or connected option HTMLElement/Locator scalars and homogeneous arrays through the actual native option handles. Fourteen complete reference cases retain duplicate-value node identity, DOM order, input/change events, controlled React rendering, empty selections and native timeout recovery. Every acquired handle is joined and disposed. Initially absent query-backed Locator click/fill/dblClick/tripleClick targets retain their live captured file/attempt scope through the actual Playwright selector engine, native waiting, actionability and events. Sixteen complete development/production native-event and controlled React reference cases match. Existing six timeout/recovery/repeated-query/duplicate controls and eight additional multi-click timeout/duplicate/recovery cases retain following events and identities; raw error diagnostics remain explicit. All126 prior full Browser cases and original native-action cancellation controls remain held. Present element IDs retain their current path, other absent-target actions remain unqualified, and raw selector/stack diagnostic parity remains open. Calls retain real Playwright events, options, asynchronous completion and errors. Native tab({ shift }) traverses actual browser focus in both directions after awaiting the renderer turn. Native upload accepts project-relative paths and browser File values or homogeneous arrays, preserving file bytes and native input/change events. Its seven-case development/production Chromium corpus includes Blob-backed Files, replacement/clear and native action rejections followed by successful work. Executed native action errors reject the awaiting authored call while malformed transport remains terminal. Broader setup/options and interaction matrices, other clipboard/upload forms and other engines remain unqualified. Native dragAndDrop and Locator.dropTo retain ten complete native-event rows in development/production Chromium, with the default test-document html/body reset and four default/authored-override geometry rows. Original connected nodes and native options drive the existing Playwright action; malformed transport remains terminal. Measured native-action cancellation retains current machine reports and owned cleanup. Opted-in console/task observations drain through the actual ordered output path while a native action is pending; the original development/production native-mousedown deadline passes. Broader cancellation and output combinations remain qualification work.',
    },
    productionRelatedWatch: {
      supported: true,
      scope:
        'Explicit ordinary development/production Node related watch retains all discovered entries while the initial compiler plan selects the requested source consumer. Later dependency edits select their actual consumers, shared edits rerun both owners, unrelated edits retain the existing machine report, and SIGINT joins shutdown. Both modes match the pristine five-stage corpus, including ten complete authored case/output rows with changed source values; all18 incremental and77 watch session controls pass with the old16 and71 bodies/expectations held. Every plan closes before selection, unknown evidence widens selection and superseded plans join before another run. Changed-watch combinations beyond watch.changedNodeInitialSelection, other profiles, additions/deletions, empty initial selections, coverage and broader reporter/editor interactions remain unqualified.',
    },
    resultReports: {
      nodeSuiteErrorOwnership:
        'Isolated development/production Node completion adapters retain actual suite-end error slots and associate matching later diagnostics only through the unique preceding run/file/revision/suite owner and complete serialized payload. Twelve ordinary, twelve clean installed and two explicit Node pragma profiles retain case/event/callback trees, error headers and identity, with raw stacks preserved; sixteen validated blob replays retain twelve callback rows plus four legacy or wrong-slot fallbacks. All495 owner controls preserve the old476 expectations with19 additions. DOM/custom, RSC, cohort and Chromium producers emit no association in six actual negative profiles. Rich stack presentation, other profiles and watch reporter lifetimes remain unqualified.',
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
        'One-shot file-backed JavaScript adapters run initialization, measured serial Node and development Chromium onUserConsoleLog callbacks, final task-tree callbacks and owned close callbacks in a supervised reporter process. Serial development/production Node onTestModuleEnd callbacks consume actual file completion, retain module/child identities at run end and expose failed retry errors on passing results. Console and module callbacks drain in order; rejection retains later logs/files and run-end errors, fails the command and preserves passing machine test results. Opted-in onTestCaseResult adapters receive actual collected task trees and ordered logical case results after retries/repeats and cleanup; measured task metadata/result identities update through real leading/trailing task batches. Serial Node cohorts expose actual per-file module acknowledgement before following bodies while final file/snapshot publication still waits worker closure. Full rejection and module-callback-gated execution rows match development/production isolated Node and development cohorts. Browser capture has a separate measured development/production corpus; composed physical qualification remains pending. Measured pinned foreign terminal blobs also replay actual case/module/run-end callbacks through the same stable views. File-backed ES-module .ts/.mts entries and actual relative local typed enum/type-only imports use existing SWC within the supervised worker, retaining native ESM URL/cache identities. Sixteen complete terminal-blob profiles across Node20/22/24/26 match ninety-six full callback rows and sixteen JSON reports each against pristine Vitest; four fresh installed profiles match without Vitest/Vite. Typed directory, output-name and dynamic/mixed local graphs retain192 full callback rows and32 standard JSON reports across Node20/22/24/26. Measured package completion adapters retain native package entry conditions in both Node modes across four engines. File JSX/TSX completion reporters use their own React import and the classic transform. Their owned relative graphs retain explicit/extensionless files, index files and JavaScript output suffix fallbacks with native file and pinned source suffix precedence. Forty installed profiles retain 280 complete callback rows and forty full reports without Vitest/Vite. Legacy blobs lacking callback facts, watch lifetimes, concurrent grouping/attribution, CTS adapters, aliases/plugins, broader typed import graphs and advanced task/context APIs remain unqualified.',
      capturedBlobReplay:
        'Next blobs retain actual collected/terminal task graphs even when the producer uses only the blob reporter. Serial development/production isolated Node and development cohorts replay final captured declarations and real terminal module facts into stable public reporter views without authored tests in the merge root. Real serialized reporter-realm errors survive recording and combine with new replay errors; plain merges fail their command without changing passing case JSON/JUnit. All468 private CLI/report tests and six fresh installed profile runs retain nine cases and thirty full genuine callback rows without Vitest/Vite. Pinned Vitest 5.0.4 terminal blobs also replay actual task identities, declaration order, metadata/options/tags, errors, annotations/artifacts and module names into file-backed JavaScript case/module/run-end adapters. Eight fresh installed corpora retain all twenty cases, forty-eight complete callback rows and eight complete JSON reports without authored tests or Vitest/Vite in merge roots. Original and new callback errors fail the command while preserving passing case results. Callback-specific validation precedes adapter loading; the existing JSON-only import remains unchanged. Legacy blobs lacking task graphs, function-valued options, broader concurrent/reflection semantics and watch lifetimes remain unqualified.',
      scope:
        'Final retry outcomes, full attempt evidence, mapped errors, attributed output, attachments and snapshot summaries; fresh machine reports after cleaned development Node/RSC watch generations. --merge-reports merges disjoint versioned Next blobs or projects validated Vitest 5.0.4 final tasks to JSON without compilation or fabricated Next history. Real terminal foreign runtime-skip tasks, including failed retry/repeat replacement and metadata, retain the complete pinned JSON merge projection. Foreign coverage/nonterminal tasks/other built-in reporters, full schema/terminal conformance, snapshot statistics and advanced custom adapters remain release work.',
    },
    testNamePattern: {
      supported: true,
      scope:
        'One-shot and initial watch selection using -t/--testNamePattern against full ancestor-qualified names; explicit --list --json --staticParse=false uses the same selection for collected name/file facts. Plain file listing does not accept name filters.',
    },
    typescriptConfig: {
      supported: true,
      scope:
        'Next, Vitest, and Vite test configs load in an isolated retained realm; compatible discovery, globals, setup/global setup and provided context are translated. Bounded string-alias and transform adapters use the actual Next compiler; other compiler overrides and unimplemented settings receive explicit errors.',
    },
    coverage: {
      classFieldFunctions:
        'Named noncomputed class fields in nondeclaration TypeScript sources retain anonymous regular function-expression endpoints for the measured single typed identifier parameter and same-line singleton binary-return body. Unique actual class, key, static, function, parameter, return, body and field-terminal maps recover only the function and initializer ends atomically; starts, declarations, returns, raw code, maps, counters and all other descriptors stay unchanged. All eight ordinary and eight clean installed complete reports and case rows match the reference, with four actual-native observed profiles and 280 mapping controls. All603 coverage tests preserve the old601 prefix. Other function shapes, computed or anonymous class owners, multiline bodies and broader execution/provider/watch combinations remain open.',
      classFieldArrows:
        'Named class declarations with noncomputed instance or static field arrows and plain identifier parameters retain qualified initializer, function and body endpoints through unique actual class/key/static/parameter/body/field-end native-map associations. The measured same-line nonasync binary-expression bodies match all six complete ordinary CLI reports in development/production Node, including unchanged method/plain controls; four further guarded untouched-source reports match without execution. Sixty actual-map controls preserve raw code, maps, V8 ranges and counters, with atomic refusal for ambiguous, missing or foreign roles. All600 coverage controls pass with the complete old598-test source prefix held. Imported-class initializer statement mismatches, other arrow shapes and broader provider/profile/watch combinations remain open.',
      runtimeEnums:
        'One executed top-level plain TypeScript enum with finite numeric, negative numeric, string, automatic or quoted-name literal members retains original coverage through its actual synchronous native IIFE, exact owner/member source mappings and unique closed V8 counters. All598 coverage tests pass with the prior596-test source prefix held;270 map controls retain atomic refusal and untouched unrelated counts. Forty complete genuine,forty closed-worker andforty public CLI reports match across development/production Node20/22/24/26. Original zero models supply locations only; raw artifact/V8 bytes remain exact. Nested, merged, const, declare, computed, unexecuted and combined runtime transforms, other providers/profiles/watch and shard aggregation remain open. No compiler/native/API/ABI field was added.',
      runtimeNamespaces:
        'One executed TypeScript namespace with exported literal constants and named function declarations retains original-source coverage through actual native IIFE, argument, literal assignment and function publication mappings. Sixty-eight actual-map controls preserve observed counters and atomic refusal; only the certified compiler-only function publication statement is excluded. All596 coverage tests pass with the previous594-test file prefix intact. Eight complete genuine, eight closed-worker and eight public CLI V8 reports match across development/production Node20/22/24/26. Raw artifacts/V8 and authored hit counts remain unchanged; zero models supply locations only. Nested/merged namespaces, mutable/nonliteral exports, unexecuted typed source and broader provider/profile combinations remain open; one executed plain enum is qualified separately under runtimeEnums.',
      constructorParameterProperties:
        'Named class-declaration constructors with identifier parameter properties, measured modifiers and literal defaults retain actual emitted assignment and exact native-map associations. Forty complete development/production V8 reports match independent Node20/22/24/26 references;170 mapping controls retain counters and atomic refusal. One default expressed as an actual zero-argument nonoptional identifier call is additionally associated through the unique authored/emitted call, same actual callee and unique exact native endpoint maps. All605 coverage controls preserve the prior603 expectations;72 new actual-map controls retain raw AST/maps/counters and atomic refusal. Four ordinary and four clean installed complete reports and case rows match for executed and untouched sources in both Node modes, with actual live/zero V8 counter identities observed. Existing simple unexecuted constructor-property forms were already functional; this closes only the measured call-default gap. One actual finite numeric-literal argument with identical authored/emitted raw token is additionally associated through unique actual argument identities, source/generated spans and a singleton native argument-start mapping while retaining existing call endpoints and atomic refusal. All607 owner controls preserve the old605 byte prefix;128 mapping controls and four ordinary/four clean installed complete reports and case rows match in Node26 development/production for executed and untouched sources. Six actual V8 captures retain every live/zero counter. Other argument/call expressions, constructor forms, unexecuted typed transforms, decorators and broader provider/profile/watch combinations remain unqualified.',
      multilineJsxArrowOwners:
        'Multiline intrinsic JSX bodies in typed variable-arrow initializers retain the actual uniquely associated closing terminal without an unnecessary same-line restriction. Thirty-four real native-map positive and atomic-refusal controls preserve observed mappings and raw V8 inputs; complete two-file coverage reports and case rows match development/production Node, with unchanged nested JSX controls. Multiline logical statement/branch ownership and broader TypeScript/JSX forms remain open.',
      conditionalOperands:
        'One-shot development/production Node raw JavaScript numeric conditional expressions retain a binary consequent terminal through unique authored/model/observed/emitted roles and six exact native source-map associations. Both complete fresh installed coverage reports match every descriptor, counter and metadata field with no Vitest/Vite installed; all579 earlier coverage controls retain their byte prefix. Forty-two actual-map controls and eight independent atomic-refusal checks retain inputs on absent, foreign or ambiguous associations. Broader conditional shapes and provider/profile/watch/aggregation combinations remain unqualified.',
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
      reports: ['json', 'json-summary', 'text', 'text-summary', 'lcov'],
      reportsScope:
        'The reports list includes bare-coverage legacy JSON/text output. Standard dotted reporter flags admit JSON, JSON summary, text summary, LCOV and the additional LCOV-only subset. Project-configured V8 coverage additionally uses full text, HTML and Clover formatters.',
      additionalReports: [
        {
          name: 'lcovonly',
          profiles: ['development Node', 'production Node'],
          execution: 'one-shot',
        },
      ],
      projectConfigured: {
        provider: 'v8',
        profiles: ['development Node', 'production Node'],
        execution: 'one-shot isolated execution',
        enabledByDefault: false,
        defaultReports: ['text', 'html', 'clover', 'json'],
        reports: [
          'json',
          'json-summary',
          'text-summary',
          'lcov',
          'lcovonly',
          'text',
          'html',
          'clover',
        ],
        scope:
          'Selected projects must share effective coverage settings. Explicit CLI fields override their configured counterparts. Initial clean, retained output with clean:false and reportOnFailure are qualified for one-shot isolated Node execution. Metric thresholds retain their existing scope. Configured watch, heterogeneous enabled project settings, Istanbul and other execution profiles remain unqualified.',
      },
      lcovOnly:
        'Explicit --coverage.reporter=lcovonly publishes only lcov.info through the existing LCOV formatter. One-shot development/production Node with and without JSON matches complete pinned two-file coverage reports and exact LCOV bytes, including unimported source denominators. The measured same-line no-else if-return followed by a return retains its authored endpoint through unique actual authored/emitted AST roles and six exact native-map associations. Every counter, branch ID and unrelated field remains intact; 44 controls check actual maps and ambiguous/missing associations. Other reporter, provider, watch, threshold and profile combinations remain unqualified.',
      jsonSummary:
        'Explicit --coverage.reporter=json-summary publishes coverage-summary.json with Istanbul total/per-file statement, function, branch and line metrics, skipped counts and percentages, plus the total branchesTrue placeholder. Development Node full report fields match the pinned V8 reference, including unimported sources. Empty maps and reporter replacement retain the standard publication and threshold behavior; other profiles remain unqualified for this reporter.',
      textSummary:
        'Explicit --coverage.reporter=text-summary prints the pinned Istanbul summary table after successful publication. One-shot development Node ordinary, empty-map and threshold-failing tables match the reference, including Unknown percentages, metric order and final newline. Watch and other profile combinations remain unqualified for this reporter.',
      globalThresholds:
        'Explicit standard threshold flags accept minimum percentages or negative maximum uncovered counts for statements, functions, branches and lines. One-shot development Node matches pinned pass/fail boundaries, fractional negative limits and successful test-report state while threshold failures make the command fail. Explicit coverage.thresholds.perFile selects independent file thresholds; false retains aggregate thresholds. Glob thresholds, automatic updates and other profile combinations remain unqualified.',
      custom:
        'Supervised provider hooks retain opaque original payloads and owned cleanup; broader provider services and transforms remain unqualified.',
      scope:
        'Real V8 counters cover syntax-preserved JavaScript in development/production Node and development Chromium client files. Explicit standard flags support development Node/client watch with validated per-entry replacement, initial/full-rerun source expansion and retained facts when cleanOnRerun is false. Development Node static mock coverage retains native source evidence. Bare --coverage keeps its separate one-shot development Node line metric.',
      parenthesizedJsxReturns:
        'One-shot development/production Node parenthesized multiline intrinsic JSX returns retain their actual closing endpoint through unique authored/emitted return and tag roles, real parenthesis offsets and native source-map terminals. A staged model-only repair preserves observed maps, all V8 counters and existing recovery algorithms. All583 prior coverage controls retain their complete byte prefix;46 actual-map positives and atomic refusals plus two ordinary and two real closed-worker complete two-file reports match the pinned reference. The measured multiline parenthesized logical child with a following intrinsic sibling also retains complete two-file reports in both Node modes through unique authored/emitted owners and native next-tag mappings. Ninety-two mapping controls retain atomic refusal and unchanged counters. The measured multiline Fragment logical child now retains the genuine complete development endpoint and unchanged production report. Parenthesized Fragment and unparenthesized element children also retain their actual parenthesis/closing and following-sibling roles; all sixteen complete two-source reference reports match both modes across Node20/22/24/26, and 172 actual-map controls retain atomic refusal and unchanged raw counters. Existing ownerless multiline logical returns also retain complete prior and genuine reports in both Node modes; the new proof enters only for an actual JSXElement owner. Broader JSX shapes, providers, profiles and watch combinations remain unqualified.',
      selectedTypeScriptImports:
        'Selected nondeclaration TypeScript imports in isolated one-shot development/production Node use the existing native import roles and exact source/profile/lease checks. Fourteen complete methods, plain-source, declare-class, mixed JavaScript, unexecuted and JSX-plan reports match the reference without changing raw maps or counters; four clean installed reports also match. All 601 coverage controls preserve the complete old 600 byte prefix. Real false/true/false compiler sessions retain source/profile/entry/revision identity and correct sidecar separation with actual persistent filesystem caching enabled in both modes; disposed leases remain refused. Watch, cohorts, unrelated JavaScript, declarations and other execution profiles retain their existing admission. Broader transformed-source/provider/shard combinations remain unqualified.',
      plannedJsx:
        'Explicit standard coverage includes admit planned JSX/TSX in one-shot development and production Node through actual compiler import roles and existing source/config selections. The measured component/helper-import and conditional corpora match all four complete two-file V8 reference reports, preserving every location, map, counter and metadata field. Unique authored/emitted AST and actual next-tag mappings recover the measured production conditional endpoint. Six further complete two-file reports retain nested JSX and recover the measured parenthesized typed variable-arrow initializer and single-line logical JSX child endpoints through unique actual terminal/tag mappings and AST roles. Explicit Node development/production Fragment owners also retain two complete two-file reports, including a parenthesized typed Fragment arrow and a single-line logical child with an intrinsic JSX sibling. Actual profile, callee, AST-owner and terminal-map roles anchor those endpoints; 66 controls reject ambiguous or mismatched associations. Every converter traversal receives fresh AST nodes, so consecutive conversions retain the original logical counters. Clean installed reports and repeated same-artifact mapping match without changing native maps or V8 counts. Implicit selection, other multiline shapes/configurations, environments, watch/cache/provider and cross-shard combinations remain unqualified.',
      metric:
        'Bare coverage counts original lines with non-whitespace mapped generated spans. Standard coverage maps retained generated AST/V8 ranges to original statement, function and branch declarations, then derives Istanbul line totals. Type-erasure TypeScript is qualified in development/production Node with unique authored associations and real counters, including proven direct variable-arrow and static object-property bindings and direct identifier/member-call callback arguments, with computed-member callbacks anchored at their actual mapped call boundary. Identifier and string-key object properties retain their actual function descriptors without inventing a variable-initializer statement. Unique actual maps and authored/emitted AST associations preserve counters while recovering callback prefixes, argument boundaries and empty named declarations; complete chained, block and async callback report fields match the measured reference. Anonymous synchronous and named/async-containing function-expression callbacks with a following argument retain the uniquely mapped argument endpoint in the authored model; observed descriptors and counters remain unchanged. Parent-selected untouched typed sources use the same native compiler profile without execution, with zero-only analyses, checked source/config inputs and exact runtime descriptor agreement. Other arrow owners, ambiguous callback associations, remaining runtime-generating TypeScript, JSX beyond the measured explicit-include owners, arbitrary effective-config dependencies and full provider parity remain unqualified.',
      unsupported: [
        'RSC coverage and production Browser Mode coverage',
        'route context',
        'runtime/CommonJS mocks and unqualified cross-profile mock coverage',
        'production watch and legacy line-coverage watch',
        'combining coverage with snapshot updates',
        'coverage-provider compatibility',
        'unqualified typed-source compiler configurations, arrow owners beyond qualified variable, static object-property, call arguments and the bounded classFieldArrows subset, remaining runtime-generating TypeScript, unexecuted constructor parameter properties beyond the bounded constructorParameterProperties subset and JSX standard coverage beyond the measured planned explicit-include owners',
        'project-configured standard coverage watch, heterogeneous enabled project settings and broader custom-provider service/transform dependencies',
        'additional configured and CLI coverage reporter options, and advanced threshold modes',
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
