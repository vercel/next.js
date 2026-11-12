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
  authoring: {
    schemaVersion: 1,
    reference: {
      vitestRevision: '6a11cf66f99fa610b7364363d5ca42b66d994f40',
      primitiveVersion: '5.0.4',
      snapshotPatch: 'patches/@vitest__snapshot@5.0.4.patch',
    },
    declarations: ['test', 'it', 'describe', 'suite'],
    declarationFn:
      'Raw test/it and describe/suite fn collectors preserve supported receiver flags, manual collect/clear and Task/context/expect identity in isolated development/production Node. Child IDs stay empty during collection and publish on the same objects before hooks; cleared tasks remain unpublished. Expectations bind to Task identity. Full raw Task shape, throwing/repeated collection, Browser and shared-worker combinations remain open.',
    publicDeclarationTypes:
      'The vitest bridge exports TestOptions, SuiteOptions and TestFunction<ExtraContext = object>, with generic fixture contexts and callback types. OnTestFinishedHandler and OnTestFailedHandler require void or PromiseLike<void> through context/global listeners, modifiers, tables, fixtures and suite factories. Internal collector callbacks retain their broader return type.',
    nativeAsyncHookAssertions:
      'Isolated Node beforeEach, afterEach and returned beforeEach cleanup retain native Promise identity and assertion phases. Cleanup receives no arguments with an undefined receiver; production minification preserves strictness. Pending-afterEach timer order in Node20/24 production remains a gap. Cleanup budgets, hook snapshots/coverage, other fixture phases and rich diagnostics remain unqualified.',
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
      'Array and tagged-template each/for declarations preserve their public overloads in development/production Node; tagged test.for retains extended fixture context.',
    suiteAliases:
      'Extended/modified test APIs expose describe/suite with independent modifiers. Deprecated test.scoped delegates to fixture override while preserving its warning and receiver identity. Broader profile/type-tooling combinations remain unqualified.',
    fixturePropertyNames:
      'Node development/production fixtures support Object.prototype-shadowing names, including constructor, toString and __proto__, across values, factories, builder dependencies, extensions, overrides and reverse cleanup. Broader lifecycle/profile combinations remain unqualified.',
    suiteFactoryTestAPI:
      'Direct suite factories receive a fresh base test API, distinct from the facade and other factories. Node development/production supports sync/async factories, hooks, extensions, nesting and skipped children. Parameterized suite callbacks receive only row arguments. Broader combinations remain unqualified.',
    unicodeFixtureDependencies:
      'Ordinary/builder fixtures accept Unicode identifier dependencies, aliases and nested destructuring in development/production Node. Rest/computed-pattern limits and broader fixture/profile combinations remain unqualified.',
    typescriptImports:
      'Development/production Node test imports fall back from unresolved relative .js to .ts/.tsx, .mjs to .mts and .cjs to .cts. Existing JavaScript wins; application resolution and CommonJS format rules are unchanged. Broader TypeScript syntax/profile combinations remain unqualified.',
    context: [
      'task',
      'expect',
      'annotate',
      'signal',
      'regular-run bench diagnostic',
    ],
    metadata:
      'Stable task/file/suite identity, live task failure state, retained retry/repeat errors, tag definitions/priority/inheritance, mutable task meta and source-mapped annotations with retained local or inline/URL attachments',
    declarationLocations:
      'includeTaskLocation and CLI overrides use producer-owned Node/Browser registration origins, retained privately for reporters and machine rows. Direct calls with trivia support development Chromium/Firefox locations. Extracted aliases, curried each, production/minified coordinates and broader profiles remain gaps.',
    artifacts:
      'Node recordArtifact(task, artifact) preserves serializable data, task attribution, mapped locations and supported attachments for started tasks while their file is open. Live reporter hooks, Browser parity and collected-but-unrun tasks remain unqualified.',
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
      'Global lifecycle hooks accept explicit extra-context types and suite arguments. Fixture-wrapped beforeEach/afterEach retain an absent suite argument. Broader suite-context fixture access remains unqualified.',
    concurrentSuiteOwnership:
      'Queued cases and sibling suites retain enqueue-time async ancestors, FIFO reservations and separate concurrency budgets in development/production Node. Broader timeout, clock, snapshot and worker-profile combinations remain unqualified.',
    concurrentTimeoutOwnership:
      'Supported development/production Node profiles isolate timeout signals and retain body, aroundEach and hook messages/origins. Budgets stay captured; settled body timeouts permit retry/repeat after cleanup. Unsettled work blocks new work. Broader hook ownership/rendering/publication, aroundAll recovery, unsettled expected-failure operations and snapshots after final-failed timeouts remain gaps.',
    fixtures: {
      api: 'test.extend',
      scopes: ['test', 'file', 'worker'],
      workerLifetime:
        'Isolated files retain worker fixtures through file cleanup. Serial development Node isolate:false cohorts share the cache across files and dispose it after the cohort; broader worker/profile interactions remain unqualified.',
      options: ['scope', 'auto', 'injected'],
      injected:
        'Node development/production object-form tuples resolve provided values at registration with nullish fallback to the declared value/lazy factory. False, zero and empty strings persist; suite overrides keep their injection setting. Browser and broader builder combinations remain unqualified.',
      fileAssertions:
        'Node development/production file fixtures retain assertion ownership through concurrent setup and deferred cleanup. Global soft assertions/snapshots use only live cases; completed cases supply no teardown identity. Local context.expect counts stay case-owned. Worker fixtures and broader profiles remain unqualified.',
      overrides: 'test.override object syntax, scoped to the declaring suite',
      builderReceivers:
        'Node development/production extend/override use the actual receiver, including borrowed methods/facade calls. Extend returns a fresh unmodified run API; override retains receiver identity and suite scope. Serial development cohorts retain cached receiver ownership. Options-only normalization, describe timing and broader forms remain unqualified.',
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
      'vi.defineHelper preserves callable types, receivers, arguments and return/rejection values. Development Node/Chromium diagnostics show the outer helper caller while retaining raw stacks, including nested/async/soft Chromium failures. Broader Browser modes remain unqualified.',
    typeAssertions: ['assertType', 'expectTypeOf'],
    typeAssertionScope:
      'Pinned expect-type primitives and TypeScript/editor assertions. One-shot type-test files run the consumer tsc in an owned process; original AST spans attribute diagnostics without evaluating callbacks. Focused tasks, build, alternate checkers, watch/list/debug and full type-tooling conformance remain unqualified.',
    inSourceTests:
      'includeSource discovery and exact-entry AST substitution share the active Vitest facade in fresh Node files. Ordinary app compilation sets the marker false for production removal. RSC, Browser, cohorts and typed importMeta subpaths remain unqualified.',
    chaiAssertions:
      'Chai 6 assert/should/namespace APIs support plugins, utilities and legacy Assertion settings; development Chromium includes namespace routing/plugins. Configurable function-valued namespace descriptors preserve flags and callable/constructor identity within live scopes. Collection-created plugin callables crossing cases, nonconfigurable/object-valued descriptors, raw reflection and broader profiles remain unqualified.',
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
      'Standalone fake-timers 15.4.0 with the Vitest 5.0.4 patch supports Node Date-only/async clocks, project config and waits using captured real deadlines. Child workers cannot fake nextTick. setTimerTickMode accepts one argument for manual/nextTimerAsync and an optional numeric interval only for interval, including detached/fluent types.',
    browserRealWaits:
      'Serial development Chromium supports vi.waitFor/waitUntil with captured real timers, detached calls, immediate/async polling, errors/timeouts/thenables and waits through afterAll/following cases. File cleanup stops unused waits without draining or synthetic rejection. Late snapshot/async/soft/custom-matcher attribution and other engines/profiles remain unqualified.',
    browserFakeTimers:
      'Serial development Chromium supports vi.useFakeTimers, Date-only time, timer cancellation/counts, sync/async advancement and public vi return identity. Nested timers, Promise continuations, waits advancing the active clock before each callback, cross-case clocks and live common/held local expectations are supported. Restoration discards pending callbacks. Frame/tick-mode/microtask breadth and other engines/profiles remain unqualified.',
    browserFakeTimerConfig:
      'Serial development Chromium forwards numeric project now, selected toFake arrays, loopLimit and shouldClearNativeTimers. Per-call options shallowly override defaults and replace arrays. Date-only selection and native cancellation are supported. Date-valued project time, broader options and other engines/profiles remain unqualified.',
    browserRetryRepeats:
      'Serial development Chromium supports numeric project retry defaults and suite/test retry/repeat counts, retaining context/task/signal/local-expect identities. Recovered retries pass with earlier diagnostics; failed repeats fail the case. Object retry, concurrency, broader deadline/cancellation behavior, exact URL-bearing stacks and other engines/profiles remain unqualified.',
    equalityTesters:
      'expect.addEqualityTesters shares the pinned recursive/asymmetric matcher registry across expectation instances; file disposal removes owned registrations.',
    runtimeUtilityConfig:
      'File-owned shallow setConfig/resetConfig controls clock/reset/poll/assertion settings; declaration-time timeout budgets stay captured. Concurrent mutation remains unqualified. Hook groups support stack, list and bounded parallel order.',
    importSettling:
      'The emitted Node/RSC runtime tracks real chunk/external loads and asynchronous module evaluation. Repeated captured real turns include unreturned nested imports; cleanup cancels waits and restores loader descriptors.',
    utilityLifetime:
      'File-owned clocks, global/environment stubs and mocks release on explicit restore or realm disposal. Development Chromium global stubs preserve descriptors, cross-case lifetime and fluent public vi identity. In open Browser files, bare/extracted expect follows common state and held context.expect keeps local state; completed counts are not revalidated. Other scope checks remain.',
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
        'Isolated development/production Node custom matchers expose toMatchSnapshot, toMatchInlineSnapshot, toMatchFileSnapshot, toMatchDomainSnapshot and toMatchDomainInlineSnapshot, including custom/domain inline updates. Matcher calls require a live owner; parent completion authorizes publication. Browser, cohorts, polling, expected-failure and broader domain/custom-environment combinations remain unqualified.',
      default: 'create missing snapshots locally and in watch; read-only in CI',
      update:
        'Missing-only locally, or all with --update/watch u. External/inline/raw publication requires authoritative parent completion and cleanup. Isolated one-shot development/production Node can publish fully settled body failures only after all selected entries, compiler/worker/source transactions close; host/project diagnostics veto this branch.',
      profiles:
        'route-less development and production Node/RSC/browser; browser commits after browser and application-server disposal',
      failedBodyPublication:
        'Isolated development/production Node can publish snapshots after supported fully settled body failures, including soft assertions, assertion counts and owned promise/consumption errors. Hook, fixture, cleanup, late-owner, timeout and host errors veto publication. Filtered CI ordering, unawaited-async diagnostics, final-failed timeouts, coverage with explicit updates and broader combinations remain differences.',
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
      'Node test graphs evaluate typeof window at runtime, including global stubs and installed DOM providers. Application server/client contexts retain compiler folding; broader global/compiler/profile combinations remain unqualified.',
    routeContext: false,
    routeContextScope:
      'Explicit development/production Node RSC routes preserve params/root params, headers, cookies and production snapshots for a supplied subtree, including encoded root/catch-all values. renderRoute/renderRouteStream include ancestor layouts and HTML/Flight within features.rscRouteRendering. Implicit routing, production watch, static/cache/PPR and broader route semantics remain unqualified.',
    routeDefaultSlots:
      'Explicit force-dynamic development/production Node initial HTML/Flight includes default-only named slots, layouts/context and request inputs. Canonical ordinary-page/AppPath, interception, Node runtime and dynamicParams gates apply. Matched pages use routeMatchedSlots. Navigation, static/PPR/actions, streaming slots and broader hydration remain unqualified.',
    routeMatchedSlots:
      'Explicit force-dynamic development/production Node initial HTML/Flight includes same-AppPath matched slots with layouts/context and request inputs. Absent, ambiguous, foreign, nonpage or intercepted pages/trees reject. Dynamic matching beyond supported paths, navigation/interception, streaming slots, static/PPR/actions and broader hydration remain unqualified.',
    routeNotFound:
      'Explicit force-dynamic development/production Node rsc.renderRoute preserves root/nested notFound boundaries as HTML404 or Flight200 and allows healthy following requests with provider/client, query, params and after-callback behavior. Implicit routing, navigation, streaming, static/cache/PPR and broader boundary combinations remain unqualified.',
    routeAuthInterrupts:
      'Explicit force-dynamic development/production Node root/nested renderRoute auth interruptions preserve HTML403/401 or Flight200 interruption digests, followed by healthy rendering in the same leased application. Auth interruption configuration remains explicit; broader boundary and execution combinations remain unqualified.',
    fileIsolation:
      'Fresh realms by default; explicit isolate:false uses serial development Node compiler cohorts with parent-owned worker and artifact cleanup.',
    browser:
      'Node drivers use real development/production Next applications. Serial Chromium and Firefox client realms run in both modes; WebKit supports one-shot main-frame and owned-child execution. Client public queues preserve Finished/Failed behavior. Utilities, mocks, clocks, rendering, watch, concurrency and broader lifecycle combinations retain their separate limits.',
    platforms: ['darwin', 'linux'],
    note: 'POSIX process ownership is required; independent native/runtime acceptance is recorded for darwin-arm64.',
  },
  features: {
    debugging: {
      supported: true,
      scope:
        'Explicit --inspect [host:]port opens the isolated file worker. One-shot execution requires one active worker, selectable with --no-file-parallelism. --inspectBrk/--inspect-brk pause before authored code and support CDP resume or cancellation in development/production Node. Break-zero uses the default port; inspect-zero is ephemeral. Coordinator/compiler arguments are not inherited.',
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
      fileParallelism:
        'Root Boolean fileParallelism and bare positive/negative CLI forms control the maxWorkers budget for isolated development/production Node, with CLI precedence and fresh watch selection. Extra watch starts and editor-observation failures remain unresolved; full watch lifecycle, project-local settings, other profiles/pools and equals/camel grammar remain unqualified.',
      workerPercentages:
        '--max-workers, --maxWorkers and maxWorkers config accept host-relative percentages using reference parseInt, rounding and host clamping, then the existing 1..64 worker budget. Values resolving above 64, broader defaults and Browser/watch combinations remain unqualified.',
      scope:
        'Bounded Node/RSC file workers for one-shot execution and development watch; browser client files and browser/application leases run serially.',
      inputAcquisition:
        'Input snapshots preserve baseline and publication barriers. A cooperative scheduler refills up to 32 read slots; cancellation or failure joins every started operation. Keyed consumers do not depend on map insertion order. Simultaneous filesystem failures retain the first observed original error.',
      sharding:
        'One-based INDEX/COUNT partitions filtered root-relative physical paths by SHA-1 into balanced contiguous shards, then uses fresh-run project-name and descending-size order. More shards than files require passWithNoTests; admitted empty assignments publish zero-test results.',
      uncachedOrder:
        '--no-cache supports one selected isolated runtime project in one-shot Node or Browser execution. Source sizes provide unknown-first, descending-size stable fallback; shuffle keeps the selected partition and one captured seed. Specification ordering follows separate sharded/unsharded rules. Watch, typecheck, mixed projects, cached sequencing and persistent results remain separate work.',
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
        'Node one-shot supports discovery/cancellation; development/production Node watch also supports settled-run reruns. Isolated Node watch without coverage supports file/profile reruns. Stale/conflicting/running requests are refused; duplicates coalesce. Removed-file reruns still fail. Individual cases, debugging/snapshot updates, coverage, broader globalSetup/platform lifetimes and editor extensions remain unqualified.',
    },
    nativeBrowserWheel: {
      supported: true,
      scope:
        'Development/production Chromium wheel actions support pixel deltas, named directions and repeated steps with native scrolling and React updates. Fake-clock/RAF interactions, other engines and wider profiles remain unqualified.',
    },
    nativeBrowserTyping: {
      supported: true,
      scope:
        'Development/production Chromium typing supports BMP text and bounded key/modifier state, including skipClick/skipAutoClose. Right-side modifier aliases emit left-side events. Default keys release between attempts; setup keys keep their lifetime. Clipboard is Darwin Chromium only. Locator.type, other codes/options/platforms/engines, clipboard forms and supplementary Unicode remain unqualified. Progress callbacks are synchronous.',
    },
    listing: {
      supported: true,
      scope:
        '--list selects files. Default --list --json parses declarations without running setup/specs, retaining names, parameter placeholders, UTF-16 locations, project labels and cross-file focus. --staticParse=false collects facts without hooks, fixture factories or bodies. Application transforms, re-exported helpers and full transform/project/focus behavior remain unqualified.',
    },
    orderedSetup: {
      supported: true,
      scope: 'Sequential compiled setup in the same isolated file collection.',
    },
    staticFactoryMocks: {
      supported: true,
      api: 'vi.mock',
      scope:
        'Compiler-transformed static mocks support development Node, route-less RSC and development Chromium client entries, plus bounded production Node factories. Ordered setup registrations retain native input generations in development Node.',
      targets:
        'String-literal and type-safe literal import() ESM targets with static exports, including compiled package sources, resolved through the actual Next compiler context.',
      factories:
        'Inline synchronous or asynchronous factories with statically known object export keys; partial spreads only from compiler-verified awaited importOriginal namespaces.',
      bindings:
        'Factory object properties, including spread scalars, are captured values. Actual namespaces retain their live bindings and identity; static and dynamic mocked consumers share one compiler-owned namespace.',
      helpers:
        'Validated vi.hoisted, literal vi.importActual and supplied importOriginal callbacks use compiler-owned source identities. Route-less development Node supports literal importMock and hoisted unmock, ordered setup overrides, cached factory/manual namespaces and fresh automatic mocks. Development Chromium supports local ESM importMock/unmock within its bounded Browser scope.',
      staticImportOriginalCallback:
        'Static importOriginal is an ordinary zero-argument Function. Its inner async operation, Promise adoption, shared deferred original and owner fences are preserved. Browser and broader callback/profile combinations remain unqualified.',
      commonJsOriginals:
        'Isolated development Node literal importActual supports CommonJS objects, callable defaults, esModule, primitives and Promise exports. Aliases share original import/cache identity; calls return fresh outer Promises. Exported Promises remain default application values. Callable publication is bounded separately; reset and broader profiles remain unqualified.',
      commonJsImportMock:
        'Isolated development Node literal importMock automocks CommonJS objects, esModule, primitives and falsy-esModule exports. Certified callables, including async/generator forms, retain ordered getters/defaults, mock identities and cached original evaluation. Automatic mocks stay fresh and unused sources stay lazy. Hidden/default/getter flags, then-adopted root automocking, resets and other profiles remain unqualified.',
      callablePublication:
        'Isolated development Node importMock/importActual publishes completed certified leaf CommonJS callable namespaces with ordered named/inherited getters, defaults and strict receivers. The bounded self-default form needs one top-level binding assignment and one literal true flag. Other truthy/default/getter forms, authored require consumers, cycles/reset/partial boundaries, broader TLA/Promise behavior and other profiles remain unqualified.',
      commonJsFactories:
        'Isolated development Node supports compiled or empty CommonJS targets with explicit object factories, statically known export keys and no spreads. Originals stay unevaluated unless requested; repeated importOriginal calls retain namespace/cache identity. Other shapes, runtime registration, resets and profiles remain unqualified.',
      virtualBareFactories:
        'Isolated development Node object factories can supply unresolved bare/scoped requests. Graph imports share a cached namespace; importMock returns a distinct cached factory object with shared mutations. Missing relative paths, ignored requests and real externals keep existing admission. Missing-original error/cause/importer parity, runtime registration/reset and other profiles remain unqualified.',
      nodeBuiltinFactories:
        'Isolated development Node object factories mock certified builtins through local ESM. Bare/node names share identity; originals retain native namespaces. Hoisted unmock follows declaration order without running cancelled factories; framework/dependency resolution is unchanged. Cross-framework aliases, CommonJS mock consumers, qualified requests, runtime registration/reset and other profiles remain unqualified.',
      nativeExternalPackages:
        'Isolated development Node object/async factories mock certified queryless native packages through local ESM, retaining original CJS/ESM identity, import conditions and bounded diamonds/cycles. Hoisted unmock preserves order and laziness. CommonJS mock consumers, internal symlinks, undeclared dependencies, native addons, runtime/reset combinations and other profiles remain unqualified.',
      browserImportMock: {
        scope:
          'Route-less development Chromium entries with literal local ESM targets, without setup files, serializers or module-cache resets; cached factory/manual namespaces and hoisted unmock ordering are retained.',
        automatic:
          'The Browser loader evaluates a separate original root. Root evaluation and the first mock pass are cached by resolved target, captured native timestamp and automock/autospy mode; calls return fresh outer namespaces with cached mock functions. Dependencies, cycle backedges and held normal namespaces keep their existing cache.',
        asynchronous:
          'Original top-level await, native failure identity and afterAll release use the real loader completion. Unused pending imports are not automatically drained at file teardown; the per-file Browser realm closes normally.',
        unqualified: [
          'full Vitest import.meta.url scheme and pathname layout parity',
          'broader Browser setup, reset, coverage, automatic/runtime mock combinations and other profiles',
        ],
      },
      cycles:
        'Development Node supports one static target lazily loading a certified original ESM cycle, retaining pending ancestor bindings, new member awaits and namespace identity. Multi-target, dynamic-only, manual/setup and competing-actual cycles remain unqualified.',
      automatic:
        'Factory-free literal local ESM mocks use the pinned mockObject primitive; spy:true retains behavior and call state. Isolated Node named ESM consumers can spy on one leaf CommonJS implementation when its static export table and import references certify every requested name. Later actual imports keep separate evaluation.',
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
        'Isolated development Node supports direct imported vi/vitest calls with literal local leaf ESM targets or certified native CJS/ESM packages/builtins. Inline object factories require static export names; straight-line throw-only factories require a native or compiled leaf-ESM certificate.',
      behavior:
        'Factories run lazily with lexical closures. Replacement/unregistration preserves held namespaces; reset retains registrations and successful cached results. Overlapping pending leaf/native factories give the second consumer the original. Failures retry with fresh wrappers and original causes. Certified native static/runtime pairs retain protected static namespaces across reset. Unused registrations evaluate neither source nor factory.',
      compiledStaticGraphs:
        'Isolated development Node object factories support static relative queryless ESM graphs, diamonds and cycles. Static-import demand starts factories in source order with live namespaces, synchronous completed-mock reads and dependency resets. Mixed native imports, broader async/dynamic/CommonJS graphs, static/runtime mixtures and other profiles remain unqualified.',
      globalSetupWatch:
        'One isolated route-less development Node project with root JSON config and no coverage can retain fulfilled globalSetup with fresh context clones across watch runs. Pending/failed/cancelled setup stays run-owned; replacement/disposal joins teardown after tests, fixtures and afterAll. Setup edits still cause an extra generation. Executable configs, multiple/external projects, other profiles and coverage combinations remain open.',
      deferredLocatorHover:
        'Initially absent query Locators support hover/unhover through tracked native ownership and the actual-page realm barrier. Unhover keeps body-hover semantics and native options. Tight 60 ms healthy/body probes still fail in both reference and Next runs; broader timing and raw-stack parity remain unqualified.',
      booleanEnvironmentStubs:
        'Node fallback stubEnv maps exact DEV/PROD/SSR truthiness to 1/empty-string and deletes undefined values; ordinary names use primitive string coercion. Restore retains the first value, fluent scope guards and disposal. Public generics distinguish Boolean special names from ordinary string names. Browser delegation is unchanged.',
      suiteFactoryTypes:
        'The public type-only SuiteFactory supports default/generic/primitive fixture intersections and PromiseLike<void> callbacks. Direct suite overloads infer extra fixture context while retaining Context, void returns and runtime collection. FixtureOptions/Use remain unexported, matching the reference.',
      ownedWebKitHost:
        'The internal WebKit bridge owns SDK launch/bind/connect, verifies native context/page/session identity and reads frame/bootstrap bytes. Late cancellation and partial acquisition join unbind/close; disposal is idempotent and retains distinct errors and unrelated browsers. This covers only the host bridge; WebKit admission, classifier Promise semantics, coverage and Firefox remain open.',
      hookDeadlineSignal:
        'beforeEach, afterEach and returned beforeEach cleanup deadlines synchronously abort their case signal with DeadlineError before rejection/publication. Ordinary hook throws do not abort it; nonbody interruption, poisoning and publication rules are unchanged. Generic message differences, expected-failure exits, retry/repeat continuation differences and the general compiler comment-mapping defect remain open.',
      returnedHookCleanupBudgets:
        'Serial returned beforeEach callbacks use each hook timeout, including zero and inherited global budgets, without an extra outer cap. Parallel wrappers and other cleanup callers keep their existing behavior. Timeout text/origin and broader signal combinations remain open; hookDeadlineSignal covers abort timing separately.',
      errorReflection:
        'Node/Edge formatters store stack/frame-boundary metadata in a shared weak association without changing authored Error properties. Pure import does not install the cache. Existing stack guards, fallback parsing, headers and output remain intact across module copies, formatter replacement, changed messages and frozen/sealed Errors. Broader runtime combinations remain unqualified.',
      deferredLocatorSelect:
        'Initially absent query Locators support selectOptions in development/production Chromium. Validation precedes native admission; scalar/array strings and element handles retain options, event order, controlled React state, cancellation and cleanup. Other missing-query methods, broader engines and raw-stack parity remain unqualified.',
      compiledEsmRuntime:
        'Isolated development Node certified compiled ESM leaves preserve namespaces, export order, reset identity and pending-original fallback; leaf TLA works beside an unused target. Literal-object factory completion ordering still differs, and returned-importOriginal namespace factories are refused. Broader async dependencies, dynamic/reexport/native combinations and other profiles remain unqualified.',
      importOriginalCallback:
        'Runtime importOriginal is an ordinary zero-argument Function, preserving the inner async operation, Promise adoption, original owner and registration origin. Factory completion-order differences and broader async/profile combinations remain open.',
      compiledCommonJsRuntime:
        'Isolated development Node runtime factories support certified relative queryless CommonJS require graphs, resets, cycles and registration replacement. Pending Promise identity is retained; unused registrations stay lazy. The last-completing factory supplies the cached value, even after replacement. Direct require mocking, broader async/native-demand combinations and other profiles remain unqualified.',
      compiledTerminalThrow:
        'Isolated development Node compiled leaf-ESM targets accept inline terminal-throw factories after source/graph/alias/owner and then-export checks. Sync/async retries retain pending-original fallback, original causes, fresh wrappers and unused laziness. Transitive graphs, CommonJS and broader profiles remain unqualified.',
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
        'One isolated development Node project with JSON config and fulfilled globalSetup may keep a healthy watch run after setup-only edits selecting no consumers. Imported consumers and new tests run normally. Config changes, failure/cancellation, reruns, mixed edits and uncertain ownership execute normally. SIGINT teardown differences, executable/multiple-project configs, other profiles, coverage and broader lifetimes remain open.',
    },
    moduleCacheReset: {
      terminalExpressionExports:
        'Isolated development Node CommonJS reset graphs support named/anonymous function, async/generator and class expressions, identifier default/rest parameters, arrows and bounded shorthand defaults. Require cycles and held identities survive resets. A reset-only production Node subset is supported. Reflected global shape, destructured/computed forms, binding-self declarations and broader static/runtime combinations remain open.',
      anonymousFunctionExpressions:
        'Isolated development Node CommonJS reset/runtime targets support terminal module.exports anonymous ordinary functions with resolved identifier parameters and certified require dependencies/cycles. Other expression forms have separate terminalExpressionExports scope. Complex parameters and broader actual-helper/runtime registration remain unqualified.',
      supported: true,
      api: 'vi.resetModules',
      scope:
        'Isolated development Node dynamic imports reset compiled ESM and certified CommonJS object/callable graphs, including require dependencies/cycles. Relative queryless importActual shares reset generations; unused targets stay lazy. Native package/builtin resets retain source state and successful registrations. Node 20/22 leaf-Promise behavior and ordinary single-root native namespace identity remain gaps.',
      unsupported: [
        'CommonJS graph syntax beyond certified ordinary object/callable terminal exports, unresolved or dynamic require references and unqualified external targets',
        'CommonJS resets combined with static/runtime mocks, nonrelative importActual helpers and other unqualified execution profiles',
        'other execution profiles and the complete reset/cache interaction matrix',
      ],
    },
    affectedSelection: {
      browserSourcePlans:
        'Isolated development/production Browser client entries provide source/setup dependencies. Bounded Chromium/Firefox watch selection uses file hashes, one project, seed 1 and fileParallelism:false; opaque graphs widen selection. Computed dynamic requests, default/cross-project sequencing and coverage/runtime/cohort/route combinations remain open.',
      supported: true,
      scope:
        'One-shot --related/--changed uses isolated Node compiler dependencies and package conditions in development/production. Missing, incomplete, stale or opaque source/config evidence widens selection. Node changed watch begins with the bounded dirty-HEAD set, then follows source consumers. Other profiles and broader Git/watch combinations remain unqualified; productionRelatedWatch covers the separate related-watch subset.',
    },
    watch: {
      changedNodeInitialSelection:
        'Isolated development/production Node --watch --changed HEAD selects initial changed-source consumers; --related takes precedence. Later edits use the full registry and unrelated changes retain the report. Empty/staged/untracked/addition/deletion and invalid-ref/no-Git cases, other profiles/reporters/shards/platforms remain unqualified.',
      ordinaryProductionNode:
        'Isolated route-less production Node watch reruns source/dependency/config changes with fresh state. Syntax errors report no cases; recovery retains failure history. Interruption exits 130 and preserves the last complete report. Setup/globalSetup, coverage, snapshots, cohorts, mixed modes, RSC/routes, other platforms and broader combinations remain unqualified.',
      productionRegisteredComponents:
        'Route-less production Node browser drivers with registered fixtures rebuild for source/CSS changes, retaining SSR, hydration, provider context and native events. Cancellation preserves the last complete report. Production RSC, unregistered drivers, setup/coverage, other engines/platforms and broader lifecycle combinations remain unqualified.',
      supported: true,
      scope:
        'On POSIX, development Node/RSC and Node Browser drivers support watch; serial Chromium client watch supports development/production. Source/CSS reruns retain cleanup and terminal commands. Any failed generation keeps final exit 1; all-passing quit/interruption use 0/130. Active-q deadlines, other runtimes/engines/platforms, mixed modes, production setup/coverage/unregistered drivers and cleanup stress remain unqualified.',
    },
    snapshotUpdate: {
      supported: true,
      scope:
        'Local new-only/all updates support route-less development/production Node, RSC and Browser, explicit RSC routes with one source owner, and development Node/RSC watch. Browser writes wait for Browser/server disposal; partial selections retain unchecked snapshots.',
    },
    production: {
      supported: true,
      environments: ['node', 'rsc', 'browser'],
      scope:
        'Isolated production Node, route-less RSC dynamic subtrees, explicit RSC AppProject routes and Node Browser drivers use real production conditions. Chromium client files use production compiler/bootstrap data with React createRoot, JSX, CSS and native interactions. Registered components use production App Pages with SSR/hydration. Drivers need a separately built application; instant() requires explicit production instrumentation.',
      unsupported: [
        'implicit routing and streaming/static/route semantics beyond the explicit RSC subtree and force-dynamic full-route contracts',
        'prerender/PPR and Server Action transport for isolated RSC tests',
        'production automatic/manual/runtime mocks and broader setup/reset combinations',
        'RSC and broader transformed production coverage',
        'production Browser coverage beyond qualified one-shot isolated route-less Chromium source forms, setup combined with mocks/resets, broader rendering-helper contracts and other engines',
      ],
    },
    rscRouteRendering: {
      supported: true,
      api: 'rsc.renderRoute',
      streamingApi: 'rsc.renderRouteStream',
      scope:
        'Explicit development/production Turbopack Node force-dynamic routes with cacheScope: file render buffered/streamed HTML and Flight with layouts, request/provider context, redirects, after work and cancellation. Streams retain backpressure/first-commit metadata; debug bytes stay separate. Public debug transport/hydration, broader partial delivery, cache/staged/PPR/Edge cancellation and other profiles/platforms remain unqualified.',
      unsupported: [
        'implicit or static/prerender routes, Cache Components/PPR and Server Action transport',
        'client hydration, parallel routing beyond qualified same-AppPath initial matched pages, interception/navigation and other profiles/platforms',
      ],
    },
    browserComponents: {
      supported: true,
      mode: 'development',
      modes: ['development', 'production'],
      browser: 'chromium',
      scope:
        'Registered fixtures use real App Pages for SSR and hydration, including provider content, CSS and an optional project layout. Node drivers select registered IDs and JSON props. Development watch rebuilds nested dependencies and remounts fresh client state.',
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
        'Ordered development/production Chromium setup modules run before tests with top-level await, hooks, globals, CSS, file isolation and disposal. Exported Promises remain data; rejection stops later setup/tests. Maintained watch profiles follow setup dependencies and imported CSS; cancellation releases their artifacts.',
      unsupported: [
        'parallel setup and setup combined with mocks, module reset, coverage, serializers or custom realms',
        'other browser engines and broader release qualification',
        'complete setup rejection diagnostic-format parity',
      ],
    },
    browserViewport: {
      supported: true,
      scope:
        'Development Chromium applies viewport before page creation. Defaults are 414 by 896; partial dimensions keep the other default and zero is valid. Negative/fractional sizes fail before collection. Node application drivers keep their existing behavior; broader Browser profiles remain unqualified.',
    },
    domProviderWindow: {
      supported: true,
      scope:
        'Explicit jsdom/happy-dom providers retain event identity/cancellation, listener removal, overrides and teardown restoration, with stable event-method bindings and configurable matchMedia placeholder. Lazy getters stay deferred and teardown errors remain failures. Broader downstream DOM/profile behavior remains unqualified.',
    },
    browserInstances: {
      supported: true,
      scope:
        'Chromium/Firefox instances create independent development/production profiles with exact project labels, defaults, inherited viewport and parent/instance selection. Disabled instances run Node. Headless options/CLI overrides survive watch reloads; defaults depend on environment. Implicit-UI declaration locations, legacy no-instances behavior, WebKit and broader combinations remain unqualified.',
    },
    browserRendering: {
      supported: true,
      scope:
        'Development Chromium RTL supports render/effects/cleanup, renderHook and act; vitest-browser-react also supports development/production render/rerender/unmount, wrappers and hooks. Locators support live DOM-ordered, deduplicated and/or composition and nth(-1). Production RTL lacks React production act; broader helper versions, profiles, engines and concurrency remain unqualified.',
    },
    browserUserEvent: {
      supported: true,
      scope:
        'Chromium: development click/multiclick, hover/unhover and fill/clear; development/production selection and missing click/multiclick/fill use native waiting/recovery. Select accepts connected option elements/Locators or strings; select/upload arrays must be homogeneous. Tab, project-path/browser-File upload and drag/drop are native. Action errors reject; malformed transport is terminal. Other absent actions, selector/stack parity, wider setup/clipboard/upload forms, engines and cancellation/output remain unqualified.',
    },
    productionRelatedWatch: {
      supported: true,
      scope:
        'Development/production Node related watch selects initial source consumers, then follows dependency/shared edits while ignoring unrelated changes; SIGINT shuts down. Unknown evidence widens selection. Other changed-watch combinations, profiles, additions/deletions, empty selections, coverage and broader reporter/editor interactions remain unqualified.',
    },
    resultReports: {
      nodeSuiteErrorOwnership:
        'Isolated development/production Node reporters preserve suite-end error ownership and matching later diagnostics, including validated blob replay with legacy/wrong-slot fallback. DOM/custom, RSC, cohorts and Chromium add no association. Raw stacks remain intact; richer stack presentation, other profiles and watch reporter lifetimes remain unqualified.',
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
        'One-shot serial Node JS/package/ES-module TS/MTS reporters support console, case/module/run-end and onTestModuleQueued callbacks; JSX/TSX needs its own React import. Callback errors fail the command, preserving passing cases. Browser capture is bounded. Legacy blobs, watch, concurrency, CTS, aliases/plugins, broader typed/task APIs, Collected/Ready, coverage ordering and cancellation/profile combinations remain unqualified.',
      capturedBlobReplay:
        'Next blobs retain task graphs even with only the blob reporter. Next or Vitest 5.0.4 terminal blobs replay declarations, metadata and case/module/run-end callbacks without merge-root tests in isolated Node modes and development cohorts. Callback errors fail merge while preserving passing JSON/JUnit. Blobs without task graphs, function-valued options, concurrent/reflection breadth and watch remain unqualified.',
      scope:
        'Reports retain retry outcomes/attempts, mapped errors/output, attachments and snapshots, including cleaned development Node/RSC watch runs. --merge-reports accepts disjoint versioned Next blobs or Vitest 5.0.4 final tasks without compilation, including terminal runtime-skip/retry metadata. Foreign coverage/nonterminal tasks/other built-ins, full schema/terminal conformance, snapshot statistics and advanced adapters remain unqualified.',
    },
    testNamePattern: {
      supported: true,
      scope:
        'One-shot and initial watch -t/--testNamePattern matches ancestor-qualified names. Collected --list --json --staticParse=false uses the same selection; plain file listing rejects name filters.',
    },
    typescriptConfig: {
      supported: true,
      scope:
        'Compatible Next/Vitest/Vite test configs load in an isolated retained realm, translating discovery, globals, setup/globalSetup and provide. Bounded string aliases and transforms use the Next compiler; other compiler overrides and unimplemented settings are rejected.',
    },
    coverage: {
      pureNodeSourceRetention:
        'Isolated route-less development Node V8 node-line requests explicitly retain actual compiler sources, including an unchanged side-effect-free export-const module. The actual emitted module is loaded and its complete JSON, summary and LCOV counters match the pinned reference. Native SDK capability version1 and trailing optional request flag are producer-generated; false preserves old arities. Source coverage/Istanbul, production, Browser, cohorts and dependency profiles retain their independent paths. Broader source mapping and failure rendering remain unqualified.',
      privateProductionBrowserMaps:
        'Actual native-owned production Browser V8 conversion retains qualified JavaScript, ordinary TypeScript and classic/automatic JSX source owners through unique authored, emitted and native-map associations without changing counters. Named/default factory and Fragment imports, qualified local function/class component bindings and static member children retain complete reports on both Chromium SDKs. Root passes532 mapping/protocol controls. Public one-shot isolated route-less production Chromium JavaScript and ordinary TypeScript pass twelve source and twelve installed settings profiles each. The coherent f30c installed production TSX/ordinary JSX and development JavaScript sweep passes36 settings profiles,48 case rows,30 whole reports/70 maps and six strict original-reporter cancellation/no-publication checks across both SDKs, retaining actual formatter/assets/text/LCOV/summary, thresholds, CLI overrides and clean/disable behavior. Development ordinary TypeScript is integrated from twelve source settings profiles, ten full reports/eighteen maps and two strict cancellations using actual dev-v1 source/declaration/runtime facts; Root532 mapping/protocol and124CLI follow-up pass, and ordinary installed development TypeScript closes12 settings profiles/10reports18maps. SDK161 strict cancellation passes; originalSDK164 gate failure remains despite a passing bounded passive follow-up. The separate newer production ordinary.ts cancellation failure, other engines/providers, watch/routes/DOM, broader component/member/spread bindings and full acceptance remain open. Development JSX/TSX now retains real dev-v1 import roles and strict generated jsxDEV owners. Eight Root source/installed model profiles and the maintained actual Source CLI contract pass; all24 ordinary installed settings profiles across SDK1.61/1.64 match complete reports/assets and36 case rows. Four installed stat-candidate SIGINT/no-publication and exact recovery pairs pass while the old helper correction remains pending approval. Type-only/no-value imports, plain no-JSX TSX, mixed graphs and cancelled case-end parity remain unqualified.',
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
        'one-shot isolated route-less production Chromium client',
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
        profiles: [
          'development Node',
          'production Node',
          'one-shot isolated route-less development Chromium JavaScript/TypeScript',
          'one-shot isolated route-less production Chromium JavaScript/TypeScript/JSX/TSX',
        ],
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
          'Selected projects must share effective coverage settings. Explicit CLI fields override their configured counterparts. Initial clean, retained output with clean:false and reportOnFailure are qualified for one-shot isolated Node execution. The bounded Chromium source profiles additionally retain complete standard formatter output, clean:false, CLI overrides and threshold failures on both SDKs. Development ordinary TypeScript retains twelve installed settings profiles/ten reports/eighteen maps; its original SDK164 cancellation-gate failure remains unassigned despite a positive passive follow-up. Configured ordered threshold glob groups match complete Node26 development/production source and installed reports, including independent per-file modes, negative uncovered counts, empty matches and exact errors/exits. Threshold100/autoUpdate and broader combinations remain unqualified. Broader watch/configuration combinations, heterogeneous enabled project settings, Istanbul and other execution profiles remain unqualified.',
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
        'RSC coverage and Browser coverage beyond qualified one-shot isolated route-less Chromium source forms',
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
