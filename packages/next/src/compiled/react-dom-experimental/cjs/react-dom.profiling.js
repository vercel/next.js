/**
 * @license React
 * react-dom.profiling.min.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */


          'use strict';

/* global __REACT_DEVTOOLS_GLOBAL_HOOK__ */
if (
  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined' &&
  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart ===
    'function'
) {
  __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(new Error());
}
          var React = require("next/dist/compiled/react-experimental");
var Scheduler = require("next/dist/compiled/scheduler-experimental");

const Internals = {
  usingClientEntryPoint: false,
  Events: null,
  Dispatcher: {
    current: null
  }
};

// Do not require this module directly! Use normal `invariant` calls with
// template literal strings. The messages will be replaced with error codes
// during build.
function formatProdErrorMessage(code) {
  let url = 'https://reactjs.org/docs/error-decoder.html?invariant=' + code;

  for (let i = 1; i < arguments.length; i++) {
    url += '&args[]=' + encodeURIComponent(arguments[i]);
  }

  return "Minified React error #" + code + "; visit " + url + " for the full message or " + 'use the non-minified dev environment for full errors and additional ' + 'helpful warnings.';
}

const assign = Object.assign;

// -----------------------------------------------------------------------------
// Killswitch
//
// Flags that exist solely to turn off a change in case it causes a regression
// when it rolls out to prod. We should remove these as soon as possible.
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Land or remove (moderate effort)
//
// Flags that can be probably deleted or landed, but might require extra effort
// like migrating internal callers or performance testing.
// -----------------------------------------------------------------------------
// TODO: Finish rolling out in www

const enableClientRenderFallbackOnTextMismatch = true;
const enableFormActions = true;
const enableAsyncActions = true; // Not sure if www still uses this. We don't have a replacement but whatever we
// Slated for removal in the future (significant effort)
//
// These are experiments that didn't work out, and never shipped, but we can't
// delete from the codebase until we migrate internal callers.
// -----------------------------------------------------------------------------
// Add a callback property to suspense to notify which promises are currently
// in the update queue. This allows reporting and tracing of what is causing
// the user to see a loading state.
//
// Also allows hydration callbacks to fire when a dehydrated boundary gets
// hydrated or deleted.
//
// This will eventually be replaced by the Transition Tracing proposal.

const enableSuspenseCallback = false; // Experimental Scope support.

const enableLazyContextPropagation = false; // FB-only usage. The new API has different semantics.

const enableLegacyHidden = false; // Enables unstable_avoidThisFallback feature in Fiber
const enableHostSingletons = true;
const alwaysThrottleRetries = true;
// Chopping Block
//
// Planned feature deprecations and breaking changes. Sorted roughly in order of
// when we plan to enable them.
// -----------------------------------------------------------------------------
// This flag enables Strict Effects by default. We're not turning this on until
// after 18 because it requires migration work. Recommendation is to use
// <StrictMode /> to gradually upgrade components.
// If TRUE, trees rendered with createRoot will be StrictEffectsMode.
// If FALSE, these trees will be StrictLegacyMode.

const createRootStrictEffectsByDefault = false;
// React DOM Chopping Block
//
// Similar to main Chopping Block but only flags related to React DOM. These are
// grouped because we will likely batch all of them into a single major release.
// -----------------------------------------------------------------------------
// Disable support for comment nodes as React DOM containers. Already disabled
// in open source, but www codebase still relies on it. Need to remove.

const disableCommentsAsDOMContainers = true; // Disable javascript: URL strings in href for XSS protection.
// Debugging and DevTools
// -----------------------------------------------------------------------------
// Adds user timing marks for e.g. state updates, suspense, and work loop stuff,
// for an experimental timeline tool.

const enableSchedulingProfiler = true; // Helps identify side effects in render-phase lifecycle hooks and setState

const enableProfilerTimer = true; // Record durations for commit and passive effects phases.

const enableProfilerCommitHooks = true; // Phase param passed to onRender callback differentiates between an "update" and a "cascading-update".

const enableProfilerNestedUpdatePhase = true; // Adds verbose console logging for e.g. state updates, suspense, and work loop

const ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

const ReactCurrentDispatcher$2 = ReactSharedInternals.ReactCurrentDispatcher; // Since the "not pending" value is always the same, we can reuse the
// same object across all transitions.

const sharedNotPendingObject = {
  pending: false,
  data: null,
  method: null,
  action: null
};
const NotPending = sharedNotPendingObject;

function resolveDispatcher() {
  // Copied from react/src/ReactHooks.js. It's the same thing but in a
  // different package.
  const dispatcher = ReactCurrentDispatcher$2.current;
  // intentionally don't throw our own error because this is in a hot path.
  // Also helps ensure this is inlined.


  return dispatcher;
}

function useFormStatus() {
  {
    const dispatcher = resolveDispatcher(); // $FlowFixMe[not-a-function] We know this exists because of the feature check above.

    return dispatcher.useHostTransitionStatus();
  }
}
function useFormState(action, initialState, permalink) {
  {
    const dispatcher = resolveDispatcher(); // $FlowFixMe[not-a-function] This is unstable, thus optional

    return dispatcher.useFormState(action, initialState, permalink);
  }
}

const valueStack = [];

let index = -1;

function createCursor(defaultValue) {
  return {
    current: defaultValue
  };
}

function pop(cursor, fiber) {
  if (index < 0) {

    return;
  }

  cursor.current = valueStack[index];
  valueStack[index] = null;

  index--;
}

function push(cursor, value, fiber) {
  index++;
  valueStack[index] = cursor.current;

  cursor.current = value;
}

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
// The Symbol used to tag the ReactElement-like types.
const REACT_ELEMENT_TYPE = Symbol.for('react.element');
const REACT_PORTAL_TYPE = Symbol.for('react.portal');
const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
const REACT_PROFILER_TYPE = Symbol.for('react.profiler');
const REACT_PROVIDER_TYPE = Symbol.for('react.provider');
const REACT_CONTEXT_TYPE = Symbol.for('react.context');
const REACT_SERVER_CONTEXT_TYPE = Symbol.for('react.server_context');
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
const REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
const REACT_MEMO_TYPE = Symbol.for('react.memo');
const REACT_LAZY_TYPE = Symbol.for('react.lazy');
const REACT_SCOPE_TYPE = Symbol.for('react.scope');
const REACT_DEBUG_TRACING_MODE_TYPE = Symbol.for('react.debug_trace_mode');
const REACT_OFFSCREEN_TYPE = Symbol.for('react.offscreen');
const REACT_LEGACY_HIDDEN_TYPE = Symbol.for('react.legacy_hidden');
const REACT_CACHE_TYPE = Symbol.for('react.cache');
const REACT_TRACING_MARKER_TYPE = Symbol.for('react.tracing_marker');
const REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED = Symbol.for('react.default_value');
const REACT_MEMO_CACHE_SENTINEL = Symbol.for('react.memo_cache_sentinel');
const REACT_POSTPONE_TYPE = Symbol.for('react.postpone');
const MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
const FAUX_ITERATOR_SYMBOL = '@@iterator';
function getIteratorFn(maybeIterable) {
  if (maybeIterable === null || typeof maybeIterable !== 'object') {
    return null;
  }

  const maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];

  if (typeof maybeIterator === 'function') {
    return maybeIterator;
  }

  return null;
}

const contextStackCursor$1 = createCursor(null);
const contextFiberStackCursor = createCursor(null);
const rootInstanceStackCursor = createCursor(null); // Represents the nearest host transition provider (in React DOM, a <form />)
// NOTE: Since forms cannot be nested, and this feature is only implemented by
// React DOM, we don't technically need this to be a stack. It could be a single
// module variable instead.

const hostTransitionProviderCursor = createCursor(null); // TODO: This should initialize to NotPendingTransition, a constant
// imported from the fiber config. However, because of a cycle in the module
// graph, that value isn't defined during this module's initialization. I can't
// think of a way to work around this without moving that value out of the
// fiber config. For now, the "no provider" case is handled when reading,
// inside useHostTransitionStatus.

const HostTransitionContext = {
  $$typeof: REACT_CONTEXT_TYPE,
  _currentValue: null,
  _currentValue2: null,
  _threadCount: 0,
  Provider: null,
  Consumer: null,
  _defaultValue: null,
  _globalName: null
};

function requiredContext(c) {

  return c;
}

function getCurrentRootHostContainer() {
  return rootInstanceStackCursor.current;
}

function getRootHostContainer() {
  const rootInstance = requiredContext(rootInstanceStackCursor.current);
  return rootInstance;
}

function pushHostContainer(fiber, nextRootInstance) {
  // Push current root instance onto the stack;
  // This allows us to reset root when portals are popped.
  push(rootInstanceStackCursor, nextRootInstance); // Track the context and the Fiber that provided it.
  // This enables us to pop only Fibers that provide unique contexts.

  push(contextFiberStackCursor, fiber); // Finally, we need to push the host context to the stack.
  // However, we can't just call getRootHostContext() and push it because
  // we'd have a different number of entries on the stack depending on
  // whether getRootHostContext() throws somewhere in renderer code or not.
  // So we push an empty value first. This lets us safely unwind on errors.

  push(contextStackCursor$1, null);
  const nextRootContext = getRootHostContext(nextRootInstance); // Now that we know this function doesn't throw, replace it.

  pop(contextStackCursor$1);
  push(contextStackCursor$1, nextRootContext);
}

function popHostContainer(fiber) {
  pop(contextStackCursor$1);
  pop(contextFiberStackCursor);
  pop(rootInstanceStackCursor);
}

function getHostContext() {
  const context = requiredContext(contextStackCursor$1.current);
  return context;
}

function pushHostContext(fiber) {
  {
    const stateHook = fiber.memoizedState;

    if (stateHook !== null) {
      // Only provide context if this fiber has been upgraded by a host
      // transition. We use the same optimization for regular host context below.
      push(hostTransitionProviderCursor, fiber);
    }
  }

  const context = requiredContext(contextStackCursor$1.current);
  const nextContext = getChildHostContext(context, fiber.type); // Don't push this Fiber's context unless it's unique.

  if (context !== nextContext) {
    // Track the context and the Fiber that provided it.
    // This enables us to pop only Fibers that provide unique contexts.
    push(contextFiberStackCursor, fiber);
    push(contextStackCursor$1, nextContext);
  }
}

function popHostContext(fiber) {
  if (contextFiberStackCursor.current === fiber) {
    // Do not pop unless this Fiber provided the current context.
    // pushHostContext() only pushes Fibers that provide unique contexts.
    pop(contextStackCursor$1);
    pop(contextFiberStackCursor);
  }

  {
    if (hostTransitionProviderCursor.current === fiber) {
      // Do not pop unless this Fiber provided the current context. This is mostly
      // a performance optimization, but conveniently it also prevents a potential
      // data race where a host provider is upgraded (i.e. memoizedState becomes
      // non-null) during a concurrent event. This is a bit of a flaw in the way
      // we upgrade host components, but because we're accounting for it here, it
      // should be fine.
      pop(hostTransitionProviderCursor); // When popping the transition provider, we reset the context value back
      // to `null`. We can do this because you're not allowd to nest forms. If
      // we allowed for multiple nested host transition providers, then we'd
      // need to reset this to the parent provider's status.

      {
        HostTransitionContext._currentValue = null;
      }
    }
  }
}

const NoFlags$1 =
/*                      */
0b0000000000000000000000000000;
const PerformedWork =
/*                */
0b0000000000000000000000000001;
const Placement =
/*                    */
0b0000000000000000000000000010;
const DidCapture =
/*                   */
0b0000000000000000000010000000;
const Hydrating =
/*                    */
0b0000000000000001000000000000; // You can change the rest (and add more).

const Update =
/*                       */
0b0000000000000000000000000100;
/* Skipped value:                                 0b0000000000000000000000001000; */

const ChildDeletion =
/*                */
0b0000000000000000000000010000;
const ContentReset =
/*                 */
0b0000000000000000000000100000;
const Callback =
/*                     */
0b0000000000000000000001000000;
/* Used by DidCapture:                            0b0000000000000000000010000000; */

const ForceClientRender =
/*            */
0b0000000000000000000100000000;
const Ref =
/*                          */
0b0000000000000000001000000000;
const Snapshot =
/*                     */
0b0000000000000000010000000000;
const Passive$1 =
/*                      */
0b0000000000000000100000000000;
/* Used by Hydrating:                             0b0000000000000001000000000000; */

const Visibility =
/*                   */
0b0000000000000010000000000000;
const StoreConsistency =
/*             */
0b0000000000000100000000000000; // It's OK to reuse these bits because these flags are mutually exclusive for
// different fiber types. We should really be doing this for as many flags as
// possible, because we're about to run out of bits.

const ScheduleRetry = StoreConsistency;
const ShouldSuspendCommit = Visibility;
const LifecycleEffectMask = Passive$1 | Update | Callback | Ref | Snapshot | StoreConsistency; // Union of all commit flags (flags with the lifetime of a particular commit)

const HostEffectMask =
/*               */
0b0000000000000111111111111111; // These are not really side effects, but we still reuse this field.

const Incomplete =
/*                   */
0b0000000000001000000000000000;
const ShouldCapture =
/*                */
0b0000000000010000000000000000;
const ForceUpdateForLegacySuspense =
/* */
0b0000000000100000000000000000;
const Forked =
/*                       */
0b0000000100000000000000000000; // Static tags describe aspects of a fiber that are not specific to a render,
// e.g. a fiber uses a passive effect (even if there are no updates on this particular render).
// This enables us to defer more work in the unmount case,
// since we can defer traversing the tree during layout to look for Passive effects,
// and instead rely on the static flag as a signal that there may be cleanup work.

const RefStatic =
/*                    */
0b0000001000000000000000000000;
const LayoutStatic =
/*                 */
0b0000010000000000000000000000;
const PassiveStatic =
/*                */
0b0000100000000000000000000000;
const MaySuspendCommit =
/*             */
0b0001000000000000000000000000; // Flag used to identify newly inserted fibers. It isn't reset after commit unlike `Placement`.

const PlacementDEV =
/*                 */
0b0010000000000000000000000000;
// don't contain effects, by checking subtreeFlags.

const BeforeMutationMask = // TODO: Remove Update flag from before mutation phase by re-landing Visibility
// flag logic (see #20043)
Update | Snapshot | (0);
const MutationMask = Placement | Update | ChildDeletion | ContentReset | Ref | Hydrating | Visibility;
const LayoutMask = Update | Callback | Ref | Visibility; // TODO: Split into PassiveMountMask and PassiveUnmountMask

const PassiveMask = Passive$1 | Visibility | ChildDeletion; // Union of tags that don't get reset on clones.
// This allows certain concepts to persist without recalculating them,
// e.g. whether a subtree contains passive effects or portals.

const StaticMask = LayoutStatic | PassiveStatic | RefStatic | MaySuspendCommit;

// This module only exists as an ESM wrapper around the external CommonJS
const scheduleCallback$3 = Scheduler.unstable_scheduleCallback;
const cancelCallback$1 = Scheduler.unstable_cancelCallback;
const shouldYield = Scheduler.unstable_shouldYield;
const requestPaint = Scheduler.unstable_requestPaint;
const now$1 = Scheduler.unstable_now;
const getCurrentPriorityLevel = Scheduler.unstable_getCurrentPriorityLevel;
const ImmediatePriority = Scheduler.unstable_ImmediatePriority;
const UserBlockingPriority = Scheduler.unstable_UserBlockingPriority;
const NormalPriority$1 = Scheduler.unstable_NormalPriority;
const LowPriority = Scheduler.unstable_LowPriority;
const IdlePriority = Scheduler.unstable_IdlePriority; // this doesn't actually exist on the scheduler, but it *does*

let rendererID = null;
let injectedHook = null;
let injectedProfilingHooks = null;
const isDevToolsPresent = typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined';
function injectInternals(internals) {
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === 'undefined') {
    // No DevTools
    return false;
  }

  const hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;

  if (hook.isDisabled) {
    // This isn't a real property on the hook, but it can be set to opt out
    // of DevTools integration and associated warnings and logs.
    // https://github.com/facebook/react/issues/3877
    return true;
  }

  if (!hook.supportsFiber) {


    return true;
  }

  try {
    if (enableSchedulingProfiler) {
      // Conditionally inject these hooks only if Timeline profiler is supported by this build.
      // This gives DevTools a way to feature detect that isn't tied to version number
      // (since profiling and timeline are controlled by different feature flags).
      internals = assign({}, internals, {
        getLaneLabelMap,
        injectProfilingHooks
      });
    }

    rendererID = hook.inject(internals); // We have successfully injected, so now it is safe to set up hooks.

    injectedHook = hook;
  } catch (err) {
  }

  if (hook.checkDCE) {
    // This is the real DevTools.
    return true;
  } else {
    // This is likely a hook installed by Fast Refresh runtime.
    return false;
  }
}
function onCommitRoot(root, eventPriority) {
  if (injectedHook && typeof injectedHook.onCommitFiberRoot === 'function') {
    try {
      const didError = (root.current.flags & DidCapture) === DidCapture;

      if (enableProfilerTimer) {
        let schedulerPriority;

        switch (eventPriority) {
          case DiscreteEventPriority:
            schedulerPriority = ImmediatePriority;
            break;

          case ContinuousEventPriority:
            schedulerPriority = UserBlockingPriority;
            break;

          case DefaultEventPriority:
            schedulerPriority = NormalPriority$1;
            break;

          case IdleEventPriority:
            schedulerPriority = IdlePriority;
            break;

          default:
            schedulerPriority = NormalPriority$1;
            break;
        }

        injectedHook.onCommitFiberRoot(rendererID, root, schedulerPriority, didError);
      }
    } catch (err) {
    }
  }
}
function onPostCommitRoot(root) {
  if (injectedHook && typeof injectedHook.onPostCommitFiberRoot === 'function') {
    try {
      injectedHook.onPostCommitFiberRoot(rendererID, root);
    } catch (err) {
    }
  }
}
function onCommitUnmount(fiber) {
  if (injectedHook && typeof injectedHook.onCommitFiberUnmount === 'function') {
    try {
      injectedHook.onCommitFiberUnmount(rendererID, fiber);
    } catch (err) {
    }
  }
}

function injectProfilingHooks(profilingHooks) {
  injectedProfilingHooks = profilingHooks;
}

function getLaneLabelMap() {
  {
    const map = new Map();
    let lane = 1;

    for (let index = 0; index < TotalLanes; index++) {
      const label = getLabelForLane(lane);
      map.set(lane, label);
      lane *= 2;
    }

    return map;
  }
}

function markCommitStarted(lanes) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markCommitStarted === 'function') {
      injectedProfilingHooks.markCommitStarted(lanes);
    }
  }
}
function markCommitStopped() {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markCommitStopped === 'function') {
      injectedProfilingHooks.markCommitStopped();
    }
  }
}
function markComponentRenderStarted(fiber) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentRenderStarted === 'function') {
      injectedProfilingHooks.markComponentRenderStarted(fiber);
    }
  }
}
function markComponentRenderStopped() {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentRenderStopped === 'function') {
      injectedProfilingHooks.markComponentRenderStopped();
    }
  }
}
function markComponentPassiveEffectMountStarted(fiber) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentPassiveEffectMountStarted === 'function') {
      injectedProfilingHooks.markComponentPassiveEffectMountStarted(fiber);
    }
  }
}
function markComponentPassiveEffectMountStopped() {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentPassiveEffectMountStopped === 'function') {
      injectedProfilingHooks.markComponentPassiveEffectMountStopped();
    }
  }
}
function markComponentPassiveEffectUnmountStarted(fiber) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentPassiveEffectUnmountStarted === 'function') {
      injectedProfilingHooks.markComponentPassiveEffectUnmountStarted(fiber);
    }
  }
}
function markComponentPassiveEffectUnmountStopped() {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentPassiveEffectUnmountStopped === 'function') {
      injectedProfilingHooks.markComponentPassiveEffectUnmountStopped();
    }
  }
}
function markComponentLayoutEffectMountStarted(fiber) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentLayoutEffectMountStarted === 'function') {
      injectedProfilingHooks.markComponentLayoutEffectMountStarted(fiber);
    }
  }
}
function markComponentLayoutEffectMountStopped() {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentLayoutEffectMountStopped === 'function') {
      injectedProfilingHooks.markComponentLayoutEffectMountStopped();
    }
  }
}
function markComponentLayoutEffectUnmountStarted(fiber) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentLayoutEffectUnmountStarted === 'function') {
      injectedProfilingHooks.markComponentLayoutEffectUnmountStarted(fiber);
    }
  }
}
function markComponentLayoutEffectUnmountStopped() {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentLayoutEffectUnmountStopped === 'function') {
      injectedProfilingHooks.markComponentLayoutEffectUnmountStopped();
    }
  }
}
function markComponentErrored(fiber, thrownValue, lanes) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentErrored === 'function') {
      injectedProfilingHooks.markComponentErrored(fiber, thrownValue, lanes);
    }
  }
}
function markComponentSuspended(fiber, wakeable, lanes) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markComponentSuspended === 'function') {
      injectedProfilingHooks.markComponentSuspended(fiber, wakeable, lanes);
    }
  }
}
function markLayoutEffectsStarted(lanes) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markLayoutEffectsStarted === 'function') {
      injectedProfilingHooks.markLayoutEffectsStarted(lanes);
    }
  }
}
function markLayoutEffectsStopped() {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markLayoutEffectsStopped === 'function') {
      injectedProfilingHooks.markLayoutEffectsStopped();
    }
  }
}
function markPassiveEffectsStarted(lanes) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markPassiveEffectsStarted === 'function') {
      injectedProfilingHooks.markPassiveEffectsStarted(lanes);
    }
  }
}
function markPassiveEffectsStopped() {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markPassiveEffectsStopped === 'function') {
      injectedProfilingHooks.markPassiveEffectsStopped();
    }
  }
}
function markRenderStarted(lanes) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markRenderStarted === 'function') {
      injectedProfilingHooks.markRenderStarted(lanes);
    }
  }
}
function markRenderYielded() {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markRenderYielded === 'function') {
      injectedProfilingHooks.markRenderYielded();
    }
  }
}
function markRenderStopped() {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markRenderStopped === 'function') {
      injectedProfilingHooks.markRenderStopped();
    }
  }
}
function markRenderScheduled(lane) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markRenderScheduled === 'function') {
      injectedProfilingHooks.markRenderScheduled(lane);
    }
  }
}
function markForceUpdateScheduled(fiber, lane) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markForceUpdateScheduled === 'function') {
      injectedProfilingHooks.markForceUpdateScheduled(fiber, lane);
    }
  }
}
function markStateUpdateScheduled(fiber, lane) {
  {
    if (injectedProfilingHooks !== null && typeof injectedProfilingHooks.markStateUpdateScheduled === 'function') {
      injectedProfilingHooks.markStateUpdateScheduled(fiber, lane);
    }
  }
}

const NoMode =
/*                         */
0b0000000; // TODO: Remove ConcurrentMode by reading from the root tag instead

const ConcurrentMode =
/*                 */
0b0000001;
const ProfileMode =
/*                    */
0b0000010;
const StrictLegacyMode =
/*               */
0b0001000;
const StrictEffectsMode =
/*              */
0b0010000;

// TODO: This is pretty well supported by browsers. Maybe we can drop it.
const clz32 = Math.clz32 ? Math.clz32 : clz32Fallback; // Count leading zeros.
// Based on:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32

const log = Math.log;
const LN2 = Math.LN2;

function clz32Fallback(x) {
  const asUint = x >>> 0;

  if (asUint === 0) {
    return 32;
  }

  return 31 - (log(asUint) / LN2 | 0) | 0;
}

// TODO: Ideally these types would be opaque but that doesn't work well with
// If those values are changed that package should be rebuilt and redeployed.

const TotalLanes = 31;
const NoLanes =
/*                        */
0b0000000000000000000000000000000;
const NoLane =
/*                          */
0b0000000000000000000000000000000;
const SyncHydrationLane =
/*               */
0b0000000000000000000000000000001;
const SyncLane =
/*                        */
0b0000000000000000000000000000010;
const SyncLaneIndex = 1;
const InputContinuousHydrationLane =
/*    */
0b0000000000000000000000000000100;
const InputContinuousLane =
/*             */
0b0000000000000000000000000001000;
const DefaultHydrationLane =
/*            */
0b0000000000000000000000000010000;
const DefaultLane =
/*                     */
0b0000000000000000000000000100000;
const SyncUpdateLanes = SyncLane | InputContinuousLane | DefaultLane ;
const TransitionHydrationLane =
/*                */
0b0000000000000000000000001000000;
const TransitionLanes =
/*                       */
0b0000000001111111111111110000000;
const TransitionLane1 =
/*                        */
0b0000000000000000000000010000000;
const TransitionLane2 =
/*                        */
0b0000000000000000000000100000000;
const TransitionLane3 =
/*                        */
0b0000000000000000000001000000000;
const TransitionLane4 =
/*                        */
0b0000000000000000000010000000000;
const TransitionLane5 =
/*                        */
0b0000000000000000000100000000000;
const TransitionLane6 =
/*                        */
0b0000000000000000001000000000000;
const TransitionLane7 =
/*                        */
0b0000000000000000010000000000000;
const TransitionLane8 =
/*                        */
0b0000000000000000100000000000000;
const TransitionLane9 =
/*                        */
0b0000000000000001000000000000000;
const TransitionLane10 =
/*                       */
0b0000000000000010000000000000000;
const TransitionLane11 =
/*                       */
0b0000000000000100000000000000000;
const TransitionLane12 =
/*                       */
0b0000000000001000000000000000000;
const TransitionLane13 =
/*                       */
0b0000000000010000000000000000000;
const TransitionLane14 =
/*                       */
0b0000000000100000000000000000000;
const TransitionLane15 =
/*                       */
0b0000000001000000000000000000000;
const RetryLanes =
/*                            */
0b0000011110000000000000000000000;
const RetryLane1 =
/*                             */
0b0000000010000000000000000000000;
const RetryLane2 =
/*                             */
0b0000000100000000000000000000000;
const RetryLane3 =
/*                             */
0b0000001000000000000000000000000;
const RetryLane4 =
/*                             */
0b0000010000000000000000000000000;
const SomeRetryLane = RetryLane1;
const SelectiveHydrationLane =
/*          */
0b0000100000000000000000000000000;
const NonIdleLanes =
/*                          */
0b0000111111111111111111111111111;
const IdleHydrationLane =
/*               */
0b0001000000000000000000000000000;
const IdleLane =
/*                        */
0b0010000000000000000000000000000;
const OffscreenLane =
/*                   */
0b0100000000000000000000000000000;
const DeferredLane =
/*                    */
0b1000000000000000000000000000000; // Any lane that might schedule an update. This is used to detect infinite
// update loops, so it doesn't include hydration lanes or retries.

const UpdateLanes = SyncLane | InputContinuousLane | DefaultLane | TransitionLanes; // This function is used for the experimental timeline (react-devtools-timeline)
// It should be kept in sync with the Lanes values above.

function getLabelForLane(lane) {
  {
    if (lane & SyncHydrationLane) {
      return 'SyncHydrationLane';
    }

    if (lane & SyncLane) {
      return 'Sync';
    }

    if (lane & InputContinuousHydrationLane) {
      return 'InputContinuousHydration';
    }

    if (lane & InputContinuousLane) {
      return 'InputContinuous';
    }

    if (lane & DefaultHydrationLane) {
      return 'DefaultHydration';
    }

    if (lane & DefaultLane) {
      return 'Default';
    }

    if (lane & TransitionHydrationLane) {
      return 'TransitionHydration';
    }

    if (lane & TransitionLanes) {
      return 'Transition';
    }

    if (lane & RetryLanes) {
      return 'Retry';
    }

    if (lane & SelectiveHydrationLane) {
      return 'SelectiveHydration';
    }

    if (lane & IdleHydrationLane) {
      return 'IdleHydration';
    }

    if (lane & IdleLane) {
      return 'Idle';
    }

    if (lane & OffscreenLane) {
      return 'Offscreen';
    }

    if (lane & DeferredLane) {
      return 'Deferred';
    }
  }
}
const NoTimestamp = -1;
let nextTransitionLane = TransitionLane1;
let nextRetryLane = RetryLane1;

function getHighestPriorityLanes(lanes) {
  {
    const pendingSyncLanes = lanes & SyncUpdateLanes;

    if (pendingSyncLanes !== 0) {
      return pendingSyncLanes;
    }
  }

  switch (getHighestPriorityLane(lanes)) {
    case SyncHydrationLane:
      return SyncHydrationLane;

    case SyncLane:
      return SyncLane;

    case InputContinuousHydrationLane:
      return InputContinuousHydrationLane;

    case InputContinuousLane:
      return InputContinuousLane;

    case DefaultHydrationLane:
      return DefaultHydrationLane;

    case DefaultLane:
      return DefaultLane;

    case TransitionHydrationLane:
      return TransitionHydrationLane;

    case TransitionLane1:
    case TransitionLane2:
    case TransitionLane3:
    case TransitionLane4:
    case TransitionLane5:
    case TransitionLane6:
    case TransitionLane7:
    case TransitionLane8:
    case TransitionLane9:
    case TransitionLane10:
    case TransitionLane11:
    case TransitionLane12:
    case TransitionLane13:
    case TransitionLane14:
    case TransitionLane15:
      return lanes & TransitionLanes;

    case RetryLane1:
    case RetryLane2:
    case RetryLane3:
    case RetryLane4:
      return lanes & RetryLanes;

    case SelectiveHydrationLane:
      return SelectiveHydrationLane;

    case IdleHydrationLane:
      return IdleHydrationLane;

    case IdleLane:
      return IdleLane;

    case OffscreenLane:
      return OffscreenLane;

    case DeferredLane:
      // This shouldn't be reachable because deferred work is always entangled
      // with something else.
      return NoLanes;

    default:


      return lanes;
  }
}

function getNextLanes(root, wipLanes) {
  // Early bailout if there's no pending work left.
  const pendingLanes = root.pendingLanes;

  if (pendingLanes === NoLanes) {
    return NoLanes;
  }

  let nextLanes = NoLanes;
  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes; // Do not work on any idle work until all the non-idle work has finished,
  // even if the work is suspended.

  const nonIdlePendingLanes = pendingLanes & NonIdleLanes;

  if (nonIdlePendingLanes !== NoLanes) {
    const nonIdleUnblockedLanes = nonIdlePendingLanes & ~suspendedLanes;

    if (nonIdleUnblockedLanes !== NoLanes) {
      nextLanes = getHighestPriorityLanes(nonIdleUnblockedLanes);
    } else {
      const nonIdlePingedLanes = nonIdlePendingLanes & pingedLanes;

      if (nonIdlePingedLanes !== NoLanes) {
        nextLanes = getHighestPriorityLanes(nonIdlePingedLanes);
      }
    }
  } else {
    // The only remaining work is Idle.
    const unblockedLanes = pendingLanes & ~suspendedLanes;

    if (unblockedLanes !== NoLanes) {
      nextLanes = getHighestPriorityLanes(unblockedLanes);
    } else {
      if (pingedLanes !== NoLanes) {
        nextLanes = getHighestPriorityLanes(pingedLanes);
      }
    }
  }

  if (nextLanes === NoLanes) {
    // This should only be reachable if we're suspended
    // TODO: Consider warning in this path if a fallback timer is not scheduled.
    return NoLanes;
  } // If we're already in the middle of a render, switching lanes will interrupt
  // it and we'll lose our progress. We should only do this if the new lanes are
  // higher priority.


  if (wipLanes !== NoLanes && wipLanes !== nextLanes && // If we already suspended with a delay, then interrupting is fine. Don't
  // bother waiting until the root is complete.
  (wipLanes & suspendedLanes) === NoLanes) {
    const nextLane = getHighestPriorityLane(nextLanes);
    const wipLane = getHighestPriorityLane(wipLanes);

    if ( // Tests whether the next lane is equal or lower priority than the wip
    // one. This works because the bits decrease in priority as you go left.
    nextLane >= wipLane || // Default priority updates should not interrupt transition updates. The
    // only difference between default updates and transition updates is that
    // default updates do not support refresh transitions.
    nextLane === DefaultLane && (wipLane & TransitionLanes) !== NoLanes) {
      // Keep working on the existing in-progress tree. Do not interrupt.
      return wipLanes;
    }
  }

  return nextLanes;
}
function getEntangledLanes(root, renderLanes) {
  let entangledLanes = renderLanes;

  if ((entangledLanes & InputContinuousLane) !== NoLanes) {
    // When updates are sync by default, we entangle continuous priority updates
    // and default updates, so they render in the same batch. The only reason
    // they use separate lanes is because continuous updates should interrupt
    // transitions, but default updates should not.
    entangledLanes |= entangledLanes & DefaultLane;
  } // Check for entangled lanes and add them to the batch.
  //
  // A lane is said to be entangled with another when it's not allowed to render
  // in a batch that does not also include the other lane. Typically we do this
  // when multiple updates have the same source, and we only want to respond to
  // the most recent event from that source.
  //
  // Note that we apply entanglements *after* checking for partial work above.
  // This means that if a lane is entangled during an interleaved event while
  // it's already rendering, we won't interrupt it. This is intentional, since
  // entanglement is usually "best effort": we'll try our best to render the
  // lanes in the same batch, but it's not worth throwing out partially
  // completed work in order to do it.
  // TODO: Reconsider this. The counter-argument is that the partial work
  // represents an intermediate state, which we don't want to show to the user.
  // And by spending extra time finishing it, we're increasing the amount of
  // time it takes to show the final state, which is what they are actually
  // waiting for.
  //
  // For those exceptions where entanglement is semantically important,
  // we should ensure that there is no partial work at the
  // time we apply the entanglement.


  const allEntangledLanes = root.entangledLanes;

  if (allEntangledLanes !== NoLanes) {
    const entanglements = root.entanglements;
    let lanes = entangledLanes & allEntangledLanes;

    while (lanes > 0) {
      const index = pickArbitraryLaneIndex(lanes);
      const lane = 1 << index;
      entangledLanes |= entanglements[index];
      lanes &= ~lane;
    }
  }

  return entangledLanes;
}

function computeExpirationTime(lane, currentTime) {
  switch (lane) {
    case SyncHydrationLane:
    case SyncLane:
    case InputContinuousHydrationLane:
    case InputContinuousLane:
      // User interactions should expire slightly more quickly.
      //
      // NOTE: This is set to the corresponding constant as in Scheduler.js.
      // When we made it larger, a product metric in www regressed, suggesting
      // there's a user interaction that's being starved by a series of
      // synchronous updates. If that theory is correct, the proper solution is
      // to fix the starvation. However, this scenario supports the idea that
      // expiration times are an important safeguard when starvation
      // does happen.
      return currentTime + 250;

    case DefaultHydrationLane:
    case DefaultLane:
    case TransitionHydrationLane:
    case TransitionLane1:
    case TransitionLane2:
    case TransitionLane3:
    case TransitionLane4:
    case TransitionLane5:
    case TransitionLane6:
    case TransitionLane7:
    case TransitionLane8:
    case TransitionLane9:
    case TransitionLane10:
    case TransitionLane11:
    case TransitionLane12:
    case TransitionLane13:
    case TransitionLane14:
    case TransitionLane15:
      return currentTime + 5000;

    case RetryLane1:
    case RetryLane2:
    case RetryLane3:
    case RetryLane4:
      // TODO: Retries should be allowed to expire if they are CPU bound for
      // too long, but when I made this change it caused a spike in browser
      // crashes. There must be some other underlying bug; not super urgent but
      // ideally should figure out why and fix it. Unfortunately we don't have
      // a repro for the crashes, only detected via production metrics.
      return NoTimestamp;

    case SelectiveHydrationLane:
    case IdleHydrationLane:
    case IdleLane:
    case OffscreenLane:
    case DeferredLane:
      // Anything idle priority or lower should never expire.
      return NoTimestamp;

    default:

      return NoTimestamp;
  }
}

function markStarvedLanesAsExpired(root, currentTime) {
  // TODO: This gets called every time we yield. We can optimize by storing
  // the earliest expiration time on the root. Then use that to quickly bail out
  // of this function.
  const pendingLanes = root.pendingLanes;
  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes;
  const expirationTimes = root.expirationTimes; // Iterate through the pending lanes and check if we've reached their
  // expiration time. If so, we'll assume the update is being starved and mark
  // it as expired to force it to finish.
  // TODO: We should be able to replace this with upgradePendingLanesToSync
  //
  // We exclude retry lanes because those must always be time sliced, in order
  // to unwrap uncached promises.
  // TODO: Write a test for this

  let lanes = pendingLanes & ~RetryLanes;

  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;
    const expirationTime = expirationTimes[index];

    if (expirationTime === NoTimestamp) {
      // Found a pending lane with no expiration time. If it's not suspended, or
      // if it's pinged, assume it's CPU-bound. Compute a new expiration time
      // using the current time.
      if ((lane & suspendedLanes) === NoLanes || (lane & pingedLanes) !== NoLanes) {
        // Assumes timestamps are monotonically increasing.
        expirationTimes[index] = computeExpirationTime(lane, currentTime);
      }
    } else if (expirationTime <= currentTime) {
      // This lane expired
      root.expiredLanes |= lane;
    }

    lanes &= ~lane;
  }
} // This returns the highest priority pending lanes regardless of whether they
// are suspended.

function getHighestPriorityPendingLanes(root) {
  return getHighestPriorityLanes(root.pendingLanes);
}
function getLanesToRetrySynchronouslyOnError(root, originallyAttemptedLanes) {
  if (root.errorRecoveryDisabledLanes & originallyAttemptedLanes) {
    // The error recovery mechanism is disabled until these lanes are cleared.
    return NoLanes;
  }

  const everythingButOffscreen = root.pendingLanes & ~OffscreenLane;

  if (everythingButOffscreen !== NoLanes) {
    return everythingButOffscreen;
  }

  if (everythingButOffscreen & OffscreenLane) {
    return OffscreenLane;
  }

  return NoLanes;
}
function includesSyncLane(lanes) {
  return (lanes & (SyncLane | SyncHydrationLane)) !== NoLanes;
}
function includesNonIdleWork(lanes) {
  return (lanes & NonIdleLanes) !== NoLanes;
}
function includesOnlyRetries(lanes) {
  return (lanes & RetryLanes) === lanes;
}
function includesOnlyNonUrgentLanes(lanes) {
  // TODO: Should hydration lanes be included here? This function is only
  // used in `updateDeferredValueImpl`.
  const UrgentLanes = SyncLane | InputContinuousLane | DefaultLane;
  return (lanes & UrgentLanes) === NoLanes;
}
function includesOnlyTransitions(lanes) {
  return (lanes & TransitionLanes) === lanes;
}
function includesBlockingLane(root, lanes) {

  const SyncDefaultLanes = InputContinuousHydrationLane | InputContinuousLane | DefaultHydrationLane | DefaultLane;
  return (lanes & SyncDefaultLanes) !== NoLanes;
}
function includesExpiredLane(root, lanes) {
  // This is a separate check from includesBlockingLane because a lane can
  // expire after a render has already started.
  return (lanes & root.expiredLanes) !== NoLanes;
}
function isTransitionLane(lane) {
  return (lane & TransitionLanes) !== NoLanes;
}
function claimNextTransitionLane() {
  // Cycle through the lanes, assigning each new transition to the next lane.
  // In most cases, this means every transition gets its own lane, until we
  // run out of lanes and cycle back to the beginning.
  const lane = nextTransitionLane;
  nextTransitionLane <<= 1;

  if ((nextTransitionLane & TransitionLanes) === NoLanes) {
    nextTransitionLane = TransitionLane1;
  }

  return lane;
}
function claimNextRetryLane() {
  const lane = nextRetryLane;
  nextRetryLane <<= 1;

  if ((nextRetryLane & RetryLanes) === NoLanes) {
    nextRetryLane = RetryLane1;
  }

  return lane;
}
function getHighestPriorityLane(lanes) {
  return lanes & -lanes;
}
function pickArbitraryLane(lanes) {
  // This wrapper function gets inlined. Only exists so to communicate that it
  // doesn't matter which bit is selected; you can pick any bit without
  // affecting the algorithms where its used. Here I'm using
  // getHighestPriorityLane because it requires the fewest operations.
  return getHighestPriorityLane(lanes);
}

function pickArbitraryLaneIndex(lanes) {
  return 31 - clz32(lanes);
}

function laneToIndex(lane) {
  return pickArbitraryLaneIndex(lane);
}

function includesSomeLane(a, b) {
  return (a & b) !== NoLanes;
}
function isSubsetOfLanes(set, subset) {
  return (set & subset) === subset;
}
function mergeLanes(a, b) {
  return a | b;
}
function removeLanes(set, subset) {
  return set & ~subset;
}
function intersectLanes(a, b) {
  return a & b;
} // Seems redundant, but it changes the type from a single lane (used for
// updates) to a group of lanes (used for flushing work).

function laneToLanes(lane) {
  return lane;
}
function higherPriorityLane(a, b) {
  // This works because the bit ranges decrease in priority as you go left.
  return a !== NoLane && a < b ? a : b;
}
function createLaneMap(initial) {
  // Intentionally pushing one by one.
  // https://v8.dev/blog/elements-kinds#avoid-creating-holes
  const laneMap = [];

  for (let i = 0; i < TotalLanes; i++) {
    laneMap.push(initial);
  }

  return laneMap;
}
function markRootUpdated(root, updateLane) {
  root.pendingLanes |= updateLane; // If there are any suspended transitions, it's possible this new update
  // could unblock them. Clear the suspended lanes so that we can try rendering
  // them again.
  //
  // TODO: We really only need to unsuspend only lanes that are in the
  // `subtreeLanes` of the updated fiber, or the update lanes of the return
  // path. This would exclude suspended updates in an unrelated sibling tree,
  // since there's no way for this update to unblock it.
  //
  // We don't do this if the incoming update is idle, because we never process
  // idle updates until after all the regular updates have finished; there's no
  // way it could unblock a transition.

  if (updateLane !== IdleLane) {
    root.suspendedLanes = NoLanes;
    root.pingedLanes = NoLanes;
  }
}
function markRootSuspended$1(root, suspendedLanes, spawnedLane) {
  root.suspendedLanes |= suspendedLanes;
  root.pingedLanes &= ~suspendedLanes; // The suspended lanes are no longer CPU-bound. Clear their expiration times.

  const expirationTimes = root.expirationTimes;
  let lanes = suspendedLanes;

  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;
    expirationTimes[index] = NoTimestamp;
    lanes &= ~lane;
  }

  if (spawnedLane !== NoLane) {
    markSpawnedDeferredLane(root, spawnedLane, suspendedLanes);
  }
}
function markRootPinged(root, pingedLanes) {
  root.pingedLanes |= root.suspendedLanes & pingedLanes;
}
function markRootFinished(root, remainingLanes, spawnedLane) {
  const noLongerPendingLanes = root.pendingLanes & ~remainingLanes;
  root.pendingLanes = remainingLanes; // Let's try everything again

  root.suspendedLanes = NoLanes;
  root.pingedLanes = NoLanes;
  root.expiredLanes &= remainingLanes;
  root.entangledLanes &= remainingLanes;
  root.errorRecoveryDisabledLanes &= remainingLanes;
  root.shellSuspendCounter = 0;
  const entanglements = root.entanglements;
  const expirationTimes = root.expirationTimes;
  const hiddenUpdates = root.hiddenUpdates; // Clear the lanes that no longer have pending work

  let lanes = noLongerPendingLanes;

  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;
    entanglements[index] = NoLanes;
    expirationTimes[index] = NoTimestamp;
    const hiddenUpdatesForLane = hiddenUpdates[index];

    if (hiddenUpdatesForLane !== null) {
      hiddenUpdates[index] = null; // "Hidden" updates are updates that were made to a hidden component. They
      // have special logic associated with them because they may be entangled
      // with updates that occur outside that tree. But once the outer tree
      // commits, they behave like regular updates.

      for (let i = 0; i < hiddenUpdatesForLane.length; i++) {
        const update = hiddenUpdatesForLane[i];

        if (update !== null) {
          update.lane &= ~OffscreenLane;
        }
      }
    }

    lanes &= ~lane;
  }

  if (spawnedLane !== NoLane) {
    markSpawnedDeferredLane(root, spawnedLane, // This render finished successfully without suspending, so we don't need
    // to entangle the spawned task with the parent task.
    NoLanes);
  }
}

function markSpawnedDeferredLane(root, spawnedLane, entangledLanes) {
  // This render spawned a deferred task. Mark it as pending.
  root.pendingLanes |= spawnedLane;
  root.suspendedLanes &= ~spawnedLane; // Entangle the spawned lane with the DeferredLane bit so that we know it
  // was the result of another render. This lets us avoid a useDeferredValue
  // waterfall — only the first level will defer.

  const spawnedLaneIndex = laneToIndex(spawnedLane);
  root.entangledLanes |= spawnedLane;
  root.entanglements[spawnedLaneIndex] |= DeferredLane | // If the parent render task suspended, we must also entangle those lanes
  // with the spawned task, so that the deferred task includes all the same
  // updates that the parent task did. We can exclude any lane that is not
  // used for updates (e.g. Offscreen).
  entangledLanes & UpdateLanes;
}

function markRootEntangled(root, entangledLanes) {
  // In addition to entangling each of the given lanes with each other, we also
  // have to consider _transitive_ entanglements. For each lane that is already
  // entangled with *any* of the given lanes, that lane is now transitively
  // entangled with *all* the given lanes.
  //
  // Translated: If C is entangled with A, then entangling A with B also
  // entangles C with B.
  //
  // If this is hard to grasp, it might help to intentionally break this
  // function and look at the tests that fail in ReactTransition-test.js. Try
  // commenting out one of the conditions below.
  const rootEntangledLanes = root.entangledLanes |= entangledLanes;
  const entanglements = root.entanglements;
  let lanes = rootEntangledLanes;

  while (lanes) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;

    if ( // Is this one of the newly entangled lanes?
    lane & entangledLanes | // Is this lane transitively entangled with the newly entangled lanes?
    entanglements[index] & entangledLanes) {
      entanglements[index] |= entangledLanes;
    }

    lanes &= ~lane;
  }
}
function upgradePendingLaneToSync(root, lane) {
  // Since we're upgrading the priority of the given lane, there is now pending
  // sync work.
  root.pendingLanes |= SyncLane; // Entangle the sync lane with the lane we're upgrading. This means SyncLane
  // will not be allowed to finish without also finishing the given lane.

  root.entangledLanes |= SyncLane;
  root.entanglements[SyncLaneIndex] |= lane;
}
function upgradePendingLanesToSync(root, lanesToUpgrade) {
  // Same as upgradePendingLaneToSync but accepts multiple lanes, so it's a
  // bit slower.
  root.pendingLanes |= SyncLane;
  root.entangledLanes |= SyncLane;
  let lanes = lanesToUpgrade;

  while (lanes) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;
    root.entanglements[SyncLaneIndex] |= lane;
    lanes &= ~lane;
  }
}
function markHiddenUpdate(root, update, lane) {
  const index = laneToIndex(lane);
  const hiddenUpdates = root.hiddenUpdates;
  const hiddenUpdatesForLane = hiddenUpdates[index];

  if (hiddenUpdatesForLane === null) {
    hiddenUpdates[index] = [update];
  } else {
    hiddenUpdatesForLane.push(update);
  }

  update.lane = lane | OffscreenLane;
}
function getBumpedLaneForHydration(root, renderLanes) {
  const renderLane = getHighestPriorityLane(renderLanes);
  let lane;

  if ((renderLane & SyncUpdateLanes) !== NoLane) {
    lane = SyncHydrationLane;
  } else {
    switch (renderLane) {
      case SyncLane:
        lane = SyncHydrationLane;
        break;

      case InputContinuousLane:
        lane = InputContinuousHydrationLane;
        break;

      case DefaultLane:
        lane = DefaultHydrationLane;
        break;

      case TransitionLane1:
      case TransitionLane2:
      case TransitionLane3:
      case TransitionLane4:
      case TransitionLane5:
      case TransitionLane6:
      case TransitionLane7:
      case TransitionLane8:
      case TransitionLane9:
      case TransitionLane10:
      case TransitionLane11:
      case TransitionLane12:
      case TransitionLane13:
      case TransitionLane14:
      case TransitionLane15:
      case RetryLane1:
      case RetryLane2:
      case RetryLane3:
      case RetryLane4:
        lane = TransitionHydrationLane;
        break;

      case IdleLane:
        lane = IdleHydrationLane;
        break;

      default:
        // Everything else is already either a hydration lane, or shouldn't
        // be retried at a hydration lane.
        lane = NoLane;
        break;
    }
  } // Check if the lane we chose is suspended. If so, that indicates that we
  // already attempted and failed to hydrate at that level. Also check if we're
  // already rendering that lane, which is rare but could happen.


  if ((lane & (root.suspendedLanes | renderLanes)) !== NoLane) {
    // Give up trying to hydrate and fall back to client render.
    return NoLane;
  }

  return lane;
}
function addFiberToLanesMap(root, fiber, lanes) {

  if (!isDevToolsPresent) {
    return;
  }

  const pendingUpdatersLaneMap = root.pendingUpdatersLaneMap;

  while (lanes > 0) {
    const index = laneToIndex(lanes);
    const lane = 1 << index;
    const updaters = pendingUpdatersLaneMap[index];
    updaters.add(fiber);
    lanes &= ~lane;
  }
}
function movePendingFibersToMemoized(root, lanes) {

  if (!isDevToolsPresent) {
    return;
  }

  const pendingUpdatersLaneMap = root.pendingUpdatersLaneMap;
  const memoizedUpdaters = root.memoizedUpdaters;

  while (lanes > 0) {
    const index = laneToIndex(lanes);
    const lane = 1 << index;
    const updaters = pendingUpdatersLaneMap[index];

    if (updaters.size > 0) {
      updaters.forEach(fiber => {
        const alternate = fiber.alternate;

        if (alternate === null || !memoizedUpdaters.has(alternate)) {
          memoizedUpdaters.add(fiber);
        }
      });
      updaters.clear();
    }

    lanes &= ~lane;
  }
}
function getTransitionsForLanes(root, lanes) {
  {
    return null;
  }
}

const DiscreteEventPriority = SyncLane;
const ContinuousEventPriority = InputContinuousLane;
const DefaultEventPriority = DefaultLane;
const IdleEventPriority = IdleLane;
let currentUpdatePriority = NoLane;
function getCurrentUpdatePriority() {
  return currentUpdatePriority;
}
function setCurrentUpdatePriority(newPriority) {
  currentUpdatePriority = newPriority;
}
function runWithPriority(priority, fn) {
  const previousPriority = currentUpdatePriority;

  try {
    currentUpdatePriority = priority;
    return fn();
  } finally {
    currentUpdatePriority = previousPriority;
  }
}
function higherEventPriority(a, b) {
  return a !== 0 && a < b ? a : b;
}
function lowerEventPriority(a, b) {
  return a === 0 || a > b ? a : b;
}
function isHigherEventPriority(a, b) {
  return a !== 0 && a < b;
}
function lanesToEventPriority(lanes) {
  const lane = getHighestPriorityLane(lanes);

  if (!isHigherEventPriority(DiscreteEventPriority, lane)) {
    return DiscreteEventPriority;
  }

  if (!isHigherEventPriority(ContinuousEventPriority, lane)) {
    return ContinuousEventPriority;
  }

  if (includesNonIdleWork(lane)) {
    return DefaultEventPriority;
  }

  return IdleEventPriority;
}

// $FlowFixMe[method-unbinding]
const hasOwnProperty = Object.prototype.hasOwnProperty;

const FunctionComponent = 0;
const ClassComponent = 1;
const IndeterminateComponent = 2; // Before we know whether it is function or class

const HostRoot = 3; // Root of a host tree. Could be nested inside another node.

const HostPortal = 4; // A subtree. Could be an entry point to a different renderer.

const HostComponent = 5;
const HostText = 6;
const Fragment = 7;
const Mode = 8;
const ContextConsumer = 9;
const ContextProvider = 10;
const ForwardRef = 11;
const Profiler = 12;
const SuspenseComponent = 13;
const MemoComponent = 14;
const SimpleMemoComponent = 15;
const LazyComponent = 16;
const IncompleteClassComponent = 17;
const DehydratedFragment = 18;
const SuspenseListComponent = 19;
const ScopeComponent = 21;
const OffscreenComponent = 22;
const LegacyHiddenComponent = 23;
const CacheComponent = 24;
const TracingMarkerComponent = 25;
const HostHoistable = 26;
const HostSingleton = 27;

const randomKey = Math.random().toString(36).slice(2);
const internalInstanceKey = '__reactFiber$' + randomKey;
const internalPropsKey = '__reactProps$' + randomKey;
const internalContainerInstanceKey = '__reactContainer$' + randomKey;
const internalEventHandlersKey = '__reactEvents$' + randomKey;
const internalEventHandlerListenersKey = '__reactListeners$' + randomKey;
const internalEventHandlesSetKey = '__reactHandles$' + randomKey;
const internalRootNodeResourcesKey = '__reactResources$' + randomKey;
const internalHoistableMarker = '__reactMarker$' + randomKey;
function detachDeletedInstance(node) {
  // TODO: This function is only called on host components. I don't think all of
  // these fields are relevant.
  delete node[internalInstanceKey];
  delete node[internalPropsKey];
  delete node[internalEventHandlersKey];
  delete node[internalEventHandlerListenersKey];
  delete node[internalEventHandlesSetKey];
}
function precacheFiberNode(hostInst, node) {
  node[internalInstanceKey] = hostInst;
}
function markContainerAsRoot(hostRoot, node) {
  // $FlowFixMe[prop-missing]
  node[internalContainerInstanceKey] = hostRoot;
}
function unmarkContainerAsRoot(node) {
  // $FlowFixMe[prop-missing]
  node[internalContainerInstanceKey] = null;
}
function isContainerMarkedAsRoot(node) {
  // $FlowFixMe[prop-missing]
  return !!node[internalContainerInstanceKey];
} // Given a DOM node, return the closest HostComponent or HostText fiber ancestor.
// If the target node is part of a hydrated or not yet rendered subtree, then
// this may also return a SuspenseComponent or HostRoot to indicate that.
// Conceptually the HostRoot fiber is a child of the Container node. So if you
// pass the Container node as the targetNode, you will not actually get the
// HostRoot back. To get to the HostRoot, you need to pass a child of it.
// The same thing applies to Suspense boundaries.

function getClosestInstanceFromNode(targetNode) {
  let targetInst = targetNode[internalInstanceKey];

  if (targetInst) {
    // Don't return HostRoot or SuspenseComponent here.
    return targetInst;
  } // If the direct event target isn't a React owned DOM node, we need to look
  // to see if one of its parents is a React owned DOM node.


  let parentNode = targetNode.parentNode;

  while (parentNode) {
    // We'll check if this is a container root that could include
    // React nodes in the future. We need to check this first because
    // if we're a child of a dehydrated container, we need to first
    // find that inner container before moving on to finding the parent
    // instance. Note that we don't check this field on  the targetNode
    // itself because the fibers are conceptually between the container
    // node and the first child. It isn't surrounding the container node.
    // If it's not a container, we check if it's an instance.
    targetInst = parentNode[internalContainerInstanceKey] || parentNode[internalInstanceKey];

    if (targetInst) {
      // Since this wasn't the direct target of the event, we might have
      // stepped past dehydrated DOM nodes to get here. However they could
      // also have been non-React nodes. We need to answer which one.
      // If we the instance doesn't have any children, then there can't be
      // a nested suspense boundary within it. So we can use this as a fast
      // bailout. Most of the time, when people add non-React children to
      // the tree, it is using a ref to a child-less DOM node.
      // Normally we'd only need to check one of the fibers because if it
      // has ever gone from having children to deleting them or vice versa
      // it would have deleted the dehydrated boundary nested inside already.
      // However, since the HostRoot starts out with an alternate it might
      // have one on the alternate so we need to check in case this was a
      // root.
      const alternate = targetInst.alternate;

      if (targetInst.child !== null || alternate !== null && alternate.child !== null) {
        // Next we need to figure out if the node that skipped past is
        // nested within a dehydrated boundary and if so, which one.
        let suspenseInstance = getParentSuspenseInstance(targetNode);

        while (suspenseInstance !== null) {
          // We found a suspense instance. That means that we haven't
          // hydrated it yet. Even though we leave the comments in the
          // DOM after hydrating, and there are boundaries in the DOM
          // that could already be hydrated, we wouldn't have found them
          // through this pass since if the target is hydrated it would
          // have had an internalInstanceKey on it.
          // Let's get the fiber associated with the SuspenseComponent
          // as the deepest instance.
          // $FlowFixMe[prop-missing]
          const targetSuspenseInst = suspenseInstance[internalInstanceKey];

          if (targetSuspenseInst) {
            return targetSuspenseInst;
          } // If we don't find a Fiber on the comment, it might be because
          // we haven't gotten to hydrate it yet. There might still be a
          // parent boundary that hasn't above this one so we need to find
          // the outer most that is known.


          suspenseInstance = getParentSuspenseInstance(suspenseInstance); // If we don't find one, then that should mean that the parent
          // host component also hasn't hydrated yet. We can return it
          // below since it will bail out on the isMounted check later.
        }
      }

      return targetInst;
    }

    targetNode = parentNode;
    parentNode = targetNode.parentNode;
  }

  return null;
}
/**
 * Given a DOM node, return the ReactDOMComponent or ReactDOMTextComponent
 * instance, or null if the node was not rendered by this React.
 */

function getInstanceFromNode(node) {
  const inst = node[internalInstanceKey] || node[internalContainerInstanceKey];

  if (inst) {
    const tag = inst.tag;

    if (tag === HostComponent || tag === HostText || tag === SuspenseComponent || (tag === HostHoistable ) || (tag === HostSingleton ) || tag === HostRoot) {
      return inst;
    } else {
      return null;
    }
  }

  return null;
}
/**
 * Given a ReactDOMComponent or ReactDOMTextComponent, return the corresponding
 * DOM node.
 */

function getNodeFromInstance(inst) {
  const tag = inst.tag;

  if (tag === HostComponent || (tag === HostHoistable ) || (tag === HostSingleton ) || tag === HostText) {
    // In Fiber this, is just the state node right now. We assume it will be
    // a host component or host text.
    return inst.stateNode;
  } // Without this first invariant, passing a non-DOM-component triggers the next
  // invariant for a missing parent, which is super confusing.


  throw Error(formatProdErrorMessage(33));
}
function getFiberCurrentPropsFromNode(node) {
  return node[internalPropsKey] || null;
}
function updateFiberProps(node, props) {
  node[internalPropsKey] = props;
}
function getEventListenerSet(node) {
  let elementListenerSet = node[internalEventHandlersKey];

  if (elementListenerSet === undefined) {
    elementListenerSet = node[internalEventHandlersKey] = new Set();
  }

  return elementListenerSet;
}
function getResourcesFromRoot(root) {
  let resources = root[internalRootNodeResourcesKey];

  if (!resources) {
    resources = root[internalRootNodeResourcesKey] = {
      hoistableStyles: new Map(),
      hoistableScripts: new Map()
    };
  }

  return resources;
}
function isMarkedHoistable(node) {
  return !!node[internalHoistableMarker];
}
function markNodeAsHoistable(node) {
  node[internalHoistableMarker] = true;
}
function isOwnedInstance(node) {
  return !!(node[internalHoistableMarker] || node[internalInstanceKey]);
}

const allNativeEvents = new Set();
/**
 * Mapping from registration name to event name
 */


const registrationNameDependencies = {};

function registerTwoPhaseEvent(registrationName, dependencies) {
  registerDirectEvent(registrationName, dependencies);
  registerDirectEvent(registrationName + 'Capture', dependencies);
}
function registerDirectEvent(registrationName, dependencies) {

  registrationNameDependencies[registrationName] = dependencies;

  for (let i = 0; i < dependencies.length; i++) {
    allNativeEvents.add(dependencies[i]);
  }
}

const canUseDOM = !!(typeof window !== 'undefined' && typeof window.document !== 'undefined' && typeof window.document.createElement !== 'undefined');

/* eslint-disable max-len */

const ATTRIBUTE_NAME_START_CHAR = ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
/* eslint-enable max-len */

const ATTRIBUTE_NAME_CHAR = ATTRIBUTE_NAME_START_CHAR + '\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
const VALID_ATTRIBUTE_NAME_REGEX = new RegExp('^[' + ATTRIBUTE_NAME_START_CHAR + '][' + ATTRIBUTE_NAME_CHAR + ']*$');
const illegalAttributeNameCache = {};
const validatedAttributeNameCache = {};
function isAttributeNameSafe(attributeName) {
  if (hasOwnProperty.call(validatedAttributeNameCache, attributeName)) {
    return true;
  }

  if (hasOwnProperty.call(illegalAttributeNameCache, attributeName)) {
    return false;
  }

  if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName)) {
    validatedAttributeNameCache[attributeName] = true;
    return true;
  }

  illegalAttributeNameCache[attributeName] = true;

  return false;
}

function setValueForAttribute(node, name, value) {
  if (isAttributeNameSafe(name)) {
    // If the prop isn't in the special list, treat it as a simple attribute.
    // shouldRemoveAttribute
    if (value === null) {
      node.removeAttribute(name);
      return;
    }

    switch (typeof value) {
      case 'undefined':
      case 'function':
      case 'symbol':
        // eslint-disable-line
        node.removeAttribute(name);
        return;

      case 'boolean':
        {
          const prefix = name.toLowerCase().slice(0, 5);

          if (prefix !== 'data-' && prefix !== 'aria-') {
            node.removeAttribute(name);
            return;
          }
        }
    }

    node.setAttribute(name, '' + value);
  }
}
function setValueForKnownAttribute(node, name, value) {
  if (value === null) {
    node.removeAttribute(name);
    return;
  }

  switch (typeof value) {
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'boolean':
      {
        node.removeAttribute(name);
        return;
      }
  }

  node.setAttribute(name, '' + value);
}
function setValueForNamespacedAttribute(node, namespace, name, value) {
  if (value === null) {
    node.removeAttribute(name);
    return;
  }

  switch (typeof value) {
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'boolean':
      {
        node.removeAttribute(name);
        return;
      }
  }

  node.setAttributeNS(namespace, name, '' + value);
}
function setValueForPropertyOnCustomComponent(node, name, value) {
  if (name[0] === 'o' && name[1] === 'n') {
    const useCapture = name.endsWith('Capture');
    const eventName = name.slice(2, useCapture ? name.length - 7 : undefined);
    const prevProps = getFiberCurrentPropsFromNode(node);
    const prevValue = prevProps != null ? prevProps[name] : null;

    if (typeof prevValue === 'function') {
      node.removeEventListener(eventName, prevValue, useCapture);
    }

    if (typeof value === 'function') {
      if (typeof prevValue !== 'function' && prevValue !== null) {
        // If we previously assigned a non-function type into this node, then
        // remove it when switching to event listener mode.
        if (name in node) {
          node[name] = null;
        } else if (node.hasAttribute(name)) {
          node.removeAttribute(name);
        }
      } // $FlowFixMe[incompatible-cast] value can't be casted to EventListener.


      node.addEventListener(eventName, value, useCapture);
      return;
    }
  }

  if (name in node) {
    node[name] = value;
    return;
  }

  if (value === true) {
    node.setAttribute(name, '');
    return;
  } // From here, it's the same as any attribute


  setValueForAttribute(node, name, value);
}

let prefix;
function describeBuiltInComponentFrame(name, source, ownerFn) {
  {
    if (prefix === undefined) {
      // Extract the VM specific prefix used by each line.
      try {
        throw Error();
      } catch (x) {
        const match = x.stack.trim().match(/\n( *(at )?)/);
        prefix = match && match[1] || '';
      }
    } // We use the prefix to ensure our stacks line up with native stack frames.


    return '\n' + prefix + name;
  }
}
let reentry = false;
let componentFrameCache;
/**
 * Leverages native browser/VM stack frames to get proper details (e.g.
 * filename, line + col number) for a single component in a component stack. We
 * do this by:
 *   (1) throwing and catching an error in the function - this will be our
 *       control error.
 *   (2) calling the component which will eventually throw an error that we'll
 *       catch - this will be our sample error.
 *   (3) diffing the control and sample error stacks to find the stack frame
 *       which represents our component.
 */


function describeNativeComponentFrame(fn, construct) {
  // If something asked for a stack inside a fake render, it should get ignored.
  if (!fn || reentry) {
    return '';
  }

  reentry = true;
  const previousPrepareStackTrace = Error.prepareStackTrace; // $FlowFixMe[incompatible-type] It does accept undefined.

  Error.prepareStackTrace = undefined;
  /**
   * Finding a common stack frame between sample and control errors can be
   * tricky given the different types and levels of stack trace truncation from
   * different JS VMs. So instead we'll attempt to control what that common
   * frame should be through this object method:
   * Having both the sample and control errors be in the function under the
   * `DescribeNativeComponentFrameRoot` property, + setting the `name` and
   * `displayName` properties of the function ensures that a stack
   * frame exists that has the method name `DescribeNativeComponentFrameRoot` in
   * it for both control and sample stacks.
   */


  const RunInRootFrame = {
    DetermineComponentFrameRoot() {
      let control;

      try {
        // This should throw.
        if (construct) {
          // Something should be setting the props in the constructor.
          const Fake = function () {
            throw Error();
          }; // $FlowFixMe[prop-missing]


          Object.defineProperty(Fake.prototype, 'props', {
            set: function () {
              // We use a throwing setter instead of frozen or non-writable props
              // because that won't throw in a non-strict mode function.
              throw Error();
            }
          });

          if (typeof Reflect === 'object' && Reflect.construct) {
            // We construct a different control for this case to include any extra
            // frames added by the construct call.
            try {
              Reflect.construct(Fake, []);
            } catch (x) {
              control = x;
            }

            Reflect.construct(fn, [], Fake);
          } else {
            try {
              Fake.call();
            } catch (x) {
              control = x;
            } // $FlowFixMe[prop-missing] found when upgrading Flow


            fn.call(Fake.prototype);
          }
        } else {
          try {
            throw Error();
          } catch (x) {
            control = x;
          } // TODO(luna): This will currently only throw if the function component
          // tries to access React/ReactDOM/props. We should probably make this throw
          // in simple components too


          const maybePromise = fn(); // If the function component returns a promise, it's likely an async
          // component, which we don't yet support. Attach a noop catch handler to
          // silence the error.
          // TODO: Implement component stacks for async client components?

          if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => {});
          }
        }
      } catch (sample) {
        // This is inlined manually because closure doesn't do it for us.
        if (sample && control && typeof sample.stack === 'string') {
          return [sample.stack, control.stack];
        }
      }

      return [null, null];
    }

  }; // $FlowFixMe[prop-missing]

  RunInRootFrame.DetermineComponentFrameRoot.displayName = 'DetermineComponentFrameRoot';
  const namePropDescriptor = Object.getOwnPropertyDescriptor(RunInRootFrame.DetermineComponentFrameRoot, 'name'); // Before ES6, the `name` property was not configurable.

  if (namePropDescriptor && namePropDescriptor.configurable) {
    // V8 utilizes a function's `name` property when generating a stack trace.
    Object.defineProperty(RunInRootFrame.DetermineComponentFrameRoot, // Configurable properties can be updated even if its writable descriptor
    // is set to `false`.
    // $FlowFixMe[cannot-write]
    'name', {
      value: 'DetermineComponentFrameRoot'
    });
  }

  try {
    const _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(),
          sampleStack = _RunInRootFrame$Deter[0],
          controlStack = _RunInRootFrame$Deter[1];

    if (sampleStack && controlStack) {
      // This extracts the first frame from the sample that isn't also in the control.
      // Skipping one frame that we assume is the frame that calls the two.
      const sampleLines = sampleStack.split('\n');
      const controlLines = controlStack.split('\n');
      let s = 0;
      let c = 0;

      while (s < sampleLines.length && !sampleLines[s].includes('DetermineComponentFrameRoot')) {
        s++;
      }

      while (c < controlLines.length && !controlLines[c].includes('DetermineComponentFrameRoot')) {
        c++;
      } // We couldn't find our intentionally injected common root frame, attempt
      // to find another common root frame by search from the bottom of the
      // control stack...


      if (s === sampleLines.length || c === controlLines.length) {
        s = sampleLines.length - 1;
        c = controlLines.length - 1;

        while (s >= 1 && c >= 0 && sampleLines[s] !== controlLines[c]) {
          // We expect at least one stack frame to be shared.
          // Typically this will be the root most one. However, stack frames may be
          // cut off due to maximum stack limits. In this case, one maybe cut off
          // earlier than the other. We assume that the sample is longer or the same
          // and there for cut off earlier. So we should find the root most frame in
          // the sample somewhere in the control.
          c--;
        }
      }

      for (; s >= 1 && c >= 0; s--, c--) {
        // Next we find the first one that isn't the same which should be the
        // frame that called our sample function and the control.
        if (sampleLines[s] !== controlLines[c]) {
          // In V8, the first line is describing the message but other VMs don't.
          // If we're about to return the first line, and the control is also on the same
          // line, that's a pretty good indicator that our sample threw at same line as
          // the control. I.e. before we entered the sample frame. So we ignore this result.
          // This can happen if you passed a class to function component, or non-function.
          if (s !== 1 || c !== 1) {
            do {
              s--;
              c--; // We may still have similar intermediate frames from the construct call.
              // The next one that isn't the same should be our match though.

              if (c < 0 || sampleLines[s] !== controlLines[c]) {
                // V8 adds a "new" prefix for native classes. Let's remove it to make it prettier.
                let frame = '\n' + sampleLines[s].replace(' at new ', ' at '); // If our component frame is labeled "<anonymous>"
                // but we have a user-provided "displayName"
                // splice it in to make the stack more readable.

                if (fn.displayName && frame.includes('<anonymous>')) {
                  frame = frame.replace('<anonymous>', fn.displayName);
                }

                if (false) ; // Return the line we found.


                return frame;
              }
            } while (s >= 1 && c >= 0);
          }

          break;
        }
      }
    }
  } finally {
    reentry = false;

    Error.prepareStackTrace = previousPrepareStackTrace;
  } // Fallback to just using the name if we couldn't make it throw.


  const name = fn ? fn.displayName || fn.name : '';
  const syntheticFrame = name ? describeBuiltInComponentFrame(name) : '';

  return syntheticFrame;
}

function describeClassComponentFrame(ctor, source, ownerFn) {
  {
    return describeNativeComponentFrame(ctor, true);
  }
}
function describeFunctionComponentFrame(fn, source, ownerFn) {
  {
    return describeNativeComponentFrame(fn, false);
  }
}

function describeFiber(fiber) {

  switch (fiber.tag) {
    case HostHoistable:
    case HostSingleton:
    case HostComponent:
      return describeBuiltInComponentFrame(fiber.type);

    case LazyComponent:
      return describeBuiltInComponentFrame('Lazy');

    case SuspenseComponent:
      return describeBuiltInComponentFrame('Suspense');

    case SuspenseListComponent:
      return describeBuiltInComponentFrame('SuspenseList');

    case FunctionComponent:
    case IndeterminateComponent:
    case SimpleMemoComponent:
      return describeFunctionComponentFrame(fiber.type);

    case ForwardRef:
      return describeFunctionComponentFrame(fiber.type.render);

    case ClassComponent:
      return describeClassComponentFrame(fiber.type);

    default:
      return '';
  }
}

function getStackByFiberInDevAndProd(workInProgress) {
  try {
    let info = '';
    let node = workInProgress;

    do {
      info += describeFiber(node); // $FlowFixMe[incompatible-type] we bail out when we get a null

      node = node.return;
    } while (node);

    return info;
  } catch (x) {
    return '\nError generating stack: ' + x.message + '\n' + x.stack;
  }
}

function getWrappedName$1(outerType, innerType, wrapperName) {
  const displayName = outerType.displayName;

  if (displayName) {
    return displayName;
  }

  const functionName = innerType.displayName || innerType.name || '';
  return functionName !== '' ? wrapperName + "(" + functionName + ")" : wrapperName;
} // Keep in sync with react-reconciler/getComponentNameFromFiber


function getContextName$1(type) {
  return type.displayName || 'Context';
} // Note that the reconciler package should generally prefer to use getComponentNameFromFiber() instead.


function getComponentNameFromType(type) {
  if (type == null) {
    // Host root, text node or just invalid type.
    return null;
  }

  if (typeof type === 'function') {
    return type.displayName || type.name || null;
  }

  if (typeof type === 'string') {
    return type;
  }

  switch (type) {
    case REACT_FRAGMENT_TYPE:
      return 'Fragment';

    case REACT_PORTAL_TYPE:
      return 'Portal';

    case REACT_PROFILER_TYPE:
      return 'Profiler';

    case REACT_STRICT_MODE_TYPE:
      return 'StrictMode';

    case REACT_SUSPENSE_TYPE:
      return 'Suspense';

    case REACT_SUSPENSE_LIST_TYPE:
      return 'SuspenseList';

    case REACT_CACHE_TYPE:
      {
        return 'Cache';
      }

  }

  if (typeof type === 'object') {
    switch (type.$$typeof) {
      case REACT_CONTEXT_TYPE:
        const context = type;
        return getContextName$1(context) + '.Consumer';

      case REACT_PROVIDER_TYPE:
        const provider = type;
        return getContextName$1(provider._context) + '.Provider';

      case REACT_FORWARD_REF_TYPE:
        return getWrappedName$1(type, type.render, 'ForwardRef');

      case REACT_MEMO_TYPE:
        const outerName = type.displayName || null;

        if (outerName !== null) {
          return outerName;
        }

        return getComponentNameFromType(type.type) || 'Memo';

      case REACT_LAZY_TYPE:
        {
          const lazyComponent = type;
          const payload = lazyComponent._payload;
          const init = lazyComponent._init;

          try {
            return getComponentNameFromType(init(payload));
          } catch (x) {
            return null;
          }
        }

      case REACT_SERVER_CONTEXT_TYPE:
        {
          const context2 = type;
          return (context2.displayName || context2._globalName) + '.Provider';
        }

    }
  }

  return null;
}

function getWrappedName(outerType, innerType, wrapperName) {
  const functionName = innerType.displayName || innerType.name || '';
  return outerType.displayName || (functionName !== '' ? wrapperName + "(" + functionName + ")" : wrapperName);
} // Keep in sync with shared/getComponentNameFromType


function getContextName(type) {
  return type.displayName || 'Context';
}

function getComponentNameFromFiber(fiber) {
  const tag = fiber.tag,
        type = fiber.type;

  switch (tag) {
    case CacheComponent:
      return 'Cache';

    case ContextConsumer:
      const context = type;
      return getContextName(context) + '.Consumer';

    case ContextProvider:
      const provider = type;
      return getContextName(provider._context) + '.Provider';

    case DehydratedFragment:
      return 'DehydratedFragment';

    case ForwardRef:
      return getWrappedName(type, type.render, 'ForwardRef');

    case Fragment:
      return 'Fragment';

    case HostHoistable:
    case HostSingleton:
    case HostComponent:
      // Host component type is the display name (e.g. "div", "View")
      return type;

    case HostPortal:
      return 'Portal';

    case HostRoot:
      return 'Root';

    case HostText:
      return 'Text';

    case LazyComponent:
      // Name comes from the type in this case; we don't have a tag.
      return getComponentNameFromType(type);

    case Mode:
      if (type === REACT_STRICT_MODE_TYPE) {
        // Don't be less specific than shared/getComponentNameFromType
        return 'StrictMode';
      }

      return 'Mode';

    case OffscreenComponent:
      return 'Offscreen';

    case Profiler:
      return 'Profiler';

    case ScopeComponent:
      return 'Scope';

    case SuspenseComponent:
      return 'Suspense';

    case SuspenseListComponent:
      return 'SuspenseList';

    case TracingMarkerComponent:
      return 'TracingMarker';
    // The display name for this tags come from the user-provided type:

    case ClassComponent:
    case FunctionComponent:
    case IncompleteClassComponent:
    case IndeterminateComponent:
    case MemoComponent:
    case SimpleMemoComponent:
      if (typeof type === 'function') {
        return type.displayName || type.name || null;
      }

      if (typeof type === 'string') {
        return type;
      }

      break;

  }

  return null;
}

// around this limitation, we use an opaque type that can only be obtained by
// passing the value through getToStringValue first.

function toString(value) {
  // The coercion safety check is performed in getToStringValue().
  // eslint-disable-next-line react-internal/safe-string-coercion
  return '' + value;
}
function getToStringValue(value) {
  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'string':
    case 'undefined':
      return value;

    case 'object':

      return value;

    default:
      // function, symbol are assigned as empty strings
      return '';
  }
}

function isCheckable(elem) {
  const type = elem.type;
  const nodeName = elem.nodeName;
  return nodeName && nodeName.toLowerCase() === 'input' && (type === 'checkbox' || type === 'radio');
}

function getTracker(node) {
  return node._valueTracker;
}

function detachTracker(node) {
  node._valueTracker = null;
}

function getValueFromNode(node) {
  let value = '';

  if (!node) {
    return value;
  }

  if (isCheckable(node)) {
    value = node.checked ? 'true' : 'false';
  } else {
    value = node.value;
  }

  return value;
}

function trackValueOnNode(node) {
  const valueField = isCheckable(node) ? 'checked' : 'value';
  const descriptor = Object.getOwnPropertyDescriptor(node.constructor.prototype, valueField);

  let currentValue = '' + node[valueField]; // if someone has already defined a value or Safari, then bail
  // and don't track value will cause over reporting of changes,
  // but it's better then a hard failure
  // (needed for certain tests that spyOn input values and Safari)

  if (node.hasOwnProperty(valueField) || typeof descriptor === 'undefined' || typeof descriptor.get !== 'function' || typeof descriptor.set !== 'function') {
    return;
  }

  const get = descriptor.get,
        set = descriptor.set;
  Object.defineProperty(node, valueField, {
    configurable: true,
    // $FlowFixMe[missing-this-annot]
    get: function () {
      return get.call(this);
    },
    // $FlowFixMe[missing-local-annot]
    // $FlowFixMe[missing-this-annot]
    set: function (value) {

      currentValue = '' + value;
      set.call(this, value);
    }
  }); // We could've passed this the first time
  // but it triggers a bug in IE11 and Edge 14/15.
  // Calling defineProperty() again should be equivalent.
  // https://github.com/facebook/react/issues/11768

  Object.defineProperty(node, valueField, {
    enumerable: descriptor.enumerable
  });
  const tracker = {
    getValue() {
      return currentValue;
    },

    setValue(value) {

      currentValue = '' + value;
    },

    stopTracking() {
      detachTracker(node);
      delete node[valueField];
    }

  };
  return tracker;
}

function track(node) {
  if (getTracker(node)) {
    return;
  }

  node._valueTracker = trackValueOnNode(node);
}
function updateValueIfChanged(node) {
  if (!node) {
    return false;
  }

  const tracker = getTracker(node); // if there is no tracker at this point it's unlikely
  // that trying again will succeed

  if (!tracker) {
    return true;
  }

  const lastValue = tracker.getValue();
  const nextValue = getValueFromNode(node);

  if (nextValue !== lastValue) {
    tracker.setValue(nextValue);
    return true;
  }

  return false;
}

function getActiveElement(doc) {
  doc = doc || (typeof document !== 'undefined' ? document : undefined);

  if (typeof doc === 'undefined') {
    return null;
  }

  try {
    return doc.activeElement || doc.body;
  } catch (e) {
    return doc.body;
  }
}

// When passing user input into querySelector(All) the embedded string must not alter
// the semantics of the query. This escape function is safe to use when we know the
// provided value is going to be wrapped in double quotes as part of an attribute selector
// Do not use it anywhere else
// we escape double quotes and backslashes
const escapeSelectorAttributeValueInsideDoubleQuotesRegex = /[\n\"\\]/g;
function escapeSelectorAttributeValueInsideDoubleQuotes(value) {
  return value.replace(escapeSelectorAttributeValueInsideDoubleQuotesRegex, ch => '\\' + ch.charCodeAt(0).toString(16) + ' ');
}

function updateInput(element, value, defaultValue, lastDefaultValue, checked, defaultChecked, type, name) {
  const node = element; // Temporarily disconnect the input from any radio buttons.
  // Changing the type or name as the same time as changing the checked value
  // needs to be atomically applied. We can only ensure that by disconnecting
  // the name while do the mutations and then reapply the name after that's done.

  node.name = '';

  if (type != null && typeof type !== 'function' && typeof type !== 'symbol' && typeof type !== 'boolean') {

    node.type = type;
  } else {
    node.removeAttribute('type');
  }

  if (value != null) {
    if (type === 'number') {
      if ( // $FlowFixMe[incompatible-type]
      value === 0 && node.value === '' || // We explicitly want to coerce to number here if possible.
      // eslint-disable-next-line
      node.value != value) {
        node.value = toString(getToStringValue(value));
      }
    } else if (node.value !== toString(getToStringValue(value))) {
      node.value = toString(getToStringValue(value));
    }
  } else if (type === 'submit' || type === 'reset') {
    // Submit/reset inputs need the attribute removed completely to avoid
    // blank-text buttons.
    node.removeAttribute('value');
  }

  {
    // When syncing the value attribute, the value comes from a cascade of
    // properties:
    //  1. The value React property
    //  2. The defaultValue React property
    //  3. Otherwise there should be no change
    if (value != null) {
      setDefaultValue(node, type, getToStringValue(value));
    } else if (defaultValue != null) {
      setDefaultValue(node, type, getToStringValue(defaultValue));
    } else if (lastDefaultValue != null) {
      node.removeAttribute('value');
    }
  }

  {
    // When syncing the checked attribute, it only changes when it needs
    // to be removed, such as transitioning from a checkbox into a text input
    if (checked == null && defaultChecked != null) {
      node.defaultChecked = !!defaultChecked;
    }
  }

  if (checked != null) {
    // Important to set this even if it's not a change in order to update input
    // value tracking with radio buttons
    // TODO: Should really update input value tracking for the whole radio
    // button group in an effect or something (similar to #27024)
    node.checked = checked && typeof checked !== 'function' && typeof checked !== 'symbol';
  }

  if (name != null && typeof name !== 'function' && typeof name !== 'symbol' && typeof name !== 'boolean') {

    node.name = toString(getToStringValue(name));
  } else {
    node.removeAttribute('name');
  }
}
function initInput(element, value, defaultValue, checked, defaultChecked, type, name, isHydrating) {
  const node = element;

  if (type != null && typeof type !== 'function' && typeof type !== 'symbol' && typeof type !== 'boolean') {

    node.type = type;
  }

  if (value != null || defaultValue != null) {
    const isButton = type === 'submit' || type === 'reset'; // Avoid setting value attribute on submit/reset inputs as it overrides the
    // default value provided by the browser. See: #12872

    if (isButton && (value === undefined || value === null)) {
      return;
    }

    const defaultValueStr = defaultValue != null ? toString(getToStringValue(defaultValue)) : '';
    const initialValue = value != null ? toString(getToStringValue(value)) : defaultValueStr; // Do not assign value if it is already set. This prevents user text input
    // from being lost during SSR hydration.

    if (!isHydrating) {
      {
        // When syncing the value attribute, the value property should use
        // the wrapperState._initialValue property. This uses:
        //
        //   1. The value React property when present
        //   2. The defaultValue React property when present
        //   3. An empty string
        if (initialValue !== node.value) {
          node.value = initialValue;
        }
      }
    }

    {
      // Otherwise, the value attribute is synchronized to the property,
      // so we assign defaultValue to the same thing as the value property
      // assignment step above.
      node.defaultValue = initialValue;
    }
  } // Normally, we'd just do `node.checked = node.checked` upon initial mount, less this bug
  // this is needed to work around a chrome bug where setting defaultChecked
  // will sometimes influence the value of checked (even after detachment).
  // Reference: https://bugs.chromium.org/p/chromium/issues/detail?id=608416
  // We need to temporarily unset name to avoid disrupting radio button groups.


  const checkedOrDefault = checked != null ? checked : defaultChecked; // TODO: This 'function' or 'symbol' check isn't replicated in other places
  // so this semantic is inconsistent.

  const initialChecked = typeof checkedOrDefault !== 'function' && typeof checkedOrDefault !== 'symbol' && !!checkedOrDefault;

  if (isHydrating) {
    // Detach .checked from .defaultChecked but leave user input alone
    node.checked = node.checked;
  } else {
    node.checked = !!initialChecked;
  }

  {
    // When syncing the checked attribute, both the checked property and
    // attribute are assigned at the same time using defaultChecked. This uses:
    //
    //   1. The checked React property when present
    //   2. The defaultChecked React property when present
    //   3. Otherwise, false
    node.defaultChecked = !node.defaultChecked;
    node.defaultChecked = !!initialChecked;
  } // Name needs to be set at the end so that it applies atomically to connected radio buttons.


  if (name != null && typeof name !== 'function' && typeof name !== 'symbol' && typeof name !== 'boolean') {

    node.name = name;
  }
}
function restoreControlledInputState(element, props) {
  const rootNode = element;
  updateInput(rootNode, props.value, props.defaultValue, props.defaultValue, props.checked, props.defaultChecked, props.type, props.name);
  const name = props.name;

  if (props.type === 'radio' && name != null) {
    let queryRoot = rootNode;

    while (queryRoot.parentNode) {
      queryRoot = queryRoot.parentNode;
    } // If `rootNode.form` was non-null, then we could try `form.elements`,

    const group = queryRoot.querySelectorAll('input[name="' + escapeSelectorAttributeValueInsideDoubleQuotes('' + name) + '"][type="radio"]');

    for (let i = 0; i < group.length; i++) {
      const otherNode = group[i];

      if (otherNode === rootNode || otherNode.form !== rootNode.form) {
        continue;
      } // This will throw if radio buttons rendered by different copies of React
      // and the same name are rendered into the same form (same as #1939).
      // That's probably okay; we don't support it just as we don't support
      // mixing React radio buttons with non-React ones.


      const otherProps = getFiberCurrentPropsFromNode(otherNode);

      if (!otherProps) {
        throw Error(formatProdErrorMessage(90));
      } // If this is a controlled radio button group, forcing the input that
      // was previously checked to update will cause it to be come re-checked
      // as appropriate.


      updateInput(otherNode, otherProps.value, otherProps.defaultValue, otherProps.defaultValue, otherProps.checked, otherProps.defaultChecked, otherProps.type, otherProps.name);
    } // If any updateInput() call set .checked to true, an input in this group
    // (often, `rootNode` itself) may have become unchecked


    for (let i = 0; i < group.length; i++) {
      const otherNode = group[i];

      if (otherNode.form !== rootNode.form) {
        continue;
      }

      updateValueIfChanged(otherNode);
    }
  }
} // In Chrome, assigning defaultValue to certain input types triggers input validation.
// For number inputs, the display value loses trailing decimal points. For email inputs,
// Chrome raises "The specified value <x> is not a valid email address".
//
// Here we check to see if the defaultValue has actually changed, avoiding these problems
// when the user is inputting text
//
// https://github.com/facebook/react/issues/7253

function setDefaultValue(node, type, value) {
  if ( // Focused number inputs synchronize on blur. See ChangeEventPlugin.js
  type !== 'number' || getActiveElement(node.ownerDocument) !== node) {
    if (node.defaultValue !== toString(value)) {
      node.defaultValue = toString(value);
    }
  }
}

const isArrayImpl = Array.isArray; // eslint-disable-next-line no-redeclare

function isArray(a) {
  return isArrayImpl(a);
}

// TODO: direct imports like some-package/src/* are bad. Fix me.

function updateOptions(node, multiple, propValue, setDefaultSelected) {
  const options = node.options;

  if (multiple) {
    const selectedValues = propValue;
    const selectedValue = {};

    for (let i = 0; i < selectedValues.length; i++) {
      // Prefix to avoid chaos with special keys.
      selectedValue['$' + selectedValues[i]] = true;
    }

    for (let i = 0; i < options.length; i++) {
      const selected = selectedValue.hasOwnProperty('$' + options[i].value);

      if (options[i].selected !== selected) {
        options[i].selected = selected;
      }

      if (selected && setDefaultSelected) {
        options[i].defaultSelected = true;
      }
    }
  } else {
    // Do not set `select.value` as exact behavior isn't consistent across all
    // browsers for all cases.
    const selectedValue = toString(getToStringValue(propValue));
    let defaultSelected = null;

    for (let i = 0; i < options.length; i++) {
      if (options[i].value === selectedValue) {
        options[i].selected = true;

        if (setDefaultSelected) {
          options[i].defaultSelected = true;
        }

        return;
      }

      if (defaultSelected === null && !options[i].disabled) {
        defaultSelected = options[i];
      }
    }

    if (defaultSelected !== null) {
      defaultSelected.selected = true;
    }
  }
}
function initSelect(element, value, defaultValue, multiple) {
  const node = element;
  node.multiple = !!multiple;

  if (value != null) {
    updateOptions(node, !!multiple, value, false);
  } else if (defaultValue != null) {
    updateOptions(node, !!multiple, defaultValue, true);
  }
}
function updateSelect(element, value, defaultValue, multiple, wasMultiple) {
  const node = element;

  if (value != null) {
    updateOptions(node, !!multiple, value, false);
  } else if (!!wasMultiple !== !!multiple) {
    // For simplicity, reapply `defaultValue` if `multiple` is toggled.
    if (defaultValue != null) {
      updateOptions(node, !!multiple, defaultValue, true);
    } else {
      // Revert the select back to its default unselected state.
      updateOptions(node, !!multiple, multiple ? [] : '', false);
    }
  }
}
function restoreControlledSelectState(element, props) {
  const node = element;
  const value = props.value;

  if (value != null) {
    updateOptions(node, !!props.multiple, value, false);
  }
}

function updateTextarea(element, value, defaultValue) {
  const node = element;

  if (value != null) {
    // Cast `value` to a string to ensure the value is set correctly. While
    // browsers typically do this as necessary, jsdom doesn't.
    const newValue = toString(getToStringValue(value)); // To avoid side effects (such as losing text selection), only set value if changed

    if (newValue !== node.value) {
      node.value = newValue;
    } // TOOO: This should respect disableInputAttributeSyncing flag.


    if (defaultValue == null) {
      if (node.defaultValue !== newValue) {
        node.defaultValue = newValue;
      }

      return;
    }
  }

  if (defaultValue != null) {
    node.defaultValue = toString(getToStringValue(defaultValue));
  } else {
    node.defaultValue = '';
  }
}
function initTextarea(element, value, defaultValue, children) {
  const node = element;
  let initialValue = value; // Only bother fetching default value if we're going to use it

  if (initialValue == null) {
    if (children != null) {
      {
        if (defaultValue != null) {
          throw Error(formatProdErrorMessage(92));
        }

        if (isArray(children)) {
          if (children.length > 1) {
            throw Error(formatProdErrorMessage(93));
          }

          children = children[0];
        }

        defaultValue = children;
      }
    }

    if (defaultValue == null) {
      defaultValue = '';
    }

    initialValue = defaultValue;
  }

  const stringValue = getToStringValue(initialValue);
  node.defaultValue = stringValue; // This will be toString:ed.
  // This is in postMount because we need access to the DOM node, which is not
  // available until after the component has mounted.

  const textContent = node.textContent; // Only set node.value if textContent is equal to the expected
  // initial value. In IE10/IE11 there is a bug where the placeholder attribute
  // will populate textContent as well.
  // https://developer.microsoft.com/microsoft-edge/platform/issues/101525/

  if (textContent === stringValue) {
    if (textContent !== '' && textContent !== null) {
      node.value = textContent;
    }
  }
}
function restoreControlledTextareaState(element, props) {
  // DOM component is still mounted; update
  updateTextarea(element, props.value, props.defaultValue);
}

const MATH_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/* globals MSApp */

if (typeof MSApp !== 'undefined' && MSApp.execUnsafeLocalFunction) ;

/**
 * HTML nodeType values that represent the type of the node
 */
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_NODE = 9;
const DOCUMENT_TYPE_NODE = 10;
const DOCUMENT_FRAGMENT_NODE = 11;

/**
 * Set the textContent property of a node. For text updates, it's faster
 * to set the `nodeValue` of the Text node directly instead of using
 * `.textContent` which will remove the existing node and create a new one.
 *
 * @param {DOMElement} node
 * @param {string} text
 * @internal
 */

function setTextContent(node, text) {
  if (text) {
    const firstChild = node.firstChild;

    if (firstChild && firstChild === node.lastChild && firstChild.nodeType === TEXT_NODE) {
      firstChild.nodeValue = text;
      return;
    }
  }

  node.textContent = text;
}

/**
 * CSS properties which accept numbers but are not in units of "px".
 */
const unitlessNumbers = new Set(['animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth', 'boxFlex', 'boxFlexGroup', 'boxOrdinalGroup', 'columnCount', 'columns', 'flex', 'flexGrow', 'flexPositive', 'flexShrink', 'flexNegative', 'flexOrder', 'gridArea', 'gridRow', 'gridRowEnd', 'gridRowSpan', 'gridRowStart', 'gridColumn', 'gridColumnEnd', 'gridColumnSpan', 'gridColumnStart', 'fontWeight', 'lineClamp', 'lineHeight', 'opacity', 'order', 'orphans', 'scale', 'tabSize', 'widows', 'zIndex', 'zoom', 'fillOpacity', // SVG-related properties
'floodOpacity', 'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth', 'MozAnimationIterationCount', // Known Prefixed Properties
'MozBoxFlex', // TODO: Remove these since they shouldn't be used in modern code
'MozBoxFlexGroup', 'MozLineClamp', 'msAnimationIterationCount', 'msFlex', 'msZoom', 'msFlexGrow', 'msFlexNegative', 'msFlexOrder', 'msFlexPositive', 'msFlexShrink', 'msGridColumn', 'msGridColumnSpan', 'msGridRow', 'msGridRowSpan', 'WebkitAnimationIterationCount', 'WebkitBoxFlex', 'WebKitBoxFlexGroup', 'WebkitBoxOrdinalGroup', 'WebkitColumnCount', 'WebkitColumns', 'WebkitFlex', 'WebkitFlexGrow', 'WebkitFlexPositive', 'WebkitFlexShrink', 'WebkitLineClamp']);
function isUnitlessNumber (name) {
  return unitlessNumbers.has(name);
}

function setValueForStyle(style, styleName, value) {
  const isCustomProperty = styleName.indexOf('--') === 0;

  if (value == null || typeof value === 'boolean' || value === '') {
    if (isCustomProperty) {
      style.setProperty(styleName, '');
    } else if (styleName === 'float') {
      style.cssFloat = '';
    } else {
      style[styleName] = '';
    }
  } else if (isCustomProperty) {
    style.setProperty(styleName, value);
  } else if (typeof value === 'number' && value !== 0 && !isUnitlessNumber(styleName)) {
    style[styleName] = value + 'px'; // Presumes implicit 'px' suffix for unitless numbers
  } else {
    if (styleName === 'float') {
      style.cssFloat = value;
    } else {

      style[styleName] = ('' + value).trim();
    }
  }
}
/**
 * Sets the value for multiple styles on a node.  If a value is specified as
 * '' (empty string), the corresponding style property will be unset.
 *
 * @param {DOMElement} node
 * @param {object} styles
 */


function setValueForStyles(node, styles, prevStyles) {
  if (styles != null && typeof styles !== 'object') {
    throw Error(formatProdErrorMessage(62));
  }

  const style = node.style;

  if (prevStyles != null) {

    for (const styleName in prevStyles) {
      if (prevStyles.hasOwnProperty(styleName) && (styles == null || !styles.hasOwnProperty(styleName))) {
        // Clear style
        const isCustomProperty = styleName.indexOf('--') === 0;

        if (isCustomProperty) {
          style.setProperty(styleName, '');
        } else if (styleName === 'float') {
          style.cssFloat = '';
        } else {
          style[styleName] = '';
        }
      }
    }

    for (const styleName in styles) {
      const value = styles[styleName];

      if (styles.hasOwnProperty(styleName) && prevStyles[styleName] !== value) {
        setValueForStyle(style, styleName, value);
      }
    }
  } else {
    for (const styleName in styles) {
      if (styles.hasOwnProperty(styleName)) {
        const value = styles[styleName];
        setValueForStyle(style, styleName, value);
      }
    }
  }
}

function isCustomElement(tagName, props) {
  if (tagName.indexOf('-') === -1) {
    return false;
  }

  switch (tagName) {
    // These are reserved SVG and MathML elements.
    // We don't mind this list too much because we expect it to never grow.
    // The alternative is to track the namespace in a few places which is convoluted.
    // https://w3c.github.io/webcomponents/spec/custom/#custom-elements-core-concepts
    case 'annotation-xml':
    case 'color-profile':
    case 'font-face':
    case 'font-face-src':
    case 'font-face-uri':
    case 'font-face-format':
    case 'font-face-name':
    case 'missing-glyph':
      return false;

    default:
      return true;
  }
}

const aliases = new Map([['acceptCharset', 'accept-charset'], ['htmlFor', 'for'], ['httpEquiv', 'http-equiv'], // HTML and SVG attributes, but the SVG attribute is case sensitive.],
['crossOrigin', 'crossorigin'], // This is a list of all SVG attributes that need special casing.
// Regular attributes that just accept strings.],
['accentHeight', 'accent-height'], ['alignmentBaseline', 'alignment-baseline'], ['arabicForm', 'arabic-form'], ['baselineShift', 'baseline-shift'], ['capHeight', 'cap-height'], ['clipPath', 'clip-path'], ['clipRule', 'clip-rule'], ['colorInterpolation', 'color-interpolation'], ['colorInterpolationFilters', 'color-interpolation-filters'], ['colorProfile', 'color-profile'], ['colorRendering', 'color-rendering'], ['dominantBaseline', 'dominant-baseline'], ['enableBackground', 'enable-background'], ['fillOpacity', 'fill-opacity'], ['fillRule', 'fill-rule'], ['floodColor', 'flood-color'], ['floodOpacity', 'flood-opacity'], ['fontFamily', 'font-family'], ['fontSize', 'font-size'], ['fontSizeAdjust', 'font-size-adjust'], ['fontStretch', 'font-stretch'], ['fontStyle', 'font-style'], ['fontVariant', 'font-variant'], ['fontWeight', 'font-weight'], ['glyphName', 'glyph-name'], ['glyphOrientationHorizontal', 'glyph-orientation-horizontal'], ['glyphOrientationVertical', 'glyph-orientation-vertical'], ['horizAdvX', 'horiz-adv-x'], ['horizOriginX', 'horiz-origin-x'], ['imageRendering', 'image-rendering'], ['letterSpacing', 'letter-spacing'], ['lightingColor', 'lighting-color'], ['markerEnd', 'marker-end'], ['markerMid', 'marker-mid'], ['markerStart', 'marker-start'], ['overlinePosition', 'overline-position'], ['overlineThickness', 'overline-thickness'], ['paintOrder', 'paint-order'], ['panose-1', 'panose-1'], ['pointerEvents', 'pointer-events'], ['renderingIntent', 'rendering-intent'], ['shapeRendering', 'shape-rendering'], ['stopColor', 'stop-color'], ['stopOpacity', 'stop-opacity'], ['strikethroughPosition', 'strikethrough-position'], ['strikethroughThickness', 'strikethrough-thickness'], ['strokeDasharray', 'stroke-dasharray'], ['strokeDashoffset', 'stroke-dashoffset'], ['strokeLinecap', 'stroke-linecap'], ['strokeLinejoin', 'stroke-linejoin'], ['strokeMiterlimit', 'stroke-miterlimit'], ['strokeOpacity', 'stroke-opacity'], ['strokeWidth', 'stroke-width'], ['textAnchor', 'text-anchor'], ['textDecoration', 'text-decoration'], ['textRendering', 'text-rendering'], ['transformOrigin', 'transform-origin'], ['underlinePosition', 'underline-position'], ['underlineThickness', 'underline-thickness'], ['unicodeBidi', 'unicode-bidi'], ['unicodeRange', 'unicode-range'], ['unitsPerEm', 'units-per-em'], ['vAlphabetic', 'v-alphabetic'], ['vHanging', 'v-hanging'], ['vIdeographic', 'v-ideographic'], ['vMathematical', 'v-mathematical'], ['vectorEffect', 'vector-effect'], ['vertAdvY', 'vert-adv-y'], ['vertOriginX', 'vert-origin-x'], ['vertOriginY', 'vert-origin-y'], ['wordSpacing', 'word-spacing'], ['writingMode', 'writing-mode'], ['xmlnsXlink', 'xmlns:xlink'], ['xHeight', 'x-height']]);
function getAttributeAlias (name) {
  return aliases.get(name) || name;
}

function sanitizeURL(url) {

  return url;
}

const IS_EVENT_HANDLE_NON_MANAGED_NODE = 1;
const IS_NON_DELEGATED = 1 << 1;
const IS_CAPTURE_PHASE = 1 << 2;
// set to LEGACY_FB_SUPPORT. LEGACY_FB_SUPPORT only gets set when
// we call willDeferLaterForLegacyFBSupport, thus not bailing out
// will result in endless cycles like an infinite loop.
// We also don't want to defer during event replaying.

const SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS = IS_EVENT_HANDLE_NON_MANAGED_NODE | IS_NON_DELEGATED | IS_CAPTURE_PHASE;

// This exists to avoid circular dependency between ReactDOMEventReplaying
// and DOMPluginEventSystem.
let currentReplayingEvent = null;
function setReplayingEvent(event) {

  currentReplayingEvent = event;
}
function resetReplayingEvent() {

  currentReplayingEvent = null;
}
function isReplayingEvent(event) {
  return event === currentReplayingEvent;
}

/**
 * Gets the target node from a native browser event by accounting for
 * inconsistencies in browser DOM APIs.
 *
 * @param {object} nativeEvent Native browser event.
 * @return {DOMEventTarget} Target node.
 */

function getEventTarget(nativeEvent) {
  // Fallback to nativeEvent.srcElement for IE9
  // https://github.com/facebook/react/issues/12506
  let target = nativeEvent.target || nativeEvent.srcElement || window; // Normalize SVG <use> element events #4963

  if (target.correspondingUseElement) {
    target = target.correspondingUseElement;
  } // Safari may fire events on text nodes (Node.TEXT_NODE is 3).
  // @see http://www.quirksmode.org/js/events_properties.html


  return target.nodeType === TEXT_NODE ? target.parentNode : target;
}

let restoreTarget = null;
let restoreQueue = null;

function restoreStateOfTarget(target) {
  // We perform this translation at the end of the event loop so that we
  // always receive the correct fiber here
  const internalInstance = getInstanceFromNode(target);

  if (!internalInstance) {
    // Unmounted
    return;
  }

  const stateNode = internalInstance.stateNode; // Guard against Fiber being unmounted.

  if (stateNode) {
    const props = getFiberCurrentPropsFromNode(stateNode);
    restoreControlledState(internalInstance.stateNode, internalInstance.type, props);
  }
}

function enqueueStateRestore(target) {
  if (restoreTarget) {
    if (restoreQueue) {
      restoreQueue.push(target);
    } else {
      restoreQueue = [target];
    }
  } else {
    restoreTarget = target;
  }
}
function needsStateRestore() {
  return restoreTarget !== null || restoreQueue !== null;
}
function restoreStateIfNeeded() {
  if (!restoreTarget) {
    return;
  }

  const target = restoreTarget;
  const queuedTargets = restoreQueue;
  restoreTarget = null;
  restoreQueue = null;
  restoreStateOfTarget(target);

  if (queuedTargets) {
    for (let i = 0; i < queuedTargets.length; i++) {
      restoreStateOfTarget(queuedTargets[i]);
    }
  }
}

/**
 * `ReactInstanceMap` maintains a mapping from a public facing stateful
 * instance (key) and the internal representation (value). This allows public
 * methods to accept the user facing instance as an argument and map them back
 * to internal methods.
 *
 * Note that this module is currently shared and assumed to be stateless.
 * If this becomes an actual Map, that will break.
 */
function get(key) {
  return key._reactInternals;
}
function has(key) {
  return key._reactInternals !== undefined;
}
function set(key, value) {
  key._reactInternals = value;
}

function getNearestMountedFiber(fiber) {
  let node = fiber;
  let nearestMounted = fiber;

  if (!fiber.alternate) {
    // If there is no alternate, this might be a new tree that isn't inserted
    // yet. If it is, then it will have a pending insertion effect on it.
    let nextNode = node;

    do {
      node = nextNode;

      if ((node.flags & (Placement | Hydrating)) !== NoFlags$1) {
        // This is an insertion or in-progress hydration. The nearest possible
        // mounted fiber is the parent but we need to continue to figure out
        // if that one is still mounted.
        nearestMounted = node.return;
      } // $FlowFixMe[incompatible-type] we bail out when we get a null


      nextNode = node.return;
    } while (nextNode);
  } else {
    while (node.return) {
      node = node.return;
    }
  }

  if (node.tag === HostRoot) {
    // TODO: Check if this was a nested HostRoot when used with
    // renderContainerIntoSubtree.
    return nearestMounted;
  } // If we didn't hit the root, that means that we're in an disconnected tree
  // that has been unmounted.


  return null;
}
function getSuspenseInstanceFromFiber(fiber) {
  if (fiber.tag === SuspenseComponent) {
    let suspenseState = fiber.memoizedState;

    if (suspenseState === null) {
      const current = fiber.alternate;

      if (current !== null) {
        suspenseState = current.memoizedState;
      }
    }

    if (suspenseState !== null) {
      return suspenseState.dehydrated;
    }
  }

  return null;
}
function getContainerFromFiber(fiber) {
  return fiber.tag === HostRoot ? fiber.stateNode.containerInfo : null;
}
function isFiberMounted(fiber) {
  return getNearestMountedFiber(fiber) === fiber;
}
function isMounted(component) {

  const fiber = get(component);

  if (!fiber) {
    return false;
  }

  return getNearestMountedFiber(fiber) === fiber;
}

function assertIsMounted(fiber) {
  if (getNearestMountedFiber(fiber) !== fiber) {
    throw Error(formatProdErrorMessage(188));
  }
}

function findCurrentFiberUsingSlowPath(fiber) {
  const alternate = fiber.alternate;

  if (!alternate) {
    // If there is no alternate, then we only need to check if it is mounted.
    const nearestMounted = getNearestMountedFiber(fiber);

    if (nearestMounted === null) {
      throw Error(formatProdErrorMessage(188));
    }

    if (nearestMounted !== fiber) {
      return null;
    }

    return fiber;
  } // If we have two possible branches, we'll walk backwards up to the root
  // to see what path the root points to. On the way we may hit one of the
  // special cases and we'll deal with them.


  let a = fiber;
  let b = alternate;

  while (true) {
    const parentA = a.return;

    if (parentA === null) {
      // We're at the root.
      break;
    }

    const parentB = parentA.alternate;

    if (parentB === null) {
      // There is no alternate. This is an unusual case. Currently, it only
      // happens when a Suspense component is hidden. An extra fragment fiber
      // is inserted in between the Suspense fiber and its children. Skip
      // over this extra fragment fiber and proceed to the next parent.
      const nextParent = parentA.return;

      if (nextParent !== null) {
        a = b = nextParent;
        continue;
      } // If there's no parent, we're at the root.


      break;
    } // If both copies of the parent fiber point to the same child, we can
    // assume that the child is current. This happens when we bailout on low
    // priority: the bailed out fiber's child reuses the current child.


    if (parentA.child === parentB.child) {
      let child = parentA.child;

      while (child) {
        if (child === a) {
          // We've determined that A is the current branch.
          assertIsMounted(parentA);
          return fiber;
        }

        if (child === b) {
          // We've determined that B is the current branch.
          assertIsMounted(parentA);
          return alternate;
        }

        child = child.sibling;
      } // We should never have an alternate for any mounting node. So the only
      // way this could possibly happen is if this was unmounted, if at all.


      throw Error(formatProdErrorMessage(188));
    }

    if (a.return !== b.return) {
      // The return pointer of A and the return pointer of B point to different
      // fibers. We assume that return pointers never criss-cross, so A must
      // belong to the child set of A.return, and B must belong to the child
      // set of B.return.
      a = parentA;
      b = parentB;
    } else {
      // The return pointers point to the same fiber. We'll have to use the
      // default, slow path: scan the child sets of each parent alternate to see
      // which child belongs to which set.
      //
      // Search parent A's child set
      let didFindChild = false;
      let child = parentA.child;

      while (child) {
        if (child === a) {
          didFindChild = true;
          a = parentA;
          b = parentB;
          break;
        }

        if (child === b) {
          didFindChild = true;
          b = parentA;
          a = parentB;
          break;
        }

        child = child.sibling;
      }

      if (!didFindChild) {
        // Search parent B's child set
        child = parentB.child;

        while (child) {
          if (child === a) {
            didFindChild = true;
            a = parentB;
            b = parentA;
            break;
          }

          if (child === b) {
            didFindChild = true;
            b = parentB;
            a = parentA;
            break;
          }

          child = child.sibling;
        }

        if (!didFindChild) {
          throw Error(formatProdErrorMessage(189));
        }
      }
    }

    if (a.alternate !== b) {
      throw Error(formatProdErrorMessage(190));
    }
  } // If the root is not a host container, we're in a disconnected tree. I.e.
  // unmounted.


  if (a.tag !== HostRoot) {
    throw Error(formatProdErrorMessage(188));
  }

  if (a.stateNode.current === a) {
    // We've determined that A is the current branch.
    return fiber;
  } // Otherwise B has to be current branch.


  return alternate;
}
function findCurrentHostFiber(parent) {
  const currentParent = findCurrentFiberUsingSlowPath(parent);
  return currentParent !== null ? findCurrentHostFiberImpl(currentParent) : null;
}

function findCurrentHostFiberImpl(node) {
  // Next we'll drill down this component to find the first HostComponent/Text.
  const tag = node.tag;

  if (tag === HostComponent || (tag === HostHoistable ) || (tag === HostSingleton ) || tag === HostText) {
    return node;
  }

  let child = node.child;

  while (child !== null) {
    const match = findCurrentHostFiberImpl(child);

    if (match !== null) {
      return match;
    }

    child = child.sibling;
  }

  return null;
}

const emptyContextObject = {};


const contextStackCursor = createCursor(emptyContextObject); // A cursor to a boolean indicating whether the context has changed.

const didPerformWorkStackCursor = createCursor(false); // Keep track of the previous context object that was on the stack.
// We use this to get access to the parent context after we have already
// pushed the next context provider, and now need to merge their contexts.

let previousContext = emptyContextObject;

function getUnmaskedContext(workInProgress, Component, didPushOwnContextIfProvider) {
  {
    if (didPushOwnContextIfProvider && isContextProvider(Component)) {
      // If the fiber is a context provider itself, when we read its context
      // we may have already pushed its own child context on the stack. A context
      // provider should not "see" its own child context. Therefore we read the
      // previous (parent) context instead for a context provider.
      return previousContext;
    }

    return contextStackCursor.current;
  }
}

function cacheContext(workInProgress, unmaskedContext, maskedContext) {
  {
    const instance = workInProgress.stateNode;
    instance.__reactInternalMemoizedUnmaskedChildContext = unmaskedContext;
    instance.__reactInternalMemoizedMaskedChildContext = maskedContext;
  }
}

function getMaskedContext(workInProgress, unmaskedContext) {
  {
    const type = workInProgress.type;
    const contextTypes = type.contextTypes;

    if (!contextTypes) {
      return emptyContextObject;
    } // Avoid recreating masked context unless unmasked context has changed.
    // Failing to do this will result in unnecessary calls to componentWillReceiveProps.
    // This may trigger infinite loops if componentWillReceiveProps calls setState.


    const instance = workInProgress.stateNode;

    if (instance && instance.__reactInternalMemoizedUnmaskedChildContext === unmaskedContext) {
      return instance.__reactInternalMemoizedMaskedChildContext;
    }

    const context = {};

    for (const key in contextTypes) {
      context[key] = unmaskedContext[key];
    }
    // Context is created before the class component is instantiated so check for instance.


    if (instance) {
      cacheContext(workInProgress, unmaskedContext, context);
    }

    return context;
  }
}

function hasContextChanged() {
  {
    return didPerformWorkStackCursor.current;
  }
}

function isContextProvider(type) {
  {
    const childContextTypes = type.childContextTypes;
    return childContextTypes !== null && childContextTypes !== undefined;
  }
}

function popContext(fiber) {
  {
    pop(didPerformWorkStackCursor);
    pop(contextStackCursor);
  }
}

function popTopLevelContextObject(fiber) {
  {
    pop(didPerformWorkStackCursor);
    pop(contextStackCursor);
  }
}

function pushTopLevelContextObject(fiber, context, didChange) {
  {
    if (contextStackCursor.current !== emptyContextObject) {
      throw Error(formatProdErrorMessage(168));
    }

    push(contextStackCursor, context);
    push(didPerformWorkStackCursor, didChange);
  }
}

function processChildContext(fiber, type, parentContext) {
  {
    const instance = fiber.stateNode;
    const childContextTypes = type.childContextTypes; // TODO (bvaughn) Replace this behavior with an invariant() in the future.
    // It has only been added in Fiber to match the (unintentional) behavior in Stack.

    if (typeof instance.getChildContext !== 'function') {

      return parentContext;
    }

    const childContext = instance.getChildContext();

    for (const contextKey in childContext) {
      if (!(contextKey in childContextTypes)) {
        throw Error(formatProdErrorMessage(108, getComponentNameFromFiber(fiber) || 'Unknown', contextKey));
      }
    }

    return assign({}, parentContext, childContext);
  }
}

function pushContextProvider(workInProgress) {
  {
    const instance = workInProgress.stateNode; // We push the context as early as possible to ensure stack integrity.
    // If the instance does not exist yet, we will push null at first,
    // and replace it on the stack later when invalidating the context.

    const memoizedMergedChildContext = instance && instance.__reactInternalMemoizedMergedChildContext || emptyContextObject; // Remember the parent context so we can merge with it later.
    // Inherit the parent's did-perform-work value to avoid inadvertently blocking updates.

    previousContext = contextStackCursor.current;
    push(contextStackCursor, memoizedMergedChildContext);
    push(didPerformWorkStackCursor, didPerformWorkStackCursor.current);
    return true;
  }
}

function invalidateContextProvider(workInProgress, type, didChange) {
  {
    const instance = workInProgress.stateNode;

    if (!instance) {
      throw Error(formatProdErrorMessage(169));
    }

    if (didChange) {
      // Merge parent and own context.
      // Skip this if we're not updating due to sCU.
      // This avoids unnecessarily recomputing memoized values.
      const mergedContext = processChildContext(workInProgress, type, previousContext);
      instance.__reactInternalMemoizedMergedChildContext = mergedContext; // Replace the old (or empty) context with the new one.
      // It is important to unwind the context in the reverse order.

      pop(didPerformWorkStackCursor);
      pop(contextStackCursor); // Now push the new context and mark that it has changed.

      push(contextStackCursor, mergedContext);
      push(didPerformWorkStackCursor, didChange);
    } else {
      pop(didPerformWorkStackCursor);
      push(didPerformWorkStackCursor, didChange);
    }
  }
}

function findCurrentUnmaskedContext(fiber) {
  {
    // Currently this is only used with renderSubtreeIntoContainer; not sure if it
    // makes sense elsewhere
    if (!isFiberMounted(fiber) || fiber.tag !== ClassComponent) {
      throw Error(formatProdErrorMessage(170));
    }

    let node = fiber;

    do {
      switch (node.tag) {
        case HostRoot:
          return node.stateNode.context;

        case ClassComponent:
          {
            const Component = node.type;

            if (isContextProvider(Component)) {
              return node.stateNode.__reactInternalMemoizedMergedChildContext;
            }

            break;
          }
      } // $FlowFixMe[incompatible-type] we bail out when we get a null


      node = node.return;
    } while (node !== null);

    throw Error(formatProdErrorMessage(171));
  }
}

const LegacyRoot = 0;
const ConcurrentRoot = 1;

// We use the existence of the state object as an indicator that the component
// is hidden.
const OffscreenVisible =
/*                     */
0b001;
const OffscreenDetached =
/*                    */
0b010;
const OffscreenPassiveEffectsConnected =
/*     */
0b100;
function isOffscreenManual(offscreenFiber) {
  return offscreenFiber.memoizedProps !== null && offscreenFiber.memoizedProps.mode === 'manual';
}

/**
 * inlined Object.is polyfill to avoid requiring consumers ship their own
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
 */
function is(x, y) {
  return x === y && (x !== 0 || 1 / x === 1 / y) || x !== x && y !== y // eslint-disable-line no-self-compare
  ;
}

const objectIs = // $FlowFixMe[method-unbinding]
typeof Object.is === 'function' ? Object.is : is;

// This is imported by the event replaying implementation in React DOM. It's
// in a separate file to break a circular dependency between the renderer and
// the reconciler.
function isRootDehydrated(root) {
  const currentState = root.current.memoizedState;
  return currentState.isDehydrated;
}

// Ids are base 32 strings whose binary representation corresponds to the
// Intentionally not using it yet to derisk the initial implementation, because
// the way we push/pop these values is a bit unusual. If there's a mistake, I'd
// rather the ids be wrong than crash the whole reconciler.

const forkStack = [];
let forkStackIndex = 0;
let treeForkProvider = null;
let treeForkCount = 0;
const idStack = [];
let idStackIndex = 0;
let treeContextProvider = null;
let treeContextId = 1;
let treeContextOverflow = '';
function isForkedChild(workInProgress) {
  return (workInProgress.flags & Forked) !== NoFlags$1;
}
function getForksAtLevel(workInProgress) {
  return treeForkCount;
}
function getTreeId() {
  const overflow = treeContextOverflow;
  const idWithLeadingBit = treeContextId;
  const id = idWithLeadingBit & ~getLeadingBit(idWithLeadingBit);
  return id.toString(32) + overflow;
}
function pushTreeFork(workInProgress, totalChildren) {
  forkStack[forkStackIndex++] = treeForkCount;
  forkStack[forkStackIndex++] = treeForkProvider;
  treeForkProvider = workInProgress;
  treeForkCount = totalChildren;
}
function pushTreeId(workInProgress, totalChildren, index) {
  idStack[idStackIndex++] = treeContextId;
  idStack[idStackIndex++] = treeContextOverflow;
  idStack[idStackIndex++] = treeContextProvider;
  treeContextProvider = workInProgress;
  const baseIdWithLeadingBit = treeContextId;
  const baseOverflow = treeContextOverflow; // The leftmost 1 marks the end of the sequence, non-inclusive. It's not part
  // of the id; we use it to account for leading 0s.

  const baseLength = getBitLength(baseIdWithLeadingBit) - 1;
  const baseId = baseIdWithLeadingBit & ~(1 << baseLength);
  const slot = index + 1;
  const length = getBitLength(totalChildren) + baseLength; // 30 is the max length we can store without overflowing, taking into
  // consideration the leading 1 we use to mark the end of the sequence.

  if (length > 30) {
    // We overflowed the bitwise-safe range. Fall back to slower algorithm.
    // This branch assumes the length of the base id is greater than 5; it won't
    // work for smaller ids, because you need 5 bits per character.
    //
    // We encode the id in multiple steps: first the base id, then the
    // remaining digits.
    //
    // Each 5 bit sequence corresponds to a single base 32 character. So for
    // example, if the current id is 23 bits long, we can convert 20 of those
    // bits into a string of 4 characters, with 3 bits left over.
    //
    // First calculate how many bits in the base id represent a complete
    // sequence of characters.
    const numberOfOverflowBits = baseLength - baseLength % 5; // Then create a bitmask that selects only those bits.

    const newOverflowBits = (1 << numberOfOverflowBits) - 1; // Select the bits, and convert them to a base 32 string.

    const newOverflow = (baseId & newOverflowBits).toString(32); // Now we can remove those bits from the base id.

    const restOfBaseId = baseId >> numberOfOverflowBits;
    const restOfBaseLength = baseLength - numberOfOverflowBits; // Finally, encode the rest of the bits using the normal algorithm. Because
    // we made more room, this time it won't overflow.

    const restOfLength = getBitLength(totalChildren) + restOfBaseLength;
    const restOfNewBits = slot << restOfBaseLength;
    const id = restOfNewBits | restOfBaseId;
    const overflow = newOverflow + baseOverflow;
    treeContextId = 1 << restOfLength | id;
    treeContextOverflow = overflow;
  } else {
    // Normal path
    const newBits = slot << baseLength;
    const id = newBits | baseId;
    const overflow = baseOverflow;
    treeContextId = 1 << length | id;
    treeContextOverflow = overflow;
  }
}
function pushMaterializedTreeId(workInProgress) {
  // in its children.

  const returnFiber = workInProgress.return;

  if (returnFiber !== null) {
    const numberOfForks = 1;
    const slotIndex = 0;
    pushTreeFork(workInProgress, numberOfForks);
    pushTreeId(workInProgress, numberOfForks, slotIndex);
  }
}

function getBitLength(number) {
  return 32 - clz32(number);
}

function getLeadingBit(id) {
  return 1 << getBitLength(id) - 1;
}

function popTreeContext(workInProgress) {
  // Restore the previous values.
  // This is a bit more complicated than other context-like modules in Fiber
  // because the same Fiber may appear on the stack multiple times and for
  // different reasons. We have to keep popping until the work-in-progress is
  // no longer at the top of the stack.
  while (workInProgress === treeForkProvider) {
    treeForkProvider = forkStack[--forkStackIndex];
    forkStack[forkStackIndex] = null;
    treeForkCount = forkStack[--forkStackIndex];
    forkStack[forkStackIndex] = null;
  }

  while (workInProgress === treeContextProvider) {
    treeContextProvider = idStack[--idStackIndex];
    idStack[idStackIndex] = null;
    treeContextOverflow = idStack[--idStackIndex];
    idStack[idStackIndex] = null;
    treeContextId = idStack[--idStackIndex];
    idStack[idStackIndex] = null;
  }
}
function getSuspendedTreeContext() {

  if (treeContextProvider !== null) {
    return {
      id: treeContextId,
      overflow: treeContextOverflow
    };
  } else {
    return null;
  }
}
function restoreSuspendedTreeContext(workInProgress, suspendedContext) {
  idStack[idStackIndex++] = treeContextId;
  idStack[idStackIndex++] = treeContextOverflow;
  idStack[idStackIndex++] = treeContextProvider;
  treeContextId = suspendedContext.id;
  treeContextOverflow = suspendedContext.overflow;
  treeContextProvider = workInProgress;
}

// This may have been an insertion or a hydration.

let hydrationParentFiber = null;
let nextHydratableInstance = null;
let isHydrating = false; // This flag allows for warning supression when we expect there to be mismatches

let hydrationErrors = null;
let rootOrSingletonContext = false;

function enterHydrationState(fiber) {

  const parentInstance = fiber.stateNode.containerInfo;
  nextHydratableInstance = getFirstHydratableChildWithinContainer(parentInstance);
  hydrationParentFiber = fiber;
  isHydrating = true;
  hydrationErrors = null;
  rootOrSingletonContext = true;
  return true;
}

function reenterHydrationStateFromDehydratedSuspenseInstance(fiber, suspenseInstance, treeContext) {

  nextHydratableInstance = getFirstHydratableChildWithinSuspenseInstance(suspenseInstance);
  hydrationParentFiber = fiber;
  isHydrating = true;
  hydrationErrors = null;
  rootOrSingletonContext = false;

  if (treeContext !== null) {
    restoreSuspendedTreeContext(fiber, treeContext);
  }

  return true;
}

function deleteHydratableInstance(returnFiber, instance) {
  const childToDelete = createFiberFromHostInstanceForDeletion();
  childToDelete.stateNode = instance;
  childToDelete.return = returnFiber;
  const deletions = returnFiber.deletions;

  if (deletions === null) {
    returnFiber.deletions = [childToDelete];
    returnFiber.flags |= ChildDeletion;
  } else {
    deletions.push(childToDelete);
  }
}

function insertNonHydratedInstance(returnFiber, fiber) {
  fiber.flags = fiber.flags & ~Hydrating | Placement;
}

function tryHydrateInstance(fiber, nextInstance) {
  // fiber is a HostComponent Fiber
  const instance = canHydrateInstance(nextInstance, fiber.type, fiber.pendingProps, rootOrSingletonContext);

  if (instance !== null) {
    fiber.stateNode = instance;
    hydrationParentFiber = fiber;
    nextHydratableInstance = getFirstHydratableChild(instance);
    rootOrSingletonContext = false;
    return true;
  }

  return false;
}

function tryHydrateText(fiber, nextInstance) {
  // fiber is a HostText Fiber
  const text = fiber.pendingProps;
  const textInstance = canHydrateTextInstance(nextInstance, text, rootOrSingletonContext);

  if (textInstance !== null) {
    fiber.stateNode = textInstance;
    hydrationParentFiber = fiber; // Text Instances don't have children so there's nothing to hydrate.

    nextHydratableInstance = null;
    return true;
  }

  return false;
}

function tryHydrateSuspense(fiber, nextInstance) {
  // fiber is a SuspenseComponent Fiber
  const suspenseInstance = canHydrateSuspenseInstance(nextInstance, rootOrSingletonContext);

  if (suspenseInstance !== null) {
    const suspenseState = {
      dehydrated: suspenseInstance,
      treeContext: getSuspendedTreeContext(),
      retryLane: OffscreenLane
    };
    fiber.memoizedState = suspenseState; // Store the dehydrated fragment as a child fiber.
    // This simplifies the code for getHostSibling and deleting nodes,
    // since it doesn't have to consider all Suspense boundaries and
    // check if they're dehydrated ones or not.

    const dehydratedFragment = createFiberFromDehydratedFragment(suspenseInstance);
    dehydratedFragment.return = fiber;
    fiber.child = dehydratedFragment;
    hydrationParentFiber = fiber; // While a Suspense Instance does have children, we won't step into
    // it during the first pass. Instead, we'll reenter it later.

    nextHydratableInstance = null;
    return true;
  }

  return false;
}

function shouldClientRenderOnMismatch(fiber) {
  return (fiber.mode & ConcurrentMode) !== NoMode && (fiber.flags & DidCapture) === NoFlags$1;
}

function throwOnHydrationMismatch(fiber) {
  throw Error(formatProdErrorMessage(418));
}

function claimHydratableSingleton(fiber) {
  {
    if (!isHydrating) {
      return;
    }

    const currentRootContainer = getRootHostContainer();
    const instance = fiber.stateNode = resolveSingletonInstance(fiber.type, fiber.pendingProps, currentRootContainer);
    hydrationParentFiber = fiber;
    rootOrSingletonContext = true;
    nextHydratableInstance = getFirstHydratableChild(instance);
  }
}

function tryToClaimNextHydratableInstance(fiber) {
  if (!isHydrating) {
    return;
  }

  const initialInstance = nextHydratableInstance;
  const nextInstance = nextHydratableInstance;

  if (!nextInstance) {
    if (shouldClientRenderOnMismatch(fiber)) {
      throwOnHydrationMismatch();
    } // Nothing to hydrate. Make it an insertion.


    insertNonHydratedInstance(hydrationParentFiber, fiber);
    isHydrating = false;
    hydrationParentFiber = fiber;
    nextHydratableInstance = initialInstance;
    return;
  }

  const firstAttemptedInstance = nextInstance;

  if (!tryHydrateInstance(fiber, nextInstance)) {
    if (shouldClientRenderOnMismatch(fiber)) {
      throwOnHydrationMismatch();
    } // If we can't hydrate this instance let's try the next one.
    // We use this as a heuristic. It's based on intuition and not data so it
    // might be flawed or unnecessary.


    nextHydratableInstance = getNextHydratableSibling(nextInstance);
    const prevHydrationParentFiber = hydrationParentFiber;

    if (!nextHydratableInstance || !tryHydrateInstance(fiber, nextHydratableInstance)) {
      // Nothing to hydrate. Make it an insertion.
      insertNonHydratedInstance(hydrationParentFiber, fiber);
      isHydrating = false;
      hydrationParentFiber = fiber;
      nextHydratableInstance = initialInstance;
      return;
    } // We matched the next one, we'll now assume that the first one was
    // superfluous and we'll delete it. Since we can't eagerly delete it
    // we'll have to schedule a deletion. To do that, this node needs a dummy
    // fiber associated with it.


    deleteHydratableInstance(prevHydrationParentFiber, firstAttemptedInstance);
  }
}

function tryToClaimNextHydratableTextInstance(fiber) {
  if (!isHydrating) {
    return;
  }

  const text = fiber.pendingProps;
  const isHydratable = isHydratableText(text);
  const initialInstance = nextHydratableInstance;
  const nextInstance = nextHydratableInstance;

  if (!nextInstance || !isHydratable) {
    // We exclude non hydrabable text because we know there are no matching hydratables.
    // We either throw or insert depending on the render mode.
    if (shouldClientRenderOnMismatch(fiber)) {
      throwOnHydrationMismatch();
    } // Nothing to hydrate. Make it an insertion.


    insertNonHydratedInstance(hydrationParentFiber, fiber);
    isHydrating = false;
    hydrationParentFiber = fiber;
    nextHydratableInstance = initialInstance;
    return;
  }

  const firstAttemptedInstance = nextInstance;

  if (!tryHydrateText(fiber, nextInstance)) {
    if (shouldClientRenderOnMismatch(fiber)) {
      throwOnHydrationMismatch();
    } // If we can't hydrate this instance let's try the next one.
    // We use this as a heuristic. It's based on intuition and not data so it
    // might be flawed or unnecessary.


    nextHydratableInstance = getNextHydratableSibling(nextInstance);
    const prevHydrationParentFiber = hydrationParentFiber;

    if (!nextHydratableInstance || !tryHydrateText(fiber, nextHydratableInstance)) {
      // Nothing to hydrate. Make it an insertion.
      insertNonHydratedInstance(hydrationParentFiber, fiber);
      isHydrating = false;
      hydrationParentFiber = fiber;
      nextHydratableInstance = initialInstance;
      return;
    } // We matched the next one, we'll now assume that the first one was
    // superfluous and we'll delete it. Since we can't eagerly delete it
    // we'll have to schedule a deletion. To do that, this node needs a dummy
    // fiber associated with it.


    deleteHydratableInstance(prevHydrationParentFiber, firstAttemptedInstance);
  }
}

function tryToClaimNextHydratableSuspenseInstance(fiber) {
  if (!isHydrating) {
    return;
  }

  const initialInstance = nextHydratableInstance;
  const nextInstance = nextHydratableInstance;

  if (!nextInstance) {
    if (shouldClientRenderOnMismatch(fiber)) {
      throwOnHydrationMismatch();
    } // Nothing to hydrate. Make it an insertion.


    insertNonHydratedInstance(hydrationParentFiber, fiber);
    isHydrating = false;
    hydrationParentFiber = fiber;
    nextHydratableInstance = initialInstance;
    return;
  }

  const firstAttemptedInstance = nextInstance;

  if (!tryHydrateSuspense(fiber, nextInstance)) {
    if (shouldClientRenderOnMismatch(fiber)) {
      throwOnHydrationMismatch();
    } // If we can't hydrate this instance let's try the next one.
    // We use this as a heuristic. It's based on intuition and not data so it
    // might be flawed or unnecessary.


    nextHydratableInstance = getNextHydratableSibling(nextInstance);
    const prevHydrationParentFiber = hydrationParentFiber;

    if (!nextHydratableInstance || !tryHydrateSuspense(fiber, nextHydratableInstance)) {
      // Nothing to hydrate. Make it an insertion.
      insertNonHydratedInstance(hydrationParentFiber, fiber);
      isHydrating = false;
      hydrationParentFiber = fiber;
      nextHydratableInstance = initialInstance;
      return;
    } // We matched the next one, we'll now assume that the first one was
    // superfluous and we'll delete it. Since we can't eagerly delete it
    // we'll have to schedule a deletion. To do that, this node needs a dummy
    // fiber associated with it.


    deleteHydratableInstance(prevHydrationParentFiber, firstAttemptedInstance);
  }
}

function tryToClaimNextHydratableFormMarkerInstance(fiber) {
  if (!isHydrating) {
    return false;
  }

  if (nextHydratableInstance) {
    const markerInstance = canHydrateFormStateMarker(nextHydratableInstance, rootOrSingletonContext);

    if (markerInstance) {
      // Found the marker instance.
      nextHydratableInstance = getNextHydratableSibling(markerInstance); // Return true if this marker instance should use the state passed
      // to hydrateRoot.
      // TODO: As an optimization, Fizz should only emit these markers if form
      // state is passed at the root.

      return isFormStateMarkerMatching(markerInstance);
    }
  } // Should have found a marker instance. Throw an error to trigger client
  // rendering. We don't bother to check if we're in a concurrent root because
  // useFormState is a new API, so backwards compat is not an issue.


  throwOnHydrationMismatch();
  return false;
}

function prepareToHydrateHostInstance(fiber, hostContext) {

  const instance = fiber.stateNode;
  hydrateInstance(instance, fiber.type, fiber.memoizedProps, hostContext, fiber);
}

function prepareToHydrateHostTextInstance(fiber) {

  const textInstance = fiber.stateNode;
  const textContent = fiber.memoizedProps;
  const shouldUpdate = hydrateTextInstance(textInstance, textContent, fiber);

  if (shouldUpdate) {
    // We assume that prepareToHydrateHostTextInstance is called in a context where the
    // hydration parent is the parent host component of this host text.
    const returnFiber = hydrationParentFiber;

    if (returnFiber !== null) {
      switch (returnFiber.tag) {
        case HostRoot:
          {
            const parentContainer = returnFiber.stateNode.containerInfo;
            const isConcurrentMode = (returnFiber.mode & ConcurrentMode) !== NoMode;
            didNotMatchHydratedContainerTextInstance(parentContainer, textInstance, textContent, // TODO: Delete this argument when we remove the legacy root API.
            isConcurrentMode);

            if (isConcurrentMode && enableClientRenderFallbackOnTextMismatch) {
              // In concurrent mode we never update the mismatched text,
              // even if the error was ignored.
              return false;
            }

            break;
          }

        case HostSingleton:
        case HostComponent:
          {
            const parentType = returnFiber.type;
            const parentProps = returnFiber.memoizedProps;
            const parentInstance = returnFiber.stateNode;
            const isConcurrentMode = (returnFiber.mode & ConcurrentMode) !== NoMode;
            didNotMatchHydratedTextInstance(parentType, parentProps, parentInstance, textInstance, textContent, // TODO: Delete this argument when we remove the legacy root API.
            isConcurrentMode);

            if (isConcurrentMode && enableClientRenderFallbackOnTextMismatch) {
              // In concurrent mode we never update the mismatched text,
              // even if the error was ignored.
              return false;
            }

            break;
          }
      }
    }
  }

  return shouldUpdate;
}

function prepareToHydrateHostSuspenseInstance(fiber) {

  const suspenseState = fiber.memoizedState;
  const suspenseInstance = suspenseState !== null ? suspenseState.dehydrated : null;

  if (!suspenseInstance) {
    throw Error(formatProdErrorMessage(317));
  }

  hydrateSuspenseInstance(suspenseInstance, fiber);
}

function skipPastDehydratedSuspenseInstance(fiber) {

  const suspenseState = fiber.memoizedState;
  const suspenseInstance = suspenseState !== null ? suspenseState.dehydrated : null;

  if (!suspenseInstance) {
    throw Error(formatProdErrorMessage(317));
  }

  return getNextHydratableInstanceAfterSuspenseInstance(suspenseInstance);
}

function popToNextHostParent(fiber) {
  hydrationParentFiber = fiber.return;

  while (hydrationParentFiber) {
    switch (hydrationParentFiber.tag) {
      case HostRoot:
      case HostSingleton:
        rootOrSingletonContext = true;
        return;

      case HostComponent:
      case SuspenseComponent:
        rootOrSingletonContext = false;
        return;

      default:
        hydrationParentFiber = hydrationParentFiber.return;
    }
  }
}

function popHydrationState(fiber) {

  if (fiber !== hydrationParentFiber) {
    // We're deeper than the current hydration context, inside an inserted
    // tree.
    return false;
  }

  if (!isHydrating) {
    // If we're not currently hydrating but we're in a hydration context, then
    // we were an insertion and now need to pop up reenter hydration of our
    // siblings.
    popToNextHostParent(fiber);
    isHydrating = true;
    return false;
  }

  let shouldClear = false;

  {
    // With float we never clear the Root, or Singleton instances. We also do not clear Instances
    // that have singleton text content
    if (fiber.tag !== HostRoot && fiber.tag !== HostSingleton && !(fiber.tag === HostComponent && (!shouldDeleteUnhydratedTailInstances(fiber.type) || shouldSetTextContent(fiber.type, fiber.memoizedProps)))) {
      shouldClear = true;
    }
  }

  if (shouldClear) {
    let nextInstance = nextHydratableInstance;

    if (nextInstance) {
      if (shouldClientRenderOnMismatch(fiber)) {
        warnIfUnhydratedTailNodes();
        throwOnHydrationMismatch();
      } else {
        while (nextInstance) {
          deleteHydratableInstance(fiber, nextInstance);
          nextInstance = getNextHydratableSibling(nextInstance);
        }
      }
    }
  }

  popToNextHostParent(fiber);

  if (fiber.tag === SuspenseComponent) {
    nextHydratableInstance = skipPastDehydratedSuspenseInstance(fiber);
  } else {
    nextHydratableInstance = hydrationParentFiber ? getNextHydratableSibling(fiber.stateNode) : null;
  }

  return true;
}

function hasUnhydratedTailNodes() {
  return isHydrating && nextHydratableInstance !== null;
}

function warnIfUnhydratedTailNodes(fiber) {
  let nextInstance = nextHydratableInstance;

  while (nextInstance) {
    nextInstance = getNextHydratableSibling(nextInstance);
  }
}

function resetHydrationState() {

  hydrationParentFiber = null;
  nextHydratableInstance = null;
  isHydrating = false;
}

function upgradeHydrationErrorsToRecoverable() {
  if (hydrationErrors !== null) {
    // Successfully completed a forced client render. The errors that occurred
    // during the hydration attempt are now recovered. We will log them in
    // commit phase, once the entire tree has finished.
    queueRecoverableErrors(hydrationErrors);
    hydrationErrors = null;
  }
}

function getIsHydrating() {
  return isHydrating;
}

function queueHydrationError(error) {
  if (hydrationErrors === null) {
    hydrationErrors = [error];
  } else {
    hydrationErrors.push(error);
  }
}

// we wait until the current render is over (either finished or interrupted)
// before adding it to the fiber/hook queue. Push to this array so we can
// access the queue, fiber, update, et al later.

const concurrentQueues = [];
let concurrentQueuesIndex = 0;
let concurrentlyUpdatedLanes = NoLanes;
function finishQueueingConcurrentUpdates() {
  const endIndex = concurrentQueuesIndex;
  concurrentQueuesIndex = 0;
  concurrentlyUpdatedLanes = NoLanes;
  let i = 0;

  while (i < endIndex) {
    const fiber = concurrentQueues[i];
    concurrentQueues[i++] = null;
    const queue = concurrentQueues[i];
    concurrentQueues[i++] = null;
    const update = concurrentQueues[i];
    concurrentQueues[i++] = null;
    const lane = concurrentQueues[i];
    concurrentQueues[i++] = null;

    if (queue !== null && update !== null) {
      const pending = queue.pending;

      if (pending === null) {
        // This is the first update. Create a circular list.
        update.next = update;
      } else {
        update.next = pending.next;
        pending.next = update;
      }

      queue.pending = update;
    }

    if (lane !== NoLane) {
      markUpdateLaneFromFiberToRoot(fiber, update, lane);
    }
  }
}
function getConcurrentlyUpdatedLanes() {
  return concurrentlyUpdatedLanes;
}

function enqueueUpdate$1(fiber, queue, update, lane) {
  // Don't update the `childLanes` on the return path yet. If we already in
  // the middle of rendering, wait until after it has completed.
  concurrentQueues[concurrentQueuesIndex++] = fiber;
  concurrentQueues[concurrentQueuesIndex++] = queue;
  concurrentQueues[concurrentQueuesIndex++] = update;
  concurrentQueues[concurrentQueuesIndex++] = lane;
  concurrentlyUpdatedLanes = mergeLanes(concurrentlyUpdatedLanes, lane); // The fiber's `lane` field is used in some places to check if any work is
  // scheduled, to perform an eager bailout, so we need to update it immediately.
  // TODO: We should probably move this to the "shared" queue instead.

  fiber.lanes = mergeLanes(fiber.lanes, lane);
  const alternate = fiber.alternate;

  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }
}

function enqueueConcurrentHookUpdate(fiber, queue, update, lane) {
  const concurrentQueue = queue;
  const concurrentUpdate = update;
  enqueueUpdate$1(fiber, concurrentQueue, concurrentUpdate, lane);
  return getRootForUpdatedFiber(fiber);
}
function enqueueConcurrentHookUpdateAndEagerlyBailout(fiber, queue, update) {
  // This function is used to queue an update that doesn't need a rerender. The
  // only reason we queue it is in case there's a subsequent higher priority
  // update that causes it to be rebased.
  const lane = NoLane;
  const concurrentQueue = queue;
  const concurrentUpdate = update;
  enqueueUpdate$1(fiber, concurrentQueue, concurrentUpdate, lane); // Usually we can rely on the upcoming render phase to process the concurrent
  // queue. However, since this is a bail out, we're not scheduling any work
  // here. So the update we just queued will leak until something else happens
  // to schedule work (if ever).
  //
  // Check if we're currently in the middle of rendering a tree, and if not,
  // process the queue immediately to prevent a leak.

  const isConcurrentlyRendering = getWorkInProgressRoot() !== null;

  if (!isConcurrentlyRendering) {
    finishQueueingConcurrentUpdates();
  }
}
function enqueueConcurrentClassUpdate(fiber, queue, update, lane) {
  const concurrentQueue = queue;
  const concurrentUpdate = update;
  enqueueUpdate$1(fiber, concurrentQueue, concurrentUpdate, lane);
  return getRootForUpdatedFiber(fiber);
}
function enqueueConcurrentRenderForLane(fiber, lane) {
  enqueueUpdate$1(fiber, null, null, lane);
  return getRootForUpdatedFiber(fiber);
} // Calling this function outside this module should only be done for backwards
// compatibility and should always be accompanied by a warning.

function unsafe_markUpdateLaneFromFiberToRoot(sourceFiber, lane) {
  // NOTE: For Hyrum's Law reasons, if an infinite update loop is detected, it
  // should throw before `markUpdateLaneFromFiberToRoot` is called. But this is
  // undefined behavior and we can change it if we need to; it just so happens
  // that, at the time of this writing, there's an internal product test that
  // happens to rely on this.
  const root = getRootForUpdatedFiber(sourceFiber);
  markUpdateLaneFromFiberToRoot(sourceFiber, null, lane);
  return root;
}

function markUpdateLaneFromFiberToRoot(sourceFiber, update, lane) {
  // Update the source fiber's lanes
  sourceFiber.lanes = mergeLanes(sourceFiber.lanes, lane);
  let alternate = sourceFiber.alternate;

  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  } // Walk the parent path to the root and update the child lanes.


  let isHidden = false;
  let parent = sourceFiber.return;
  let node = sourceFiber;

  while (parent !== null) {
    parent.childLanes = mergeLanes(parent.childLanes, lane);
    alternate = parent.alternate;

    if (alternate !== null) {
      alternate.childLanes = mergeLanes(alternate.childLanes, lane);
    }

    if (parent.tag === OffscreenComponent) {
      // Check if this offscreen boundary is currently hidden.
      //
      // The instance may be null if the Offscreen parent was unmounted. Usually
      // the parent wouldn't be reachable in that case because we disconnect
      // fibers from the tree when they are deleted. However, there's a weird
      // edge case where setState is called on a fiber that was interrupted
      // before it ever mounted. Because it never mounts, it also never gets
      // deleted. Because it never gets deleted, its return pointer never gets
      // disconnected. Which means it may be attached to a deleted Offscreen
      // parent node. (This discovery suggests it may be better for memory usage
      // if we don't attach the `return` pointer until the commit phase, though
      // in order to do that we'd need some other way to track the return
      // pointer during the initial render, like on the stack.)
      //
      // This case is always accompanied by a warning, but we still need to
      // account for it. (There may be other cases that we haven't discovered,
      // too.)
      const offscreenInstance = parent.stateNode;

      if (offscreenInstance !== null && !(offscreenInstance._visibility & OffscreenVisible)) {
        isHidden = true;
      }
    }

    node = parent;
    parent = parent.return;
  }

  if (isHidden && update !== null && node.tag === HostRoot) {
    const root = node.stateNode;
    markHiddenUpdate(root, update, lane);
  }
}

function getRootForUpdatedFiber(sourceFiber) {
  // TODO: We will detect and infinite update loop and throw even if this fiber
  // has already unmounted. This isn't really necessary but it happens to be the
  // current behavior we've used for several release cycles. Consider not
  // performing this check if the updated fiber already unmounted, since it's
  // not possible for that to cause an infinite update loop.
  throwIfInfiniteUpdateLoopDetected(); // When a setState happens, we must ensure the root is scheduled. Because
  let node = sourceFiber;
  let parent = node.return;

  while (parent !== null) {
    node = parent;
    parent = node.return;
  }

  return node.tag === HostRoot ? node.stateNode : null;
}

const UpdateState = 0;
const ReplaceState = 1;
const ForceUpdate = 2;
const CaptureUpdate = 3; // Global state that is reset at the beginning of calling `processUpdateQueue`.
// It should only be read right after calling `processUpdateQueue`, via
// `checkHasForceUpdateAfterProcessing`.

let hasForceUpdate = false;

function initializeUpdateQueue(fiber) {
  const queue = {
    baseState: fiber.memoizedState,
    firstBaseUpdate: null,
    lastBaseUpdate: null,
    shared: {
      pending: null,
      lanes: NoLanes,
      hiddenCallbacks: null
    },
    callbacks: null
  };
  fiber.updateQueue = queue;
}
function cloneUpdateQueue(current, workInProgress) {
  // Clone the update queue from current. Unless it's already a clone.
  const queue = workInProgress.updateQueue;
  const currentQueue = current.updateQueue;

  if (queue === currentQueue) {
    const clone = {
      baseState: currentQueue.baseState,
      firstBaseUpdate: currentQueue.firstBaseUpdate,
      lastBaseUpdate: currentQueue.lastBaseUpdate,
      shared: currentQueue.shared,
      callbacks: null
    };
    workInProgress.updateQueue = clone;
  }
}
function createUpdate(lane) {
  const update = {
    lane,
    tag: UpdateState,
    payload: null,
    callback: null,
    next: null
  };
  return update;
}
function enqueueUpdate(fiber, update, lane) {
  const updateQueue = fiber.updateQueue;

  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    return null;
  }

  const sharedQueue = updateQueue.shared;

  if (isUnsafeClassRenderPhaseUpdate()) {
    // This is an unsafe render phase update. Add directly to the update
    // queue so we can process it immediately during the current render.
    const pending = sharedQueue.pending;

    if (pending === null) {
      // This is the first update. Create a circular list.
      update.next = update;
    } else {
      update.next = pending.next;
      pending.next = update;
    }

    sharedQueue.pending = update; // Update the childLanes even though we're most likely already rendering
    // this fiber. This is for backwards compatibility in the case where you
    // update a different component during render phase than the one that is
    // currently renderings (a pattern that is accompanied by a warning).

    return unsafe_markUpdateLaneFromFiberToRoot(fiber, lane);
  } else {
    return enqueueConcurrentClassUpdate(fiber, sharedQueue, update, lane);
  }
}
function entangleTransitions(root, fiber, lane) {
  const updateQueue = fiber.updateQueue;

  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    return;
  }

  const sharedQueue = updateQueue.shared;

  if (isTransitionLane(lane)) {
    let queueLanes = sharedQueue.lanes; // If any entangled lanes are no longer pending on the root, then they must
    // have finished. We can remove them from the shared queue, which represents
    // a superset of the actually pending lanes. In some cases we may entangle
    // more than we need to, but that's OK. In fact it's worse if we *don't*
    // entangle when we should.

    queueLanes = intersectLanes(queueLanes, root.pendingLanes); // Entangle the new transition lane with the other transition lanes.

    const newQueueLanes = mergeLanes(queueLanes, lane);
    sharedQueue.lanes = newQueueLanes; // Even if queue.lanes already include lane, we don't know for certain if
    // the lane finished since the last time we entangled it. So we need to
    // entangle it again, just to be sure.

    markRootEntangled(root, newQueueLanes);
  }
}
function enqueueCapturedUpdate(workInProgress, capturedUpdate) {
  // Captured updates are updates that are thrown by a child during the render
  // phase. They should be discarded if the render is aborted. Therefore,
  // we should only put them on the work-in-progress queue, not the current one.
  let queue = workInProgress.updateQueue; // Check if the work-in-progress queue is a clone.

  const current = workInProgress.alternate;

  if (current !== null) {
    const currentQueue = current.updateQueue;

    if (queue === currentQueue) {
      // The work-in-progress queue is the same as current. This happens when
      // we bail out on a parent fiber that then captures an error thrown by
      // a child. Since we want to append the update only to the work-in
      // -progress queue, we need to clone the updates. We usually clone during
      // processUpdateQueue, but that didn't happen in this case because we
      // skipped over the parent when we bailed out.
      let newFirst = null;
      let newLast = null;
      const firstBaseUpdate = queue.firstBaseUpdate;

      if (firstBaseUpdate !== null) {
        // Loop through the updates and clone them.
        let update = firstBaseUpdate;

        do {
          const clone = {
            lane: update.lane,
            tag: update.tag,
            payload: update.payload,
            // When this update is rebased, we should not fire its
            // callback again.
            callback: null,
            next: null
          };

          if (newLast === null) {
            newFirst = newLast = clone;
          } else {
            newLast.next = clone;
            newLast = clone;
          } // $FlowFixMe[incompatible-type] we bail out when we get a null


          update = update.next;
        } while (update !== null); // Append the captured update the end of the cloned list.


        if (newLast === null) {
          newFirst = newLast = capturedUpdate;
        } else {
          newLast.next = capturedUpdate;
          newLast = capturedUpdate;
        }
      } else {
        // There are no base updates.
        newFirst = newLast = capturedUpdate;
      }

      queue = {
        baseState: currentQueue.baseState,
        firstBaseUpdate: newFirst,
        lastBaseUpdate: newLast,
        shared: currentQueue.shared,
        callbacks: currentQueue.callbacks
      };
      workInProgress.updateQueue = queue;
      return;
    }
  } // Append the update to the end of the list.


  const lastBaseUpdate = queue.lastBaseUpdate;

  if (lastBaseUpdate === null) {
    queue.firstBaseUpdate = capturedUpdate;
  } else {
    lastBaseUpdate.next = capturedUpdate;
  }

  queue.lastBaseUpdate = capturedUpdate;
}

function getStateFromUpdate(workInProgress, queue, update, prevState, nextProps, instance) {
  switch (update.tag) {
    case ReplaceState:
      {
        const payload = update.payload;

        if (typeof payload === 'function') {

          const nextState = payload.call(instance, prevState, nextProps);

          return nextState;
        } // State object


        return payload;
      }

    case CaptureUpdate:
      {
        workInProgress.flags = workInProgress.flags & ~ShouldCapture | DidCapture;
      }
    // Intentional fallthrough

    case UpdateState:
      {
        const payload = update.payload;
        let partialState;

        if (typeof payload === 'function') {

          partialState = payload.call(instance, prevState, nextProps);
        } else {
          // Partial state object
          partialState = payload;
        }

        if (partialState === null || partialState === undefined) {
          // Null and undefined are treated as no-ops.
          return prevState;
        } // Merge the partial state and the previous state.


        return assign({}, prevState, partialState);
      }

    case ForceUpdate:
      {
        hasForceUpdate = true;
        return prevState;
      }
  }

  return prevState;
}

function processUpdateQueue(workInProgress, props, instance, renderLanes) {
  // This is always non-null on a ClassComponent or HostRoot
  const queue = workInProgress.updateQueue;
  hasForceUpdate = false;

  let firstBaseUpdate = queue.firstBaseUpdate;
  let lastBaseUpdate = queue.lastBaseUpdate; // Check if there are pending updates. If so, transfer them to the base queue.

  let pendingQueue = queue.shared.pending;

  if (pendingQueue !== null) {
    queue.shared.pending = null; // The pending queue is circular. Disconnect the pointer between first
    // and last so that it's non-circular.

    const lastPendingUpdate = pendingQueue;
    const firstPendingUpdate = lastPendingUpdate.next;
    lastPendingUpdate.next = null; // Append pending updates to base queue

    if (lastBaseUpdate === null) {
      firstBaseUpdate = firstPendingUpdate;
    } else {
      lastBaseUpdate.next = firstPendingUpdate;
    }

    lastBaseUpdate = lastPendingUpdate; // If there's a current queue, and it's different from the base queue, then
    // we need to transfer the updates to that queue, too. Because the base
    // queue is a singly-linked list with no cycles, we can append to both
    // lists and take advantage of structural sharing.
    // TODO: Pass `current` as argument

    const current = workInProgress.alternate;

    if (current !== null) {
      // This is always non-null on a ClassComponent or HostRoot
      const currentQueue = current.updateQueue;
      const currentLastBaseUpdate = currentQueue.lastBaseUpdate;

      if (currentLastBaseUpdate !== lastBaseUpdate) {
        if (currentLastBaseUpdate === null) {
          currentQueue.firstBaseUpdate = firstPendingUpdate;
        } else {
          currentLastBaseUpdate.next = firstPendingUpdate;
        }

        currentQueue.lastBaseUpdate = lastPendingUpdate;
      }
    }
  } // These values may change as we process the queue.


  if (firstBaseUpdate !== null) {
    // Iterate through the list of updates to compute the result.
    let newState = queue.baseState; // TODO: Don't need to accumulate this. Instead, we can remove renderLanes
    // from the original lanes.

    let newLanes = NoLanes;
    let newBaseState = null;
    let newFirstBaseUpdate = null;
    let newLastBaseUpdate = null;
    let update = firstBaseUpdate;

    do {
      // An extra OffscreenLane bit is added to updates that were made to
      // a hidden tree, so that we can distinguish them from updates that were
      // already there when the tree was hidden.
      const updateLane = removeLanes(update.lane, OffscreenLane);
      const isHiddenUpdate = updateLane !== update.lane; // Check if this update was made while the tree was hidden. If so, then
      // it's not a "base" update and we should disregard the extra base lanes
      // that were added to renderLanes when we entered the Offscreen tree.

      const shouldSkipUpdate = isHiddenUpdate ? !isSubsetOfLanes(getWorkInProgressRootRenderLanes(), updateLane) : !isSubsetOfLanes(renderLanes, updateLane);

      if (shouldSkipUpdate) {
        // Priority is insufficient. Skip this update. If this is the first
        // skipped update, the previous update/state is the new base
        // update/state.
        const clone = {
          lane: updateLane,
          tag: update.tag,
          payload: update.payload,
          callback: update.callback,
          next: null
        };

        if (newLastBaseUpdate === null) {
          newFirstBaseUpdate = newLastBaseUpdate = clone;
          newBaseState = newState;
        } else {
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        } // Update the remaining priority in the queue.


        newLanes = mergeLanes(newLanes, updateLane);
      } else {
        // This update does have sufficient priority.
        if (newLastBaseUpdate !== null) {
          const clone = {
            // This update is going to be committed so we never want uncommit
            // it. Using NoLane works because 0 is a subset of all bitmasks, so
            // this will never be skipped by the check above.
            lane: NoLane,
            tag: update.tag,
            payload: update.payload,
            // When this update is rebased, we should not fire its
            // callback again.
            callback: null,
            next: null
          };
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        } // Process this update.


        newState = getStateFromUpdate(workInProgress, queue, update, newState, props, instance);
        const callback = update.callback;

        if (callback !== null) {
          workInProgress.flags |= Callback;

          if (isHiddenUpdate) {
            workInProgress.flags |= Visibility;
          }

          const callbacks = queue.callbacks;

          if (callbacks === null) {
            queue.callbacks = [callback];
          } else {
            callbacks.push(callback);
          }
        }
      } // $FlowFixMe[incompatible-type] we bail out when we get a null


      update = update.next;

      if (update === null) {
        pendingQueue = queue.shared.pending;

        if (pendingQueue === null) {
          break;
        } else {
          // An update was scheduled from inside a reducer. Add the new
          // pending updates to the end of the list and keep processing.
          const lastPendingUpdate = pendingQueue; // Intentionally unsound. Pending updates form a circular list, but we
          // unravel them when transferring them to the base queue.

          const firstPendingUpdate = lastPendingUpdate.next;
          lastPendingUpdate.next = null;
          update = firstPendingUpdate;
          queue.lastBaseUpdate = lastPendingUpdate;
          queue.shared.pending = null;
        }
      }
    } while (true);

    if (newLastBaseUpdate === null) {
      newBaseState = newState;
    }

    queue.baseState = newBaseState;
    queue.firstBaseUpdate = newFirstBaseUpdate;
    queue.lastBaseUpdate = newLastBaseUpdate;

    if (firstBaseUpdate === null) {
      // `queue.lanes` is used for entangling transitions. We can set it back to
      // zero once the queue is empty.
      queue.shared.lanes = NoLanes;
    } // Set the remaining expiration time to be whatever is remaining in the queue.
    // This should be fine because the only two other things that contribute to
    // expiration time are props and context. We're already in the middle of the
    // begin phase by the time we start processing the queue, so we've already
    // dealt with the props. Context in components that specify
    // shouldComponentUpdate is tricky; but we'll have to account for
    // that regardless.


    markSkippedUpdateLanes(newLanes);
    workInProgress.lanes = newLanes;
    workInProgress.memoizedState = newState;
  }
}

function callCallback(callback, context) {
  if (typeof callback !== 'function') {
    throw Error(formatProdErrorMessage(191, callback));
  }

  callback.call(context);
}

function resetHasForceUpdateBeforeProcessing() {
  hasForceUpdate = false;
}
function checkHasForceUpdateAfterProcessing() {
  return hasForceUpdate;
}
function deferHiddenCallbacks(updateQueue) {
  // When an update finishes on a hidden component, its callback should not
  // be fired until/unless the component is made visible again. Stash the
  // callback on the shared queue object so it can be fired later.
  const newHiddenCallbacks = updateQueue.callbacks;

  if (newHiddenCallbacks !== null) {
    const existingHiddenCallbacks = updateQueue.shared.hiddenCallbacks;

    if (existingHiddenCallbacks === null) {
      updateQueue.shared.hiddenCallbacks = newHiddenCallbacks;
    } else {
      updateQueue.shared.hiddenCallbacks = existingHiddenCallbacks.concat(newHiddenCallbacks);
    }
  }
}
function commitHiddenCallbacks(updateQueue, context) {
  // This component is switching from hidden -> visible. Commit any callbacks
  // that were previously deferred.
  const hiddenCallbacks = updateQueue.shared.hiddenCallbacks;

  if (hiddenCallbacks !== null) {
    updateQueue.shared.hiddenCallbacks = null;

    for (let i = 0; i < hiddenCallbacks.length; i++) {
      const callback = hiddenCallbacks[i];
      callCallback(callback, context);
    }
  }
}
function commitCallbacks(updateQueue, context) {
  const callbacks = updateQueue.callbacks;

  if (callbacks !== null) {
    updateQueue.callbacks = null;

    for (let i = 0; i < callbacks.length; i++) {
      const callback = callbacks[i];
      callCallback(callback, context);
    }
  }
}

/**
 * Performs equality by iterating through keys on an object and returning false
 * when any key has values which are not strictly equal between the arguments.
 * Returns true when the values of all keys are strictly equal.
 */

function shallowEqual(objA, objB) {
  if (objectIs(objA, objB)) {
    return true;
  }

  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) {
    return false;
  } // Test for A's keys different from B.


  for (let i = 0; i < keysA.length; i++) {
    const currentKey = keysA[i];

    if (!hasOwnProperty.call(objB, currentKey) || // $FlowFixMe[incompatible-use] lost refinement of `objB`
    !objectIs(objA[currentKey], objB[currentKey])) {
      return false;
    }
  }

  return true;
}

// detect this is caught by userspace, we'll log a warning in development.

const SuspenseException = Error(formatProdErrorMessage(460));
const SuspenseyCommitException = Error(formatProdErrorMessage(474)); // This is a noop thenable that we use to trigger a fallback in throwException.
// TODO: It would be better to refactor throwException into multiple functions
// so we can trigger a fallback directly without having to check the type. But
// for now this will do.

const noopSuspenseyCommitThenable = {
  then() {
  }

};
function createThenableState() {
  // The ThenableState is created the first time a component suspends. If it
  // suspends again, we'll reuse the same state.
  return [];
}
function isThenableResolved(thenable) {
  const status = thenable.status;
  return status === 'fulfilled' || status === 'rejected';
}

function noop$2() {}

function trackUsedThenable(thenableState, thenable, index) {

  const previous = thenableState[index];

  if (previous === undefined) {
    thenableState.push(thenable);
  } else {
    if (previous !== thenable) {
      // Reuse the previous thenable, and drop the new one. We can assume
      // they represent the same value, because components are idempotent.
      // Avoid an unhandled rejection errors for the Promises that we'll
      // intentionally ignore.
      thenable.then(noop$2, noop$2);
      thenable = previous;
    }
  } // We use an expando to track the status and result of a thenable so that we
  // can synchronously unwrap the value. Think of this as an extension of the
  // Promise API, or a custom interface that is a superset of Thenable.
  //
  // If the thenable doesn't have a status, set it to "pending" and attach
  // a listener that will update its status and result when it resolves.


  switch (thenable.status) {
    case 'fulfilled':
      {
        const fulfilledValue = thenable.value;
        return fulfilledValue;
      }

    case 'rejected':
      {
        const rejectedError = thenable.reason;
        checkIfUseWrappedInAsyncCatch(rejectedError);
        throw rejectedError;
      }

    default:
      {
        if (typeof thenable.status === 'string') {
          // Only instrument the thenable if the status if not defined. If
          // it's defined, but an unknown value, assume it's been instrumented by
          // some custom userspace implementation. We treat it as "pending".
          // Attach a dummy listener, to ensure that any lazy initialization can
          // happen. Flight lazily parses JSON when the value is actually awaited.
          thenable.then(noop$2, noop$2);
        } else {
          // This is an uncached thenable that we haven't seen before.
          // Detect infinite ping loops caused by uncached promises.
          const root = getWorkInProgressRoot();

          if (root !== null && root.shellSuspendCounter > 100) {
            // This root has suspended repeatedly in the shell without making any
            // progress (i.e. committing something). This is highly suggestive of
            // an infinite ping loop, often caused by an accidental Async Client
            // Component.
            //
            // During a transition, we can suspend the work loop until the promise
            // to resolve, but this is a sync render, so that's not an option. We
            // also can't show a fallback, because none was provided. So our last
            // resort is to throw an error.
            //
            // TODO: Remove this error in a future release. Other ways of handling
            // this case include forcing a concurrent render, or putting the whole
            // root into offscreen mode.
            throw Error(formatProdErrorMessage(482));
          }

          const pendingThenable = thenable;
          pendingThenable.status = 'pending';
          pendingThenable.then(fulfilledValue => {
            if (thenable.status === 'pending') {
              const fulfilledThenable = thenable;
              fulfilledThenable.status = 'fulfilled';
              fulfilledThenable.value = fulfilledValue;
            }
          }, error => {
            if (thenable.status === 'pending') {
              const rejectedThenable = thenable;
              rejectedThenable.status = 'rejected';
              rejectedThenable.reason = error;
            }
          }); // Check one more time in case the thenable resolved synchronously.

          switch (thenable.status) {
            case 'fulfilled':
              {
                const fulfilledThenable = thenable;
                return fulfilledThenable.value;
              }

            case 'rejected':
              {
                const rejectedThenable = thenable;
                const rejectedError = rejectedThenable.reason;
                checkIfUseWrappedInAsyncCatch(rejectedError);
                throw rejectedError;
              }
          }
        } // Suspend.
        //
        // Throwing here is an implementation detail that allows us to unwind the
        // call stack. But we shouldn't allow it to leak into userspace. Throw an
        // opaque placeholder value instead of the actual thenable. If it doesn't
        // get captured by the work loop, log a warning, because that means
        // something in userspace must have caught it.


        suspendedThenable = thenable;

        throw SuspenseException;
      }
  }
}
function suspendCommit() {
  // This extra indirection only exists so it can handle passing
  // noopSuspenseyCommitThenable through to throwException.
  // TODO: Factor the thenable check out of throwException
  suspendedThenable = noopSuspenseyCommitThenable;
  throw SuspenseyCommitException;
} // This is used to track the actual thenable that suspended so it can be
// passed to the rest of the Suspense implementation — which, for historical
// reasons, expects to receive a thenable.

let suspendedThenable = null;
function getSuspendedThenable() {
  // This is called right after `use` suspends by throwing an exception. `use`
  // throws an opaque value instead of the thenable itself so that it can't be
  // caught in userspace. Then the work loop accesses the actual thenable using
  // this function.
  if (suspendedThenable === null) {
    throw Error(formatProdErrorMessage(459));
  }

  const thenable = suspendedThenable;
  suspendedThenable = null;

  return thenable;
}
function checkIfUseWrappedInAsyncCatch(rejectedReason) {
  // This check runs in prod, too, because it prevents a more confusing
  // downstream error, where SuspenseException is caught by a promise and
  // thrown asynchronously.
  // TODO: Another way to prevent SuspenseException from leaking into an async
  // execution context is to check the dispatcher every time `use` is called,
  // or some equivalent. That might be preferable for other reasons, too, since
  // it matches how we prevent similar mistakes for other hooks.
  if (rejectedReason === SuspenseException) {
    throw Error(formatProdErrorMessage(483));
  }
}

let thenableState$1 = null;
let thenableIndexCounter$1 = 0;

function unwrapThenable(thenable) {
  const index = thenableIndexCounter$1;
  thenableIndexCounter$1 += 1;

  if (thenableState$1 === null) {
    thenableState$1 = createThenableState();
  }

  return trackUsedThenable(thenableState$1, thenable, index);
}

function coerceRef(returnFiber, current, element) {
  const mixedRef = element.ref;

  if (mixedRef !== null && typeof mixedRef !== 'function' && typeof mixedRef !== 'object') {

    if (element._owner) {
      const owner = element._owner;
      let inst;

      if (owner) {
        const ownerFiber = owner;

        if (ownerFiber.tag !== ClassComponent) {
          throw Error(formatProdErrorMessage(309));
        }

        inst = ownerFiber.stateNode;
      }

      if (!inst) {
        throw Error(formatProdErrorMessage(147, mixedRef));
      } // Assigning this to a const so Flow knows it won't change in the closure


      const resolvedInst = inst;

      const stringRef = '' + mixedRef; // Check if previous string ref matches new string ref

      if (current !== null && current.ref !== null && typeof current.ref === 'function' && current.ref._stringRef === stringRef) {
        return current.ref;
      }

      const ref = function (value) {
        const refs = resolvedInst.refs;

        if (value === null) {
          delete refs[stringRef];
        } else {
          refs[stringRef] = value;
        }
      };

      ref._stringRef = stringRef;
      return ref;
    } else {
      if (typeof mixedRef !== 'string') {
        throw Error(formatProdErrorMessage(284));
      }

      if (!element._owner) {
        throw Error(formatProdErrorMessage(290, mixedRef));
      }
    }
  }

  return mixedRef;
}

function throwOnInvalidObjectType(returnFiber, newChild) {
  // $FlowFixMe[method-unbinding]
  const childString = Object.prototype.toString.call(newChild);
  throw Error(formatProdErrorMessage(31, childString === '[object Object]' ? 'object with keys {' + Object.keys(newChild).join(', ') + '}' : childString));
}

function resolveLazy(lazyType) {
  const payload = lazyType._payload;
  const init = lazyType._init;
  return init(payload);
} // This wrapper function exists because I expect to clone the code in each path
// to be able to optimize each path individually by branching early. This needs
// a compiler or we can do it manually. Helpers that don't need this branching
// live outside of this function.


function createChildReconciler(shouldTrackSideEffects) {
  function deleteChild(returnFiber, childToDelete) {
    if (!shouldTrackSideEffects) {
      // Noop.
      return;
    }

    const deletions = returnFiber.deletions;

    if (deletions === null) {
      returnFiber.deletions = [childToDelete];
      returnFiber.flags |= ChildDeletion;
    } else {
      deletions.push(childToDelete);
    }
  }

  function deleteRemainingChildren(returnFiber, currentFirstChild) {
    if (!shouldTrackSideEffects) {
      // Noop.
      return null;
    } // TODO: For the shouldClone case, this could be micro-optimized a bit by
    // assuming that after the first child we've already added everything.


    let childToDelete = currentFirstChild;

    while (childToDelete !== null) {
      deleteChild(returnFiber, childToDelete);
      childToDelete = childToDelete.sibling;
    }

    return null;
  }

  function mapRemainingChildren(returnFiber, currentFirstChild) {
    // Add the remaining children to a temporary map so that we can find them by
    // keys quickly. Implicit (null) keys get added to this set with their index
    // instead.
    const existingChildren = new Map();
    let existingChild = currentFirstChild;

    while (existingChild !== null) {
      if (existingChild.key !== null) {
        existingChildren.set(existingChild.key, existingChild);
      } else {
        existingChildren.set(existingChild.index, existingChild);
      }

      existingChild = existingChild.sibling;
    }

    return existingChildren;
  }

  function useFiber(fiber, pendingProps) {
    // We currently set sibling to null and index to 0 here because it is easy
    // to forget to do before returning it. E.g. for the single child case.
    const clone = createWorkInProgress(fiber, pendingProps);
    clone.index = 0;
    clone.sibling = null;
    return clone;
  }

  function placeChild(newFiber, lastPlacedIndex, newIndex) {
    newFiber.index = newIndex;

    if (!shouldTrackSideEffects) {
      // During hydration, the useId algorithm needs to know which fibers are
      // part of a list of children (arrays, iterators).
      newFiber.flags |= Forked;
      return lastPlacedIndex;
    }

    const current = newFiber.alternate;

    if (current !== null) {
      const oldIndex = current.index;

      if (oldIndex < lastPlacedIndex) {
        // This is a move.
        newFiber.flags |= Placement | PlacementDEV;
        return lastPlacedIndex;
      } else {
        // This item can stay in place.
        return oldIndex;
      }
    } else {
      // This is an insertion.
      newFiber.flags |= Placement | PlacementDEV;
      return lastPlacedIndex;
    }
  }

  function placeSingleChild(newFiber) {
    // This is simpler for the single child case. We only need to do a
    // placement for inserting new children.
    if (shouldTrackSideEffects && newFiber.alternate === null) {
      newFiber.flags |= Placement | PlacementDEV;
    }

    return newFiber;
  }

  function updateTextNode(returnFiber, current, textContent, lanes) {
    if (current === null || current.tag !== HostText) {
      // Insert
      const created = createFiberFromText(textContent, returnFiber.mode, lanes);
      created.return = returnFiber;
      return created;
    } else {
      // Update
      const existing = useFiber(current, textContent);
      existing.return = returnFiber;
      return existing;
    }
  }

  function updateElement(returnFiber, current, element, lanes) {
    const elementType = element.type;

    if (elementType === REACT_FRAGMENT_TYPE) {
      return updateFragment(returnFiber, current, element.props.children, lanes, element.key);
    }

    if (current !== null) {
      if (current.elementType === elementType || ( // Keep this check inline so it only runs on the false path:
      false) || // Lazy types should reconcile their resolved type.
      // We need to do this after the Hot Reloading check above,
      // because hot reloading has different semantics than prod because
      // it doesn't resuspend. So we can't let the call below suspend.
      typeof elementType === 'object' && elementType !== null && elementType.$$typeof === REACT_LAZY_TYPE && resolveLazy(elementType) === current.type) {
        // Move based on index
        const existing = useFiber(current, element.props);
        existing.ref = coerceRef(returnFiber, current, element);
        existing.return = returnFiber;

        return existing;
      }
    } // Insert


    const created = createFiberFromElement(element, returnFiber.mode, lanes);
    created.ref = coerceRef(returnFiber, current, element);
    created.return = returnFiber;
    return created;
  }

  function updatePortal(returnFiber, current, portal, lanes) {
    if (current === null || current.tag !== HostPortal || current.stateNode.containerInfo !== portal.containerInfo || current.stateNode.implementation !== portal.implementation) {
      // Insert
      const created = createFiberFromPortal(portal, returnFiber.mode, lanes);
      created.return = returnFiber;
      return created;
    } else {
      // Update
      const existing = useFiber(current, portal.children || []);
      existing.return = returnFiber;
      return existing;
    }
  }

  function updateFragment(returnFiber, current, fragment, lanes, key) {
    if (current === null || current.tag !== Fragment) {
      // Insert
      const created = createFiberFromFragment(fragment, returnFiber.mode, lanes, key);
      created.return = returnFiber;
      return created;
    } else {
      // Update
      const existing = useFiber(current, fragment);
      existing.return = returnFiber;
      return existing;
    }
  }

  function createChild(returnFiber, newChild, lanes) {
    if (typeof newChild === 'string' && newChild !== '' || typeof newChild === 'number') {
      // Text nodes don't have keys. If the previous node is implicitly keyed
      // we can continue to replace it without aborting even if it is not a text
      // node.
      const created = createFiberFromText('' + newChild, returnFiber.mode, lanes);
      created.return = returnFiber;
      return created;
    }

    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          {
            const created = createFiberFromElement(newChild, returnFiber.mode, lanes);
            created.ref = coerceRef(returnFiber, null, newChild);
            created.return = returnFiber;
            return created;
          }

        case REACT_PORTAL_TYPE:
          {
            const created = createFiberFromPortal(newChild, returnFiber.mode, lanes);
            created.return = returnFiber;
            return created;
          }

        case REACT_LAZY_TYPE:
          {
            const payload = newChild._payload;
            const init = newChild._init;
            return createChild(returnFiber, init(payload), lanes);
          }
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        const created = createFiberFromFragment(newChild, returnFiber.mode, lanes, null);
        created.return = returnFiber;
        return created;
      } // Usable node types
      //
      // Unwrap the inner value and recursively call this function again.


      if (typeof newChild.then === 'function') {
        const thenable = newChild;
        return createChild(returnFiber, unwrapThenable(thenable), lanes);
      }

      if (newChild.$$typeof === REACT_CONTEXT_TYPE || newChild.$$typeof === REACT_SERVER_CONTEXT_TYPE) {
        const context = newChild;
        return createChild(returnFiber, readContextDuringReconcilation(returnFiber, context, lanes), lanes);
      }

      throwOnInvalidObjectType(returnFiber, newChild);
    }

    return null;
  }

  function updateSlot(returnFiber, oldFiber, newChild, lanes) {
    // Update the fiber if the keys match, otherwise return null.
    const key = oldFiber !== null ? oldFiber.key : null;

    if (typeof newChild === 'string' && newChild !== '' || typeof newChild === 'number') {
      // Text nodes don't have keys. If the previous node is implicitly keyed
      // we can continue to replace it without aborting even if it is not a text
      // node.
      if (key !== null) {
        return null;
      }

      return updateTextNode(returnFiber, oldFiber, '' + newChild, lanes);
    }

    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          {
            if (newChild.key === key) {
              return updateElement(returnFiber, oldFiber, newChild, lanes);
            } else {
              return null;
            }
          }

        case REACT_PORTAL_TYPE:
          {
            if (newChild.key === key) {
              return updatePortal(returnFiber, oldFiber, newChild, lanes);
            } else {
              return null;
            }
          }

        case REACT_LAZY_TYPE:
          {
            const payload = newChild._payload;
            const init = newChild._init;
            return updateSlot(returnFiber, oldFiber, init(payload), lanes);
          }
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        if (key !== null) {
          return null;
        }

        return updateFragment(returnFiber, oldFiber, newChild, lanes, null);
      } // Usable node types
      //
      // Unwrap the inner value and recursively call this function again.


      if (typeof newChild.then === 'function') {
        const thenable = newChild;
        return updateSlot(returnFiber, oldFiber, unwrapThenable(thenable), lanes);
      }

      if (newChild.$$typeof === REACT_CONTEXT_TYPE || newChild.$$typeof === REACT_SERVER_CONTEXT_TYPE) {
        const context = newChild;
        return updateSlot(returnFiber, oldFiber, readContextDuringReconcilation(returnFiber, context, lanes), lanes);
      }

      throwOnInvalidObjectType(returnFiber, newChild);
    }

    return null;
  }

  function updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes) {
    if (typeof newChild === 'string' && newChild !== '' || typeof newChild === 'number') {
      // Text nodes don't have keys, so we neither have to check the old nor
      // new node for the key. If both are text nodes, they match.
      const matchedFiber = existingChildren.get(newIdx) || null;
      return updateTextNode(returnFiber, matchedFiber, '' + newChild, lanes);
    }

    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          {
            const matchedFiber = existingChildren.get(newChild.key === null ? newIdx : newChild.key) || null;
            return updateElement(returnFiber, matchedFiber, newChild, lanes);
          }

        case REACT_PORTAL_TYPE:
          {
            const matchedFiber = existingChildren.get(newChild.key === null ? newIdx : newChild.key) || null;
            return updatePortal(returnFiber, matchedFiber, newChild, lanes);
          }

        case REACT_LAZY_TYPE:
          const payload = newChild._payload;
          const init = newChild._init;
          return updateFromMap(existingChildren, returnFiber, newIdx, init(payload), lanes);
      }

      if (isArray(newChild) || getIteratorFn(newChild)) {
        const matchedFiber = existingChildren.get(newIdx) || null;
        return updateFragment(returnFiber, matchedFiber, newChild, lanes, null);
      } // Usable node types
      //
      // Unwrap the inner value and recursively call this function again.


      if (typeof newChild.then === 'function') {
        const thenable = newChild;
        return updateFromMap(existingChildren, returnFiber, newIdx, unwrapThenable(thenable), lanes);
      }

      if (newChild.$$typeof === REACT_CONTEXT_TYPE || newChild.$$typeof === REACT_SERVER_CONTEXT_TYPE) {
        const context = newChild;
        return updateFromMap(existingChildren, returnFiber, newIdx, readContextDuringReconcilation(returnFiber, context, lanes), lanes);
      }

      throwOnInvalidObjectType(returnFiber, newChild);
    }

    return null;
  }

  function reconcileChildrenArray(returnFiber, currentFirstChild, newChildren, lanes) {

    let resultingFirstChild = null;
    let previousNewFiber = null;
    let oldFiber = currentFirstChild;
    let lastPlacedIndex = 0;
    let newIdx = 0;
    let nextOldFiber = null;

    for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
      if (oldFiber.index > newIdx) {
        nextOldFiber = oldFiber;
        oldFiber = null;
      } else {
        nextOldFiber = oldFiber.sibling;
      }

      const newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx], lanes);

      if (newFiber === null) {
        // TODO: This breaks on empty slots like null children. That's
        // unfortunate because it triggers the slow path all the time. We need
        // a better way to communicate whether this was a miss or null,
        // boolean, undefined, etc.
        if (oldFiber === null) {
          oldFiber = nextOldFiber;
        }

        break;
      }

      if (shouldTrackSideEffects) {
        if (oldFiber && newFiber.alternate === null) {
          // We matched the slot, but we didn't reuse the existing fiber, so we
          // need to delete the existing child.
          deleteChild(returnFiber, oldFiber);
        }
      }

      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);

      if (previousNewFiber === null) {
        // TODO: Move out of the loop. This only happens for the first run.
        resultingFirstChild = newFiber;
      } else {
        // TODO: Defer siblings if we're not at the right index for this slot.
        // I.e. if we had null values before, then we want to defer this
        // for each null value. However, we also don't want to call updateSlot
        // with the previous one.
        previousNewFiber.sibling = newFiber;
      }

      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }

    if (newIdx === newChildren.length) {
      // We've reached the end of the new children. We can delete the rest.
      deleteRemainingChildren(returnFiber, oldFiber);

      if (getIsHydrating()) {
        const numberOfForks = newIdx;
        pushTreeFork(returnFiber, numberOfForks);
      }

      return resultingFirstChild;
    }

    if (oldFiber === null) {
      // If we don't have any more existing children we can choose a fast path
      // since the rest will all be insertions.
      for (; newIdx < newChildren.length; newIdx++) {
        const newFiber = createChild(returnFiber, newChildren[newIdx], lanes);

        if (newFiber === null) {
          continue;
        }

        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);

        if (previousNewFiber === null) {
          // TODO: Move out of the loop. This only happens for the first run.
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }

        previousNewFiber = newFiber;
      }

      if (getIsHydrating()) {
        const numberOfForks = newIdx;
        pushTreeFork(returnFiber, numberOfForks);
      }

      return resultingFirstChild;
    } // Add all children to a key map for quick lookups.


    const existingChildren = mapRemainingChildren(returnFiber, oldFiber); // Keep scanning and use the map to restore deleted items as moves.

    for (; newIdx < newChildren.length; newIdx++) {
      const newFiber = updateFromMap(existingChildren, returnFiber, newIdx, newChildren[newIdx], lanes);

      if (newFiber !== null) {
        if (shouldTrackSideEffects) {
          if (newFiber.alternate !== null) {
            // The new fiber is a work in progress, but if there exists a
            // current, that means that we reused the fiber. We need to delete
            // it from the child list so that we don't add it to the deletion
            // list.
            existingChildren.delete(newFiber.key === null ? newIdx : newFiber.key);
          }
        }

        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);

        if (previousNewFiber === null) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }

        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffects) {
      // Any existing children that weren't consumed above were deleted. We need
      // to add them to the deletion list.
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }

    if (getIsHydrating()) {
      const numberOfForks = newIdx;
      pushTreeFork(returnFiber, numberOfForks);
    }

    return resultingFirstChild;
  }

  function reconcileChildrenIterator(returnFiber, currentFirstChild, newChildrenIterable, lanes) {
    // This is the same implementation as reconcileChildrenArray(),
    // but using the iterator instead.
    const iteratorFn = getIteratorFn(newChildrenIterable);

    if (typeof iteratorFn !== 'function') {
      throw Error(formatProdErrorMessage(150));
    }

    const newChildren = iteratorFn.call(newChildrenIterable);

    if (newChildren == null) {
      throw Error(formatProdErrorMessage(151));
    }

    let resultingFirstChild = null;
    let previousNewFiber = null;
    let oldFiber = currentFirstChild;
    let lastPlacedIndex = 0;
    let newIdx = 0;
    let nextOldFiber = null;
    let step = newChildren.next();

    for (; oldFiber !== null && !step.done; newIdx++, step = newChildren.next()) {
      if (oldFiber.index > newIdx) {
        nextOldFiber = oldFiber;
        oldFiber = null;
      } else {
        nextOldFiber = oldFiber.sibling;
      }

      const newFiber = updateSlot(returnFiber, oldFiber, step.value, lanes);

      if (newFiber === null) {
        // TODO: This breaks on empty slots like null children. That's
        // unfortunate because it triggers the slow path all the time. We need
        // a better way to communicate whether this was a miss or null,
        // boolean, undefined, etc.
        if (oldFiber === null) {
          oldFiber = nextOldFiber;
        }

        break;
      }

      if (shouldTrackSideEffects) {
        if (oldFiber && newFiber.alternate === null) {
          // We matched the slot, but we didn't reuse the existing fiber, so we
          // need to delete the existing child.
          deleteChild(returnFiber, oldFiber);
        }
      }

      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);

      if (previousNewFiber === null) {
        // TODO: Move out of the loop. This only happens for the first run.
        resultingFirstChild = newFiber;
      } else {
        // TODO: Defer siblings if we're not at the right index for this slot.
        // I.e. if we had null values before, then we want to defer this
        // for each null value. However, we also don't want to call updateSlot
        // with the previous one.
        previousNewFiber.sibling = newFiber;
      }

      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }

    if (step.done) {
      // We've reached the end of the new children. We can delete the rest.
      deleteRemainingChildren(returnFiber, oldFiber);

      if (getIsHydrating()) {
        const numberOfForks = newIdx;
        pushTreeFork(returnFiber, numberOfForks);
      }

      return resultingFirstChild;
    }

    if (oldFiber === null) {
      // If we don't have any more existing children we can choose a fast path
      // since the rest will all be insertions.
      for (; !step.done; newIdx++, step = newChildren.next()) {
        const newFiber = createChild(returnFiber, step.value, lanes);

        if (newFiber === null) {
          continue;
        }

        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);

        if (previousNewFiber === null) {
          // TODO: Move out of the loop. This only happens for the first run.
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }

        previousNewFiber = newFiber;
      }

      if (getIsHydrating()) {
        const numberOfForks = newIdx;
        pushTreeFork(returnFiber, numberOfForks);
      }

      return resultingFirstChild;
    } // Add all children to a key map for quick lookups.


    const existingChildren = mapRemainingChildren(returnFiber, oldFiber); // Keep scanning and use the map to restore deleted items as moves.

    for (; !step.done; newIdx++, step = newChildren.next()) {
      const newFiber = updateFromMap(existingChildren, returnFiber, newIdx, step.value, lanes);

      if (newFiber !== null) {
        if (shouldTrackSideEffects) {
          if (newFiber.alternate !== null) {
            // The new fiber is a work in progress, but if there exists a
            // current, that means that we reused the fiber. We need to delete
            // it from the child list so that we don't add it to the deletion
            // list.
            existingChildren.delete(newFiber.key === null ? newIdx : newFiber.key);
          }
        }

        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);

        if (previousNewFiber === null) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }

        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffects) {
      // Any existing children that weren't consumed above were deleted. We need
      // to add them to the deletion list.
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }

    if (getIsHydrating()) {
      const numberOfForks = newIdx;
      pushTreeFork(returnFiber, numberOfForks);
    }

    return resultingFirstChild;
  }

  function reconcileSingleTextNode(returnFiber, currentFirstChild, textContent, lanes) {
    // There's no need to check for keys on text nodes since we don't have a
    // way to define them.
    if (currentFirstChild !== null && currentFirstChild.tag === HostText) {
      // We already have an existing node so let's just update it and delete
      // the rest.
      deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
      const existing = useFiber(currentFirstChild, textContent);
      existing.return = returnFiber;
      return existing;
    } // The existing first child is not a text node so we need to create one
    // and delete the existing ones.


    deleteRemainingChildren(returnFiber, currentFirstChild);
    const created = createFiberFromText(textContent, returnFiber.mode, lanes);
    created.return = returnFiber;
    return created;
  }

  function reconcileSingleElement(returnFiber, currentFirstChild, element, lanes) {
    const key = element.key;
    let child = currentFirstChild;

    while (child !== null) {
      // TODO: If key === null and child.key === null, then this only applies to
      // the first item in the list.
      if (child.key === key) {
        const elementType = element.type;

        if (elementType === REACT_FRAGMENT_TYPE) {
          if (child.tag === Fragment) {
            deleteRemainingChildren(returnFiber, child.sibling);
            const existing = useFiber(child, element.props.children);
            existing.return = returnFiber;

            return existing;
          }
        } else {
          if (child.elementType === elementType || ( // Keep this check inline so it only runs on the false path:
          false) || // Lazy types should reconcile their resolved type.
          // We need to do this after the Hot Reloading check above,
          // because hot reloading has different semantics than prod because
          // it doesn't resuspend. So we can't let the call below suspend.
          typeof elementType === 'object' && elementType !== null && elementType.$$typeof === REACT_LAZY_TYPE && resolveLazy(elementType) === child.type) {
            deleteRemainingChildren(returnFiber, child.sibling);
            const existing = useFiber(child, element.props);
            existing.ref = coerceRef(returnFiber, child, element);
            existing.return = returnFiber;

            return existing;
          }
        } // Didn't match.


        deleteRemainingChildren(returnFiber, child);
        break;
      } else {
        deleteChild(returnFiber, child);
      }

      child = child.sibling;
    }

    if (element.type === REACT_FRAGMENT_TYPE) {
      const created = createFiberFromFragment(element.props.children, returnFiber.mode, lanes, element.key);
      created.return = returnFiber;
      return created;
    } else {
      const created = createFiberFromElement(element, returnFiber.mode, lanes);
      created.ref = coerceRef(returnFiber, currentFirstChild, element);
      created.return = returnFiber;
      return created;
    }
  }

  function reconcileSinglePortal(returnFiber, currentFirstChild, portal, lanes) {
    const key = portal.key;
    let child = currentFirstChild;

    while (child !== null) {
      // TODO: If key === null and child.key === null, then this only applies to
      // the first item in the list.
      if (child.key === key) {
        if (child.tag === HostPortal && child.stateNode.containerInfo === portal.containerInfo && child.stateNode.implementation === portal.implementation) {
          deleteRemainingChildren(returnFiber, child.sibling);
          const existing = useFiber(child, portal.children || []);
          existing.return = returnFiber;
          return existing;
        } else {
          deleteRemainingChildren(returnFiber, child);
          break;
        }
      } else {
        deleteChild(returnFiber, child);
      }

      child = child.sibling;
    }

    const created = createFiberFromPortal(portal, returnFiber.mode, lanes);
    created.return = returnFiber;
    return created;
  } // This API will tag the children with the side-effect of the reconciliation
  // itself. They will be added to the side-effect list as we pass through the
  // children and the parent.


  function reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes) {
    // This function is not recursive.
    // If the top level item is an array, we treat it as a set of children,
    // not as a fragment. Nested arrays on the other hand will be treated as
    // fragment nodes. Recursion happens at the normal flow.
    // Handle top level unkeyed fragments as if they were arrays.
    // This leads to an ambiguity between <>{[...]}</> and <>...</>.
    // We treat the ambiguous cases above the same.
    // TODO: Let's use recursion like we do for Usable nodes?
    const isUnkeyedTopLevelFragment = typeof newChild === 'object' && newChild !== null && newChild.type === REACT_FRAGMENT_TYPE && newChild.key === null;

    if (isUnkeyedTopLevelFragment) {
      newChild = newChild.props.children;
    } // Handle object types


    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return placeSingleChild(reconcileSingleElement(returnFiber, currentFirstChild, newChild, lanes));

        case REACT_PORTAL_TYPE:
          return placeSingleChild(reconcileSinglePortal(returnFiber, currentFirstChild, newChild, lanes));

        case REACT_LAZY_TYPE:
          const payload = newChild._payload;
          const init = newChild._init; // TODO: This function is supposed to be non-recursive.

          return reconcileChildFibers(returnFiber, currentFirstChild, init(payload), lanes);
      }

      if (isArray(newChild)) {
        return reconcileChildrenArray(returnFiber, currentFirstChild, newChild, lanes);
      }

      if (getIteratorFn(newChild)) {
        return reconcileChildrenIterator(returnFiber, currentFirstChild, newChild, lanes);
      } // Usables are a valid React node type. When React encounters a Usable in
      // a child position, it unwraps it using the same algorithm as `use`. For
      // example, for promises, React will throw an exception to unwind the
      // stack, then replay the component once the promise resolves.
      //
      // A difference from `use` is that React will keep unwrapping the value
      // until it reaches a non-Usable type.
      //
      // e.g. Usable<Usable<Usable<T>>> should resolve to T
      //
      // The structure is a bit unfortunate. Ideally, we shouldn't need to
      // replay the entire begin phase of the parent fiber in order to reconcile
      // the children again. This would require a somewhat significant refactor,
      // because reconcilation happens deep within the begin phase, and
      // depending on the type of work, not always at the end. We should
      // consider as an future improvement.


      if (typeof newChild.then === 'function') {
        const thenable = newChild;
        return reconcileChildFibersImpl(returnFiber, currentFirstChild, unwrapThenable(thenable), lanes);
      }

      if (newChild.$$typeof === REACT_CONTEXT_TYPE || newChild.$$typeof === REACT_SERVER_CONTEXT_TYPE) {
        const context = newChild;
        return reconcileChildFibersImpl(returnFiber, currentFirstChild, readContextDuringReconcilation(returnFiber, context, lanes), lanes);
      }

      throwOnInvalidObjectType(returnFiber, newChild);
    }

    if (typeof newChild === 'string' && newChild !== '' || typeof newChild === 'number') {
      return placeSingleChild(reconcileSingleTextNode(returnFiber, currentFirstChild, '' + newChild, lanes));
    }


    return deleteRemainingChildren(returnFiber, currentFirstChild);
  }

  function reconcileChildFibers(returnFiber, currentFirstChild, newChild, lanes) {
    // This indirection only exists so we can reset `thenableState` at the end.
    // It should get inlined by Closure.
    thenableIndexCounter$1 = 0;
    const firstChildFiber = reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes);
    thenableState$1 = null; // Don't bother to reset `thenableIndexCounter` to 0 because it always gets
    // set at the beginning.

    return firstChildFiber;
  }

  return reconcileChildFibers;
}

const reconcileChildFibers = createChildReconciler(true);
const mountChildFibers = createChildReconciler(false);
function resetChildReconcilerOnUnwind() {
  // On unwind, clear any pending thenables that were used.
  thenableState$1 = null;
  thenableIndexCounter$1 = 0;
}
function cloneChildFibers(current, workInProgress) {
  if (current !== null && workInProgress.child !== current.child) {
    throw Error(formatProdErrorMessage(153));
  }

  if (workInProgress.child === null) {
    return;
  }

  let currentChild = workInProgress.child;
  let newChild = createWorkInProgress(currentChild, currentChild.pendingProps);
  workInProgress.child = newChild;
  newChild.return = workInProgress;

  while (currentChild.sibling !== null) {
    currentChild = currentChild.sibling;
    newChild = newChild.sibling = createWorkInProgress(currentChild, currentChild.pendingProps);
    newChild.return = workInProgress;
  }

  newChild.sibling = null;
} // Reset a workInProgress child set to prepare it for a second pass.

function resetChildFibers(workInProgress, lanes) {
  let child = workInProgress.child;

  while (child !== null) {
    resetWorkInProgress(child, lanes);
    child = child.sibling;
  }
}

// TODO: This isn't being used yet, but it's intended to replace the
// InvisibleParentContext that is currently managed by SuspenseContext.

const currentTreeHiddenStackCursor = createCursor(null);
const prevEntangledRenderLanesCursor = createCursor(NoLanes);
function pushHiddenContext(fiber, context) {
  const prevEntangledRenderLanes = getEntangledRenderLanes();
  push(prevEntangledRenderLanesCursor, prevEntangledRenderLanes);
  push(currentTreeHiddenStackCursor, context); // When rendering a subtree that's currently hidden, we must include all
  // lanes that would have rendered if the hidden subtree hadn't been deferred.
  // That is, in order to reveal content from hidden -> visible, we must commit
  // all the updates that we skipped when we originally hid the tree.

  setEntangledRenderLanes(mergeLanes(prevEntangledRenderLanes, context.baseLanes));
}
function reuseHiddenContextOnStack(fiber) {
  // This subtree is not currently hidden, so we don't need to add any lanes
  // to the render lanes. But we still need to push something to avoid a
  // context mismatch. Reuse the existing context on the stack.
  push(prevEntangledRenderLanesCursor, getEntangledRenderLanes());
  push(currentTreeHiddenStackCursor, currentTreeHiddenStackCursor.current);
}
function popHiddenContext(fiber) {
  // Restore the previous render lanes from the stack
  setEntangledRenderLanes(prevEntangledRenderLanesCursor.current);
  pop(currentTreeHiddenStackCursor);
  pop(prevEntangledRenderLanesCursor);
}
function isCurrentTreeHidden() {
  return currentTreeHiddenStackCursor.current !== null;
}

// suspends, i.e. it's the nearest `catch` block on the stack.

const suspenseHandlerStackCursor = createCursor(null); // Represents the outermost boundary that is not visible in the current tree.
// Everything above this is the "shell". When this is null, it means we're
// rendering in the shell of the app. If it's non-null, it means we're rendering
// deeper than the shell, inside a new tree that wasn't already visible.
//
// The main way we use this concept is to determine whether showing a fallback
// would result in a desirable or undesirable loading state. Activing a fallback
// in the shell is considered an undersirable loading state, because it would
// mean hiding visible (albeit stale) content in the current tree — we prefer to
// show the stale content, rather than switch to a fallback. But showing a
// fallback in a new tree is fine, because there's no stale content to
// prefer instead.

let shellBoundary = null;
function getShellBoundary() {
  return shellBoundary;
}
function pushPrimaryTreeSuspenseHandler(handler) {
  // TODO: Pass as argument
  const current = handler.alternate;
  // propagated a single level. For example, when ForceSuspenseFallback is set,
  // it should only force the nearest Suspense boundary into fallback mode.

  pushSuspenseListContext(handler, setDefaultShallowSuspenseListContext(suspenseStackCursor.current)); // Experimental feature: Some Suspense boundaries are marked as having an
  // to push a nested Suspense handler, because it will get replaced by the
  // outer fallback, anyway. Consider this as a future optimization.


  push(suspenseHandlerStackCursor, handler);

  if (shellBoundary === null) {
    if (current === null || isCurrentTreeHidden()) {
      // This boundary is not visible in the current UI.
      shellBoundary = handler;
    } else {
      const prevState = current.memoizedState;

      if (prevState !== null) {
        // This boundary is showing a fallback in the current UI.
        shellBoundary = handler;
      }
    }
  }
}
function pushFallbackTreeSuspenseHandler(fiber) {
  // We're about to render the fallback. If something in the fallback suspends,
  // it's akin to throwing inside of a `catch` block. This boundary should not
  // capture. Reuse the existing handler on the stack.
  reuseSuspenseHandlerOnStack(fiber);
}
function pushOffscreenSuspenseHandler(fiber) {
  if (fiber.tag === OffscreenComponent) {
    // A SuspenseList context is only pushed here to avoid a push/pop mismatch.
    // Reuse the current value on the stack.
    // TODO: We can avoid needing to push here by by forking popSuspenseHandler
    // into separate functions for Suspense and Offscreen.
    pushSuspenseListContext(fiber, suspenseStackCursor.current);
    push(suspenseHandlerStackCursor, fiber);

    if (shellBoundary !== null) ; else {
      const current = fiber.alternate;

      if (current !== null) {
        const prevState = current.memoizedState;

        if (prevState !== null) {
          // This is the first boundary in the stack that's already showing
          // a fallback. So everything outside is considered the shell.
          shellBoundary = fiber;
        }
      }
    }
  } else {
    // This is a LegacyHidden component.
    reuseSuspenseHandlerOnStack(fiber);
  }
}
function reuseSuspenseHandlerOnStack(fiber) {
  pushSuspenseListContext(fiber, suspenseStackCursor.current);
  push(suspenseHandlerStackCursor, getSuspenseHandler());
}
function getSuspenseHandler() {
  return suspenseHandlerStackCursor.current;
}
function popSuspenseHandler(fiber) {
  pop(suspenseHandlerStackCursor);

  if (shellBoundary === fiber) {
    // Popping back into the shell.
    shellBoundary = null;
  }

  popSuspenseListContext();
} // SuspenseList context
// TODO: Move to a separate module? We may change the SuspenseList
// implementation to hide/show in the commit phase, anyway.

const DefaultSuspenseContext = 0b00;
const SubtreeSuspenseContextMask = 0b01; // ForceSuspenseFallback can be used by SuspenseList to force newly added
// items into their fallback state during one of the render passes.

const ForceSuspenseFallback = 0b10;
const suspenseStackCursor = createCursor(DefaultSuspenseContext);
function hasSuspenseListContext(parentContext, flag) {
  return (parentContext & flag) !== 0;
}
function setDefaultShallowSuspenseListContext(parentContext) {
  return parentContext & SubtreeSuspenseContextMask;
}
function setShallowSuspenseListContext(parentContext, shallowContext) {
  return parentContext & SubtreeSuspenseContextMask | shallowContext;
}
function pushSuspenseListContext(fiber, newContext) {
  push(suspenseStackCursor, newContext);
}
function popSuspenseListContext(fiber) {
  pop(suspenseStackCursor);
}

// A non-null SuspenseState means that it is blocked for one reason or another.
// - A non-null dehydrated field means it's blocked pending hydration.
//   - A non-null dehydrated field can use isSuspenseInstancePending or
//     isSuspenseInstanceFallback to query the reason for being dehydrated.
// - A null dehydrated field means it's blocked by something suspending and
//   we're currently showing a fallback instead.

function findFirstSuspended(row) {
  let node = row;

  while (node !== null) {
    if (node.tag === SuspenseComponent) {
      const state = node.memoizedState;

      if (state !== null) {
        const dehydrated = state.dehydrated;

        if (dehydrated === null || isSuspenseInstancePending(dehydrated) || isSuspenseInstanceFallback(dehydrated)) {
          return node;
        }
      }
    } else if (node.tag === SuspenseListComponent && // revealOrder undefined can't be trusted because it don't
    // keep track of whether it suspended or not.
    node.memoizedProps.revealOrder !== undefined) {
      const didSuspend = (node.flags & DidCapture) !== NoFlags$1;

      if (didSuspend) {
        return node;
      }
    } else if (node.child !== null) {
      node.child.return = node;
      node = node.child;
      continue;
    }

    if (node === row) {
      return null;
    }

    while (node.sibling === null) {
      if (node.return === null || node.return === row) {
        return null;
      }

      node = node.return;
    }

    node.sibling.return = node.return;
    node = node.sibling;
  }

  return null;
}

const NoFlags =
/*   */
0b0000; // Represents whether effect should fire.

const HasEffect =
/* */
0b0001; // Represents the phase in which the effect (not the clean-up) fires.

const Insertion =
/* */
0b0010;
const Layout =
/*    */
0b0100;
const Passive =
/*   */
0b1000;

// there's only a single root, but we do support multi root apps, hence this
// extra complexity. But this module is optimized for the single root case.

let firstScheduledRoot = null;
let lastScheduledRoot = null; // Used to prevent redundant mircotasks from being scheduled.

let didScheduleMicrotask = false; // `act` "microtasks" are scheduled on the `act` queue instead of an actual

let mightHavePendingSyncWork = false;
let isFlushingWork = false;
let currentEventTransitionLane = NoLane;
function ensureRootIsScheduled(root) {
  // This function is called whenever a root receives an update. It does two
  // things 1) it ensures the root is in the root schedule, and 2) it ensures
  // there's a pending microtask to process the root schedule.
  //
  // Most of the actual scheduling logic does not happen until
  // `scheduleTaskForRootDuringMicrotask` runs.
  // Add the root to the schedule
  if (root === lastScheduledRoot || root.next !== null) ; else {
    if (lastScheduledRoot === null) {
      firstScheduledRoot = lastScheduledRoot = root;
    } else {
      lastScheduledRoot.next = root;
      lastScheduledRoot = root;
    }
  } // Any time a root received an update, we set this to true until the next time
  // we process the schedule. If it's false, then we can quickly exit flushSync
  // without consulting the schedule.


  mightHavePendingSyncWork = true; // At the end of the current event, go through each of the roots and ensure
  // there's a task scheduled for each one at the correct priority.

  {
    if (!didScheduleMicrotask) {
      didScheduleMicrotask = true;
      scheduleImmediateTask(processRootScheduleInMicrotask);
    }
  }
}
function flushSyncWorkOnAllRoots() {
  // This is allowed to be called synchronously, but the caller should check
  // the execution context first.
  flushSyncWorkAcrossRoots_impl(false);
}
function flushSyncWorkOnLegacyRootsOnly() {
  // This is allowed to be called synchronously, but the caller should check
  // the execution context first.
  flushSyncWorkAcrossRoots_impl(true);
}

function flushSyncWorkAcrossRoots_impl(onlyLegacy) {
  if (isFlushingWork) {
    // Prevent reentrancy.
    // TODO: Is this overly defensive? The callers must check the execution
    // context first regardless.
    return;
  }

  if (!mightHavePendingSyncWork) {
    // Fast path. There's no sync work to do.
    return;
  } // There may or may not be synchronous work scheduled. Let's check.


  let didPerformSomeWork;
  let errors = null;
  isFlushingWork = true;

  do {
    didPerformSomeWork = false;
    let root = firstScheduledRoot;

    while (root !== null) {
      if (onlyLegacy && root.tag !== LegacyRoot) ; else {
        const workInProgressRoot = getWorkInProgressRoot();
        const workInProgressRootRenderLanes = getWorkInProgressRootRenderLanes();
        const nextLanes = getNextLanes(root, root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes);

        if (includesSyncLane(nextLanes)) {
          // This root has pending sync work. Flush it now.
          try {
            didPerformSomeWork = true;
            performSyncWorkOnRoot(root, nextLanes);
          } catch (error) {
            // Collect errors so we can rethrow them at the end
            if (errors === null) {
              errors = [error];
            } else {
              errors.push(error);
            }
          }
        }
      }

      root = root.next;
    }
  } while (didPerformSomeWork);

  isFlushingWork = false; // If any errors were thrown, rethrow them right before exiting.
  // TODO: Consider returning these to the caller, to allow them to decide
  // how/when to rethrow.

  if (errors !== null) {
    if (errors.length > 1) {
      if (typeof AggregateError === 'function') {
        // eslint-disable-next-line no-undef
        throw new AggregateError(errors);
      } else {
        for (let i = 1; i < errors.length; i++) {
          scheduleImmediateTask(throwError.bind(null, errors[i]));
        }

        const firstError = errors[0];
        throw firstError;
      }
    } else {
      const error = errors[0];
      throw error;
    }
  }
}

function throwError(error) {
  throw error;
}

function processRootScheduleInMicrotask() {
  // This function is always called inside a microtask. It should never be
  // called synchronously.
  didScheduleMicrotask = false;


  mightHavePendingSyncWork = false;
  const currentTime = now$1();
  let prev = null;
  let root = firstScheduledRoot;

  while (root !== null) {
    const next = root.next;

    if (currentEventTransitionLane !== NoLane && shouldAttemptEagerTransition()) {
      // A transition was scheduled during an event, but we're going to try to
      // render it synchronously anyway. We do this during a popstate event to
      // preserve the scroll position of the previous page.
      upgradePendingLaneToSync(root, currentEventTransitionLane);
    }

    const nextLanes = scheduleTaskForRootDuringMicrotask(root, currentTime);

    if (nextLanes === NoLane) {
      // This root has no more pending work. Remove it from the schedule. To
      // guard against subtle reentrancy bugs, this microtask is the only place
      // we do this — you can add roots to the schedule whenever, but you can
      // only remove them here.
      // Null this out so we know it's been removed from the schedule.
      root.next = null;

      if (prev === null) {
        // This is the new head of the list
        firstScheduledRoot = next;
      } else {
        prev.next = next;
      }

      if (next === null) {
        // This is the new tail of the list
        lastScheduledRoot = prev;
      }
    } else {
      // This root still has work. Keep it in the list.
      prev = root;

      if (includesSyncLane(nextLanes)) {
        mightHavePendingSyncWork = true;
      }
    }

    root = next;
  }

  currentEventTransitionLane = NoLane; // At the end of the microtask, flush any pending synchronous work. This has
  // to come at the end, because it does actual rendering work that might throw.

  flushSyncWorkOnAllRoots();
}

function scheduleTaskForRootDuringMicrotask(root, currentTime) {
  // This function is always called inside a microtask, or at the very end of a
  // rendering task right before we yield to the main thread. It should never be
  // called synchronously.
  //
  // TODO: Unless enableDeferRootSchedulingToMicrotask is off. We need to land
  // that ASAP to unblock additional features we have planned.
  //
  // This function also never performs React work synchronously; it should
  // only schedule work to be performed later, in a separate task or microtask.
  // Check if any lanes are being starved by other work. If so, mark them as
  // expired so we know to work on those next.
  markStarvedLanesAsExpired(root, currentTime); // Determine the next lanes to work on, and their priority.

  const workInProgressRoot = getWorkInProgressRoot();
  const workInProgressRootRenderLanes = getWorkInProgressRootRenderLanes();
  const nextLanes = getNextLanes(root, root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes);
  const existingCallbackNode = root.callbackNode;

  if ( // Check if there's nothing to work on
  nextLanes === NoLanes || // If this root is currently suspended and waiting for data to resolve, don't
  // schedule a task to render it. We'll either wait for a ping, or wait to
  // receive an update.
  //
  // Suspended render phase
  root === workInProgressRoot && isWorkLoopSuspendedOnData() || // Suspended commit phase
  root.cancelPendingCommit !== null) {
    // Fast path: There's nothing to work on.
    if (existingCallbackNode !== null) {
      cancelCallback(existingCallbackNode);
    }

    root.callbackNode = null;
    root.callbackPriority = NoLane;
    return NoLane;
  } // Schedule a new callback in the host environment.


  if (includesSyncLane(nextLanes)) {
    // Synchronous work is always flushed at the end of the microtask, so we
    // don't need to schedule an additional task.
    if (existingCallbackNode !== null) {
      cancelCallback(existingCallbackNode);
    }

    root.callbackPriority = SyncLane;
    root.callbackNode = null;
    return SyncLane;
  } else {
    // We use the highest priority lane to represent the priority of the callback.
    const existingCallbackPriority = root.callbackPriority;
    const newCallbackPriority = getHighestPriorityLane(nextLanes);

    if (newCallbackPriority === existingCallbackPriority && // Special case related to `act`. If the currently scheduled task is a
    // Scheduler task, rather than an `act` task, cancel it and re-schedule
    // on the `act` queue.
    !(false  )) {
      // The priority hasn't changed. We can reuse the existing task.
      return newCallbackPriority;
    } else {
      // Cancel the existing callback. We'll schedule a new one below.
      cancelCallback(existingCallbackNode);
    }

    let schedulerPriorityLevel;

    switch (lanesToEventPriority(nextLanes)) {
      case DiscreteEventPriority:
        schedulerPriorityLevel = ImmediatePriority;
        break;

      case ContinuousEventPriority:
        schedulerPriorityLevel = UserBlockingPriority;
        break;

      case DefaultEventPriority:
        schedulerPriorityLevel = NormalPriority$1;
        break;

      case IdleEventPriority:
        schedulerPriorityLevel = IdlePriority;
        break;

      default:
        schedulerPriorityLevel = NormalPriority$1;
        break;
    }

    const newCallbackNode = scheduleCallback$2(schedulerPriorityLevel, performConcurrentWorkOnRoot.bind(null, root));
    root.callbackPriority = newCallbackPriority;
    root.callbackNode = newCallbackNode;
    return newCallbackPriority;
  }
}

function getContinuationForRoot(root, originalCallbackNode) {
  // This is called at the end of `performConcurrentWorkOnRoot` to determine
  // if we need to schedule a continuation task.
  //
  // Usually `scheduleTaskForRootDuringMicrotask` only runs inside a microtask;
  // however, since most of the logic for determining if we need a continuation
  // versus a new task is the same, we cheat a bit and call it here. This is
  // only safe to do because we know we're at the end of the browser task.
  // So although it's not an actual microtask, it might as well be.
  scheduleTaskForRootDuringMicrotask(root, now$1());

  if (root.callbackNode === originalCallbackNode) {
    // The task node scheduled for this root is the same one that's
    // currently executed. Need to return a continuation.
    return performConcurrentWorkOnRoot.bind(null, root);
  }

  return null;
}

function scheduleCallback$2(priorityLevel, callback) {
  {
    return scheduleCallback$3(priorityLevel, callback);
  }
}

function cancelCallback(callbackNode) {
  if (callbackNode !== null) {
    cancelCallback$1(callbackNode);
  }
}

function scheduleImmediateTask(cb) {
  // Alternatively, can we move this check to the host config?


  {
    scheduleMicrotask(() => {
      // In Safari, appending an iframe forces microtasks to run.
      // https://github.com/facebook/react/issues/22459
      // We don't support running callbacks in the middle of render
      // or commit so we need to check against that.
      const executionContext = getExecutionContext();

      if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
        // Note that this would still prematurely flush the callbacks
        // if this happens outside render or commit phase (e.g. in an event).
        // Intentionally using a macrotask instead of a microtask here. This is
        // wrong semantically but it prevents an infinite loop. The bug is
        // Safari's, not ours, so we just do our best to not crash even though
        // the behavior isn't completely correct.
        scheduleCallback$3(ImmediatePriority, cb);
        return;
      }

      cb();
    });
  }
}

function requestTransitionLane() {
  // The algorithm for assigning an update to a lane should be stable for all
  // updates at the same priority within the same event. To do this, the
  // inputs to the algorithm must be the same.
  //
  // The trick we use is to cache the first of each of these inputs within an
  // event. Then reset the cached values once we can be sure the event is
  // over. Our heuristic for that is whenever we enter a concurrent work loop.
  if (currentEventTransitionLane === NoLane) {
    // All transitions within the same event are assigned the same lane.
    currentEventTransitionLane = claimNextTransitionLane();
  }

  return currentEventTransitionLane;
}

// transition updates that occur while the async action is still in progress
// are treated as part of the action.
//
// The ideal behavior would be to treat each async function as an independent
// action. However, without a mechanism like AsyncContext, we can't tell which
// action an update corresponds to. So instead, we entangle them all into one.
// The listeners to notify once the entangled scope completes.

let currentEntangledListeners = null; // The number of pending async actions in the entangled scope.

let currentEntangledPendingCount = 0; // The transition lane shared by all updates in the entangled scope.

let currentEntangledLane = NoLane;
function requestAsyncActionContext(actionReturnValue, // If this is provided, this resulting thenable resolves to this value instead
// of the return value of the action. This is a perf trick to avoid composing
// an extra async function.
overrideReturnValue) {
  // This is an async action.
  //
  // Return a thenable that resolves once the action scope (i.e. the async
  // function passed to startTransition) has finished running.
  const thenable = actionReturnValue;
  let entangledListeners;

  if (currentEntangledListeners === null) {
    // There's no outer async action scope. Create a new one.
    entangledListeners = currentEntangledListeners = [];
    currentEntangledPendingCount = 0;
    currentEntangledLane = requestTransitionLane();
  } else {
    entangledListeners = currentEntangledListeners;
  }

  currentEntangledPendingCount++; // Create a thenable that represents the result of this action, but doesn't
  // resolve until the entire entangled scope has finished.
  //
  // Expressed using promises:
  //   const [thisResult] = await Promise.all([thisAction, entangledAction]);
  //   return thisResult;

  const resultThenable = createResultThenable(entangledListeners);
  let resultStatus = 'pending';
  let resultValue;
  let rejectedReason;
  thenable.then(value => {
    resultStatus = 'fulfilled';
    resultValue = overrideReturnValue !== null ? overrideReturnValue : value;
    pingEngtangledActionScope();
  }, error => {
    resultStatus = 'rejected';
    rejectedReason = error;
    pingEngtangledActionScope();
  }); // Attach a listener to fill in the result.

  entangledListeners.push(() => {
    switch (resultStatus) {
      case 'fulfilled':
        {
          const fulfilledThenable = resultThenable;
          fulfilledThenable.status = 'fulfilled';
          fulfilledThenable.value = resultValue;
          break;
        }

      case 'rejected':
        {
          const rejectedThenable = resultThenable;
          rejectedThenable.status = 'rejected';
          rejectedThenable.reason = rejectedReason;
          break;
        }

      case 'pending':
      default:
        {
          // The listener above should have been called first, so `resultStatus`
          // should already be set to the correct value.
          throw Error(formatProdErrorMessage(478));
        }
    }
  });
  return resultThenable;
}
function requestSyncActionContext(actionReturnValue, // If this is provided, this resulting thenable resolves to this value instead
// of the return value of the action. This is a perf trick to avoid composing
// an extra async function.
overrideReturnValue) {
  const resultValue = overrideReturnValue !== null ? overrideReturnValue : actionReturnValue; // This is not an async action, but it may be part of an outer async action.

  if (currentEntangledListeners === null) {
    return resultValue;
  } else {
    // Return a thenable that does not resolve until the entangled actions
    // have finished.
    const entangledListeners = currentEntangledListeners;
    const resultThenable = createResultThenable(entangledListeners);
    entangledListeners.push(() => {
      const fulfilledThenable = resultThenable;
      fulfilledThenable.status = 'fulfilled';
      fulfilledThenable.value = resultValue;
    });
    return resultThenable;
  }
}

function pingEngtangledActionScope() {
  if (currentEntangledListeners !== null && --currentEntangledPendingCount === 0) {
    // All the actions have finished. Close the entangled async action scope
    // and notify all the listeners.
    const listeners = currentEntangledListeners;
    currentEntangledListeners = null;
    currentEntangledLane = NoLane;

    for (let i = 0; i < listeners.length; i++) {
      const listener = listeners[i];
      listener();
    }
  }
}

function createResultThenable(entangledListeners) {
  // Waits for the entangled async action to complete, then resolves to the
  // result of an individual action.
  const resultThenable = {
    status: 'pending',
    value: null,
    reason: null,

    then(resolve) {
      // This is a bit of a cheat. `resolve` expects a value of type `S` to be
      // passed, but because we're instrumenting the `status` field ourselves,
      // and we know this thenable will only be used by React, we also know
      // the value isn't actually needed. So we add the resolve function
      // directly to the entangled listeners.
      //
      // This is also why we don't need to check if the thenable is still
      // pending; the Suspense implementation already performs that check.
      const ping = resolve;
      entangledListeners.push(ping);
    }

  };
  return resultThenable;
}

function peekEntangledActionLane() {
  return currentEntangledLane;
}

const ReactCurrentDispatcher$1 = ReactSharedInternals.ReactCurrentDispatcher,
      ReactCurrentBatchConfig$3 = ReactSharedInternals.ReactCurrentBatchConfig;
// lifetime of an effect. In Rust terms, a RefCell. We use it to store the
// "destroy" function that is returned from an effect, because that is stateful.
// The field is `undefined` if the effect is unmounted, or if the effect ran
// but is not stateful. We don't explicitly track whether the effect is mounted
// or unmounted because that can be inferred by the hiddenness of the fiber in
// the tree, i.e. whether there is a hidden Offscreen fiber above it.
//
// It's unfortunate that this is stored on a separate object, because it adds
// more memory per effect instance, but it's conceptually sound. I think there's
// likely a better data structure we could use for effects; perhaps just one
// array of effect instances per fiber. But I think this is OK for now despite
// the additional memory and we can follow up with performance
// optimizations later.
// These are set right before calling the component.


let renderLanes = NoLanes; // The work-in-progress fiber. I've named it differently to distinguish it from
// the work-in-progress hook.

let currentlyRenderingFiber$1 = null; // Hooks are stored as a linked list on the fiber's memoizedState field. The
// current hook list is the list that belongs to the current fiber. The
// work-in-progress hook list is a new list that will be added to the
// work-in-progress fiber.

let currentHook = null;
let workInProgressHook = null; // Whether an update was scheduled at any point during the render phase. This
// does not get reset if we do another render pass; only when we're completely
// finished evaluating this component. This is an optimization so we know
// whether we need to clear render phase updates after a throw.

let didScheduleRenderPhaseUpdate = false; // Where an update was scheduled only during the current render pass. This
// gets reset after each attempt.
// TODO: Maybe there's some way to consolidate this with
// `didScheduleRenderPhaseUpdate`. Or with `numberOfReRenders`.

let didScheduleRenderPhaseUpdateDuringThisPass = false;
let shouldDoubleInvokeUserFnsInHooksDEV = false; // Counts the number of useId hooks in this component.

let localIdCounter = 0; // Counts number of `use`-d thenables

let thenableIndexCounter = 0;
let thenableState = null; // Used for ids that are generated completely client-side (i.e. not during
// hydration). This counter is global, so client ids are not stable across
// render attempts.

let globalClientIdCounter = 0;
const RE_RENDER_LIMIT = 25; // In DEV, this is the name of the currently executing primitive hook

function throwInvalidHookError() {
  throw Error(formatProdErrorMessage(321));
}

function areHookInputsEqual(nextDeps, prevDeps) {

  if (prevDeps === null) {

    return false;
  }


  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    // $FlowFixMe[incompatible-use] found when upgrading Flow
    if (objectIs(nextDeps[i], prevDeps[i])) {
      continue;
    }

    return false;
  }

  return true;
}

function renderWithHooks(current, workInProgress, Component, props, secondArg, nextRenderLanes) {
  renderLanes = nextRenderLanes;
  currentlyRenderingFiber$1 = workInProgress;

  workInProgress.memoizedState = null;
  workInProgress.updateQueue = null;
  workInProgress.lanes = NoLanes; // The following should have already been reset
  // currentHook = null;
  // workInProgressHook = null;
  // didScheduleRenderPhaseUpdate = false;
  // localIdCounter = 0;
  // thenableIndexCounter = 0;
  // thenableState = null;
  // TODO Warn if no hooks are used at all during mount, then some are used during update.
  // Currently we will identify the update render as a mount because memoizedState === null.
  // This is tricky because it's valid for certain types of components (e.g. React.lazy)
  // Using memoizedState to differentiate between mount/update only works if at least one stateful hook is used.
  // Non-stateful hooks (e.g. context) don't get added to memoizedState,
  // so memoizedState would be null during updates and mounts.

  {
    ReactCurrentDispatcher$1.current = current === null || current.memoizedState === null ? HooksDispatcherOnMount : HooksDispatcherOnUpdate;
  } // In Strict Mode, during development, user functions are double invoked to
  // help detect side effects. The logic for how this is implemented for in
  // hook components is a bit complex so let's break it down.
  //
  // We will invoke the entire component function twice. However, during the
  // second invocation of the component, the hook state from the first
  // invocation will be reused. That means things like `useMemo` functions won't
  // run again, because the deps will match and the memoized result will
  // be reused.
  //
  // We want memoized functions to run twice, too, so account for this, user
  // functions are double invoked during the *first* invocation of the component
  // function, and are *not* double invoked during the second incovation:
  //
  // - First execution of component function: user functions are double invoked
  // - Second execution of component function (in Strict Mode, during
  //   development): user functions are not double invoked.
  //
  // This is intentional for a few reasons; most importantly, it's because of
  // how `use` works when something suspends: it reuses the promise that was
  // passed during the first attempt. This is itself a form of memoization.
  // We need to be able to memoize the reactive inputs to the `use` call using
  // a hook (i.e. `useMemo`), which means, the reactive inputs to `use` must
  // come from the same component invocation as the output.
  //
  // There are plenty of tests to ensure this behavior is correct.


  const shouldDoubleRenderDEV = false  ;
  shouldDoubleInvokeUserFnsInHooksDEV = shouldDoubleRenderDEV;
  let children = Component(props, secondArg);
  shouldDoubleInvokeUserFnsInHooksDEV = false; // Check if there was a render phase update

  if (didScheduleRenderPhaseUpdateDuringThisPass) {
    // Keep rendering until the component stabilizes (there are no more render
    // phase updates).
    children = renderWithHooksAgain(workInProgress, Component, props, secondArg);
  }

  finishRenderingHooks();
  return children;
}

function finishRenderingHooks(current, workInProgress, Component) {
  // at the beginning of the render phase and there's no re-entrance.


  ReactCurrentDispatcher$1.current = ContextOnlyDispatcher; // This check uses currentHook so that it works the same in DEV and prod bundles.
  // hookTypesDev could catch more cases (e.g. context) but only in DEV bundles.

  const didRenderTooFewHooks = currentHook !== null && currentHook.next !== null;
  renderLanes = NoLanes;
  currentlyRenderingFiber$1 = null;
  currentHook = null;
  workInProgressHook = null;

  didScheduleRenderPhaseUpdate = false; // This is reset by checkDidRenderIdHook
  // localIdCounter = 0;

  thenableIndexCounter = 0;
  thenableState = null;

  if (didRenderTooFewHooks) {
    throw Error(formatProdErrorMessage(300));
  }
}

function replaySuspendedComponentWithHooks(current, workInProgress, Component, props, secondArg) {

  const children = renderWithHooksAgain(workInProgress, Component, props, secondArg);
  finishRenderingHooks();
  return children;
}

function renderWithHooksAgain(workInProgress, Component, props, secondArg) {
  // This is used to perform another render pass. It's used when setState is
  // called during render, and for double invoking components in Strict Mode
  // during development.
  //
  // The state from the previous pass is reused whenever possible. So, state
  // updates that were already processed are not processed again, and memoized
  // functions (`useMemo`) are not invoked again.
  //
  // Keep rendering in a loop for as long as render phase updates continue to
  // be scheduled. Use a counter to prevent infinite loops.
  currentlyRenderingFiber$1 = workInProgress;
  let numberOfReRenders = 0;
  let children;

  do {
    if (didScheduleRenderPhaseUpdateDuringThisPass) {
      // It's possible that a use() value depended on a state that was updated in
      // this rerender, so we need to watch for different thenables this time.
      thenableState = null;
    }

    thenableIndexCounter = 0;
    didScheduleRenderPhaseUpdateDuringThisPass = false;

    if (numberOfReRenders >= RE_RENDER_LIMIT) {
      throw Error(formatProdErrorMessage(301));
    }

    numberOfReRenders += 1;


    currentHook = null;
    workInProgressHook = null;
    workInProgress.updateQueue = null;

    ReactCurrentDispatcher$1.current = HooksDispatcherOnRerender;
    children = Component(props, secondArg);
  } while (didScheduleRenderPhaseUpdateDuringThisPass);

  return children;
}

function renderTransitionAwareHostComponentWithHooks(current, workInProgress, lanes) {

  return renderWithHooks(current, workInProgress, TransitionAwareHostComponent, null, null, lanes);
}
function TransitionAwareHostComponent() {

  const dispatcher = ReactCurrentDispatcher$1.current;

  const _dispatcher$useState = dispatcher.useState(),
        maybeThenable = _dispatcher$useState[0];

  if (typeof maybeThenable.then === 'function') {
    const thenable = maybeThenable;
    return useThenable(thenable);
  } else {
    const status = maybeThenable;
    return status;
  }
}
function checkDidRenderIdHook() {
  // This should be called immediately after every renderWithHooks call.
  // Conceptually, it's part of the return value of renderWithHooks; it's only a
  // separate function to avoid using an array tuple.
  const didRenderIdHook = localIdCounter !== 0;
  localIdCounter = 0;
  return didRenderIdHook;
}
function bailoutHooks(current, workInProgress, lanes) {
  workInProgress.updateQueue = current.updateQueue; // TODO: Don't need to reset the flags here, because they're reset in the
  // complete phase (bubbleProperties).

  {
    workInProgress.flags &= ~(Passive$1 | Update);
  }

  current.lanes = removeLanes(current.lanes, lanes);
}
function resetHooksAfterThrow() {
  // This is called immediaetly after a throw. It shouldn't reset the entire
  // module state, because the work loop might decide to replay the component
  // again without rewinding.
  //
  // It should only reset things like the current dispatcher, to prevent hooks
  // from being called outside of a component.
  currentlyRenderingFiber$1 = null; // We can assume the previous dispatcher is always this one, since we set it
  // at the beginning of the render phase and there's no re-entrance.

  ReactCurrentDispatcher$1.current = ContextOnlyDispatcher;
}
function resetHooksOnUnwind(workInProgress) {
  if (didScheduleRenderPhaseUpdate) {
    // There were render phase updates. These are only valid for this render
    // phase, which we are now aborting. Remove the updates from the queues so
    // they do not persist to the next render. Do not remove updates from hooks
    // that weren't processed.
    //
    // Only reset the updates from the queue if it has a clone. If it does
    // not have a clone, that means it wasn't processed, and the updates were
    // scheduled before we entered the render phase.
    let hook = workInProgress.memoizedState;

    while (hook !== null) {
      const queue = hook.queue;

      if (queue !== null) {
        queue.pending = null;
      }

      hook = hook.next;
    }

    didScheduleRenderPhaseUpdate = false;
  }

  renderLanes = NoLanes;
  currentlyRenderingFiber$1 = null;
  currentHook = null;
  workInProgressHook = null;

  didScheduleRenderPhaseUpdateDuringThisPass = false;
  localIdCounter = 0;
  thenableIndexCounter = 0;
  thenableState = null;
}

function mountWorkInProgressHook() {
  const hook = {
    memoizedState: null,
    baseState: null,
    baseQueue: null,
    queue: null,
    next: null
  };

  if (workInProgressHook === null) {
    // This is the first hook in the list
    currentlyRenderingFiber$1.memoizedState = workInProgressHook = hook;
  } else {
    // Append to the end of the list
    workInProgressHook = workInProgressHook.next = hook;
  }

  return workInProgressHook;
}

function updateWorkInProgressHook() {
  // This function is used both for updates and for re-renders triggered by a
  // render phase update. It assumes there is either a current hook we can
  // clone, or a work-in-progress hook from a previous render pass that we can
  // use as a base.
  let nextCurrentHook;

  if (currentHook === null) {
    const current = currentlyRenderingFiber$1.alternate;

    if (current !== null) {
      nextCurrentHook = current.memoizedState;
    } else {
      nextCurrentHook = null;
    }
  } else {
    nextCurrentHook = currentHook.next;
  }

  let nextWorkInProgressHook;

  if (workInProgressHook === null) {
    nextWorkInProgressHook = currentlyRenderingFiber$1.memoizedState;
  } else {
    nextWorkInProgressHook = workInProgressHook.next;
  }

  if (nextWorkInProgressHook !== null) {
    // There's already a work-in-progress. Reuse it.
    workInProgressHook = nextWorkInProgressHook;
    nextWorkInProgressHook = workInProgressHook.next;
    currentHook = nextCurrentHook;
  } else {
    // Clone from the current hook.
    if (nextCurrentHook === null) {
      const currentFiber = currentlyRenderingFiber$1.alternate;

      if (currentFiber === null) {
        // This is the initial render. This branch is reached when the component
        // suspends, resumes, then renders an additional hook.
        // Should never be reached because we should switch to the mount dispatcher first.
        throw Error(formatProdErrorMessage(467));
      } else {
        // This is an update. We should always have a current hook.
        throw Error(formatProdErrorMessage(310));
      }
    }

    currentHook = nextCurrentHook;
    const newHook = {
      memoizedState: currentHook.memoizedState,
      baseState: currentHook.baseState,
      baseQueue: currentHook.baseQueue,
      queue: currentHook.queue,
      next: null
    };

    if (workInProgressHook === null) {
      // This is the first hook in the list.
      currentlyRenderingFiber$1.memoizedState = workInProgressHook = newHook;
    } else {
      // Append to the end of the list.
      workInProgressHook = workInProgressHook.next = newHook;
    }
  }

  return workInProgressHook;
} // NOTE: defining two versions of this function to avoid size impact when this feature is disabled.
// Previously this function was inlined, the additional `memoCache` property makes it not inlined.


let createFunctionComponentUpdateQueue;

{
  createFunctionComponentUpdateQueue = () => {
    return {
      lastEffect: null,
      events: null,
      stores: null,
      memoCache: null
    };
  };
}

function useThenable(thenable) {
  // Track the position of the thenable within this fiber.
  const index = thenableIndexCounter;
  thenableIndexCounter += 1;

  if (thenableState === null) {
    thenableState = createThenableState();
  }

  const result = trackUsedThenable(thenableState, thenable, index);

  if (currentlyRenderingFiber$1.alternate === null && (workInProgressHook === null ? currentlyRenderingFiber$1.memoizedState === null : workInProgressHook.next === null)) {
    // Initial render, and either this is the first time the component is
    // called, or there were no Hooks called after this use() the previous
    // time (perhaps because it threw). Subsequent Hook calls should use the
    // mount dispatcher.
    {
      ReactCurrentDispatcher$1.current = HooksDispatcherOnMount;
    }
  }

  return result;
}

function use(usable) {
  if (usable !== null && typeof usable === 'object') {
    // $FlowFixMe[method-unbinding]
    if (typeof usable.then === 'function') {
      // This is a thenable.
      const thenable = usable;
      return useThenable(thenable);
    } else if (usable.$$typeof === REACT_CONTEXT_TYPE || usable.$$typeof === REACT_SERVER_CONTEXT_TYPE) {
      const context = usable;
      return readContext(context);
    }
  } // eslint-disable-next-line react-internal/safe-string-coercion


  throw Error(formatProdErrorMessage(438, String(usable)));
}

function useMemoCache(size) {
  let memoCache = null; // Fast-path, load memo cache from wip fiber if already prepared

  let updateQueue = currentlyRenderingFiber$1.updateQueue;

  if (updateQueue !== null) {
    memoCache = updateQueue.memoCache;
  } // Otherwise clone from the current fiber


  if (memoCache == null) {
    const current = currentlyRenderingFiber$1.alternate;

    if (current !== null) {
      const currentUpdateQueue = current.updateQueue;

      if (currentUpdateQueue !== null) {
        const currentMemoCache = currentUpdateQueue.memoCache;

        if (currentMemoCache != null) {
          memoCache = {
            data: currentMemoCache.data.map(array => array.slice()),
            index: 0
          };
        }
      }
    }
  } // Finally fall back to allocating a fresh instance of the cache


  if (memoCache == null) {
    memoCache = {
      data: [],
      index: 0
    };
  }

  if (updateQueue === null) {
    updateQueue = createFunctionComponentUpdateQueue();
    currentlyRenderingFiber$1.updateQueue = updateQueue;
  }

  updateQueue.memoCache = memoCache;
  let data = memoCache.data[memoCache.index];

  if (data === undefined) {
    data = memoCache.data[memoCache.index] = new Array(size);

    for (let i = 0; i < size; i++) {
      data[i] = REACT_MEMO_CACHE_SENTINEL;
    }
  }

  memoCache.index++;
  return data;
}

function basicStateReducer(state, action) {
  // $FlowFixMe[incompatible-use]: Flow doesn't like mixed types
  return typeof action === 'function' ? action(state) : action;
}

function mountReducer(reducer, initialArg, init) {
  const hook = mountWorkInProgressHook();
  let initialState;

  if (init !== undefined) {
    initialState = init(initialArg);
  } else {
    initialState = initialArg;
  }

  hook.memoizedState = hook.baseState = initialState;
  const queue = {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: reducer,
    lastRenderedState: initialState
  };
  hook.queue = queue;
  const dispatch = queue.dispatch = dispatchReducerAction.bind(null, currentlyRenderingFiber$1, queue);
  return [hook.memoizedState, dispatch];
}

function updateReducer(reducer, initialArg, init) {
  const hook = updateWorkInProgressHook();
  return updateReducerImpl(hook, currentHook, reducer);
}

function updateReducerImpl(hook, current, reducer) {
  const queue = hook.queue;

  if (queue === null) {
    throw Error(formatProdErrorMessage(311));
  }

  queue.lastRenderedReducer = reducer; // The last rebase update that is NOT part of the base state.

  let baseQueue = hook.baseQueue; // The last pending update that hasn't been processed yet.

  const pendingQueue = queue.pending;

  if (pendingQueue !== null) {
    // We have new updates that haven't been processed yet.
    // We'll add them to the base queue.
    if (baseQueue !== null) {
      // Merge the pending queue and the base queue.
      const baseFirst = baseQueue.next;
      const pendingFirst = pendingQueue.next;
      baseQueue.next = pendingFirst;
      pendingQueue.next = baseFirst;
    }

    current.baseQueue = baseQueue = pendingQueue;
    queue.pending = null;
  }

  if (baseQueue !== null) {
    // We have a queue to process.
    const first = baseQueue.next;
    let newState = hook.baseState;
    let newBaseState = null;
    let newBaseQueueFirst = null;
    let newBaseQueueLast = null;
    let update = first;

    do {
      // An extra OffscreenLane bit is added to updates that were made to
      // a hidden tree, so that we can distinguish them from updates that were
      // already there when the tree was hidden.
      const updateLane = removeLanes(update.lane, OffscreenLane);
      const isHiddenUpdate = updateLane !== update.lane; // Check if this update was made while the tree was hidden. If so, then
      // it's not a "base" update and we should disregard the extra base lanes
      // that were added to renderLanes when we entered the Offscreen tree.

      const shouldSkipUpdate = isHiddenUpdate ? !isSubsetOfLanes(getWorkInProgressRootRenderLanes(), updateLane) : !isSubsetOfLanes(renderLanes, updateLane);

      if (shouldSkipUpdate) {
        // Priority is insufficient. Skip this update. If this is the first
        // skipped update, the previous update/state is the new base
        // update/state.
        const clone = {
          lane: updateLane,
          revertLane: update.revertLane,
          action: update.action,
          hasEagerState: update.hasEagerState,
          eagerState: update.eagerState,
          next: null
        };

        if (newBaseQueueLast === null) {
          newBaseQueueFirst = newBaseQueueLast = clone;
          newBaseState = newState;
        } else {
          newBaseQueueLast = newBaseQueueLast.next = clone;
        } // Update the remaining priority in the queue.
        // TODO: Don't need to accumulate this. Instead, we can remove
        // renderLanes from the original lanes.


        currentlyRenderingFiber$1.lanes = mergeLanes(currentlyRenderingFiber$1.lanes, updateLane);
        markSkippedUpdateLanes(updateLane);
      } else {
        // This update does have sufficient priority.
        // Check if this is an optimistic update.
        const revertLane = update.revertLane;

        if (revertLane === NoLane) {
          // This is not an optimistic update, and we're going to apply it now.
          // But, if there were earlier updates that were skipped, we need to
          // leave this update in the queue so it can be rebased later.
          if (newBaseQueueLast !== null) {
            const clone = {
              // This update is going to be committed so we never want uncommit
              // it. Using NoLane works because 0 is a subset of all bitmasks, so
              // this will never be skipped by the check above.
              lane: NoLane,
              revertLane: NoLane,
              action: update.action,
              hasEagerState: update.hasEagerState,
              eagerState: update.eagerState,
              next: null
            };
            newBaseQueueLast = newBaseQueueLast.next = clone;
          }
        } else {
          // This is an optimistic update. If the "revert" priority is
          // sufficient, don't apply the update. Otherwise, apply the update,
          // but leave it in the queue so it can be either reverted or
          // rebased in a subsequent render.
          if (isSubsetOfLanes(renderLanes, revertLane)) {
            // The transition that this optimistic update is associated with
            // has finished. Pretend the update doesn't exist by skipping
            // over it.
            update = update.next;
            continue;
          } else {
            const clone = {
              // Once we commit an optimistic update, we shouldn't uncommit it
              // until the transition it is associated with has finished
              // (represented by revertLane). Using NoLane here works because 0
              // is a subset of all bitmasks, so this will never be skipped by
              // the check above.
              lane: NoLane,
              // Reuse the same revertLane so we know when the transition
              // has finished.
              revertLane: update.revertLane,
              action: update.action,
              hasEagerState: update.hasEagerState,
              eagerState: update.eagerState,
              next: null
            };

            if (newBaseQueueLast === null) {
              newBaseQueueFirst = newBaseQueueLast = clone;
              newBaseState = newState;
            } else {
              newBaseQueueLast = newBaseQueueLast.next = clone;
            } // Update the remaining priority in the queue.
            // TODO: Don't need to accumulate this. Instead, we can remove
            // renderLanes from the original lanes.


            currentlyRenderingFiber$1.lanes = mergeLanes(currentlyRenderingFiber$1.lanes, revertLane);
            markSkippedUpdateLanes(revertLane);
          }
        } // Process this update.


        const action = update.action;

        if (shouldDoubleInvokeUserFnsInHooksDEV) {
          reducer(newState, action);
        }

        if (update.hasEagerState) {
          // If this update is a state update (not a reducer) and was processed eagerly,
          // we can use the eagerly computed state
          newState = update.eagerState;
        } else {
          newState = reducer(newState, action);
        }
      }

      update = update.next;
    } while (update !== null && update !== first);

    if (newBaseQueueLast === null) {
      newBaseState = newState;
    } else {
      newBaseQueueLast.next = newBaseQueueFirst;
    } // Mark that the fiber performed work, but only if the new state is
    // different from the current state.


    if (!objectIs(newState, hook.memoizedState)) {
      markWorkInProgressReceivedUpdate();
    }

    hook.memoizedState = newState;
    hook.baseState = newBaseState;
    hook.baseQueue = newBaseQueueLast;
    queue.lastRenderedState = newState;
  }

  if (baseQueue === null) {
    // `queue.lanes` is used for entangling transitions. We can set it back to
    // zero once the queue is empty.
    queue.lanes = NoLanes;
  }

  const dispatch = queue.dispatch;
  return [hook.memoizedState, dispatch];
}

function rerenderReducer(reducer, initialArg, init) {
  const hook = updateWorkInProgressHook();
  const queue = hook.queue;

  if (queue === null) {
    throw Error(formatProdErrorMessage(311));
  }

  queue.lastRenderedReducer = reducer; // This is a re-render. Apply the new render phase updates to the previous
  // work-in-progress hook.

  const dispatch = queue.dispatch;
  const lastRenderPhaseUpdate = queue.pending;
  let newState = hook.memoizedState;

  if (lastRenderPhaseUpdate !== null) {
    // The queue doesn't persist past this render pass.
    queue.pending = null;
    const firstRenderPhaseUpdate = lastRenderPhaseUpdate.next;
    let update = firstRenderPhaseUpdate;

    do {
      // Process this render phase update. We don't have to check the
      // priority because it will always be the same as the current
      // render's.
      const action = update.action;
      newState = reducer(newState, action);
      update = update.next;
    } while (update !== firstRenderPhaseUpdate); // Mark that the fiber performed work, but only if the new state is
    // different from the current state.


    if (!objectIs(newState, hook.memoizedState)) {
      markWorkInProgressReceivedUpdate();
    }

    hook.memoizedState = newState; // Don't persist the state accumulated from the render phase updates to
    // the base state unless the queue is empty.
    // TODO: Not sure if this is the desired semantics, but it's what we
    // do for gDSFP. I can't remember why.

    if (hook.baseQueue === null) {
      hook.baseState = newState;
    }

    queue.lastRenderedState = newState;
  }

  return [newState, dispatch];
}

function mountSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
  const fiber = currentlyRenderingFiber$1;
  const hook = mountWorkInProgressHook();
  let nextSnapshot;
  const isHydrating = getIsHydrating();

  if (isHydrating) {
    if (getServerSnapshot === undefined) {
      throw Error(formatProdErrorMessage(407));
    }

    nextSnapshot = getServerSnapshot();
  } else {
    nextSnapshot = getSnapshot();
    // Right before committing, we will walk the tree and check if any of the
    // stores were mutated.
    //
    // We won't do this if we're hydrating server-rendered content, because if
    // the content is stale, it's already visible anyway. Instead we'll patch
    // it up in a passive effect.


    const root = getWorkInProgressRoot();

    if (root === null) {
      throw Error(formatProdErrorMessage(349));
    }

    const rootRenderLanes = getWorkInProgressRootRenderLanes();

    if (!includesBlockingLane(root, rootRenderLanes)) {
      pushStoreConsistencyCheck(fiber, getSnapshot, nextSnapshot);
    }
  } // Read the current snapshot from the store on every render. This breaks the
  // normal rules of React, and only works because store updates are
  // always synchronous.


  hook.memoizedState = nextSnapshot;
  const inst = {
    value: nextSnapshot,
    getSnapshot
  };
  hook.queue = inst; // Schedule an effect to subscribe to the store.

  mountEffect(subscribeToStore.bind(null, fiber, inst, subscribe), [subscribe]); // Schedule an effect to update the mutable instance fields. We will update
  // this whenever subscribe, getSnapshot, or value changes. Because there's no
  // clean-up function, and we track the deps correctly, we can call pushEffect
  // directly, without storing any additional state. For the same reason, we
  // don't need to set a static flag, either.

  fiber.flags |= Passive$1;
  pushEffect(HasEffect | Passive, updateStoreInstance.bind(null, fiber, inst, nextSnapshot, getSnapshot), createEffectInstance(), null);
  return nextSnapshot;
}

function updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
  const fiber = currentlyRenderingFiber$1;
  const hook = updateWorkInProgressHook(); // Read the current snapshot from the store on every render. This breaks the
  // normal rules of React, and only works because store updates are
  // always synchronous.

  let nextSnapshot;
  const isHydrating = getIsHydrating();

  if (isHydrating) {
    // Needed for strict mode double render
    if (getServerSnapshot === undefined) {
      throw Error(formatProdErrorMessage(407));
    }

    nextSnapshot = getServerSnapshot();
  } else {
    nextSnapshot = getSnapshot();
  }

  const prevSnapshot = (currentHook || hook).memoizedState;
  const snapshotChanged = !objectIs(prevSnapshot, nextSnapshot);

  if (snapshotChanged) {
    hook.memoizedState = nextSnapshot;
    markWorkInProgressReceivedUpdate();
  }

  const inst = hook.queue;
  updateEffect(subscribeToStore.bind(null, fiber, inst, subscribe), [subscribe]); // Whenever getSnapshot or subscribe changes, we need to check in the
  // commit phase if there was an interleaved mutation. In concurrent mode
  // this can happen all the time, but even in synchronous mode, an earlier
  // effect may have mutated the store.

  if (inst.getSnapshot !== getSnapshot || snapshotChanged || // Check if the subscribe function changed. We can save some memory by
  // checking whether we scheduled a subscription effect above.
  workInProgressHook !== null && workInProgressHook.memoizedState.tag & HasEffect) {
    fiber.flags |= Passive$1;
    pushEffect(HasEffect | Passive, updateStoreInstance.bind(null, fiber, inst, nextSnapshot, getSnapshot), createEffectInstance(), null); // Unless we're rendering a blocking lane, schedule a consistency check.
    // Right before committing, we will walk the tree and check if any of the
    // stores were mutated.

    const root = getWorkInProgressRoot();

    if (root === null) {
      throw Error(formatProdErrorMessage(349));
    }

    if (!isHydrating && !includesBlockingLane(root, renderLanes)) {
      pushStoreConsistencyCheck(fiber, getSnapshot, nextSnapshot);
    }
  }

  return nextSnapshot;
}

function pushStoreConsistencyCheck(fiber, getSnapshot, renderedSnapshot) {
  fiber.flags |= StoreConsistency;
  const check = {
    getSnapshot,
    value: renderedSnapshot
  };
  let componentUpdateQueue = currentlyRenderingFiber$1.updateQueue;

  if (componentUpdateQueue === null) {
    componentUpdateQueue = createFunctionComponentUpdateQueue();
    currentlyRenderingFiber$1.updateQueue = componentUpdateQueue;
    componentUpdateQueue.stores = [check];
  } else {
    const stores = componentUpdateQueue.stores;

    if (stores === null) {
      componentUpdateQueue.stores = [check];
    } else {
      stores.push(check);
    }
  }
}

function updateStoreInstance(fiber, inst, nextSnapshot, getSnapshot) {
  // These are updated in the passive phase
  inst.value = nextSnapshot;
  inst.getSnapshot = getSnapshot; // Something may have been mutated in between render and commit. This could
  // have been in an event that fired before the passive effects, or it could
  // have been in a layout effect. In that case, we would have used the old
  // snapsho and getSnapshot values to bail out. We need to check one more time.

  if (checkIfSnapshotChanged(inst)) {
    // Force a re-render.
    forceStoreRerender(fiber);
  }
}

function subscribeToStore(fiber, inst, subscribe) {
  const handleStoreChange = () => {
    // The store changed. Check if the snapshot changed since the last time we
    // read from the store.
    if (checkIfSnapshotChanged(inst)) {
      // Force a re-render.
      forceStoreRerender(fiber);
    }
  }; // Subscribe to the store and return a clean-up function.


  return subscribe(handleStoreChange);
}

function checkIfSnapshotChanged(inst) {
  const latestGetSnapshot = inst.getSnapshot;
  const prevValue = inst.value;

  try {
    const nextValue = latestGetSnapshot();
    return !objectIs(prevValue, nextValue);
  } catch (error) {
    return true;
  }
}

function forceStoreRerender(fiber) {
  const root = enqueueConcurrentRenderForLane(fiber, SyncLane);

  if (root !== null) {
    scheduleUpdateOnFiber(root, fiber, SyncLane);
  }
}

function mountStateImpl(initialState) {
  const hook = mountWorkInProgressHook();

  if (typeof initialState === 'function') {
    // $FlowFixMe[incompatible-use]: Flow doesn't like mixed types
    initialState = initialState();
  }

  hook.memoizedState = hook.baseState = initialState;
  const queue = {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: basicStateReducer,
    lastRenderedState: initialState
  };
  hook.queue = queue;
  return hook;
}

function mountState(initialState) {
  const hook = mountStateImpl(initialState);
  const queue = hook.queue;
  const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber$1, queue);
  queue.dispatch = dispatch;
  return [hook.memoizedState, dispatch];
}

function updateState(initialState) {
  return updateReducer(basicStateReducer);
}

function rerenderState(initialState) {
  return rerenderReducer(basicStateReducer);
}

function mountOptimistic(passthrough, reducer) {
  const hook = mountWorkInProgressHook();
  hook.memoizedState = hook.baseState = passthrough;
  const queue = {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    // Optimistic state does not use the eager update optimization.
    lastRenderedReducer: null,
    lastRenderedState: null
  };
  hook.queue = queue; // This is different than the normal setState function.

  const dispatch = dispatchOptimisticSetState.bind(null, currentlyRenderingFiber$1, true, queue);
  queue.dispatch = dispatch;
  return [passthrough, dispatch];
}

function updateOptimistic(passthrough, reducer) {
  const hook = updateWorkInProgressHook();
  return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
}

function updateOptimisticImpl(hook, current, passthrough, reducer) {
  // Optimistic updates are always rebased on top of the latest value passed in
  // as an argument. It's called a passthrough because if there are no pending
  // updates, it will be returned as-is.
  //
  // Reset the base state to the passthrough. Future updates will be applied
  // on top of this.
  hook.baseState = passthrough; // If a reducer is not provided, default to the same one used by useState.

  const resolvedReducer = typeof reducer === 'function' ? reducer : basicStateReducer;
  return updateReducerImpl(hook, currentHook, resolvedReducer);
}

function rerenderOptimistic(passthrough, reducer) {
  // Unlike useState, useOptimistic doesn't support render phase updates.
  // Also unlike useState, we need to replay all pending updates again in case
  // the passthrough value changed.
  //
  // So instead of a forked re-render implementation that knows how to handle
  // render phase udpates, we can use the same implementation as during a
  // regular mount or update.
  const hook = updateWorkInProgressHook();

  if (currentHook !== null) {
    // This is an update. Process the update queue.
    return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
  } // This is a mount. No updates to process.
  // Reset the base state to the passthrough. Future updates will be applied
  // on top of this.


  hook.baseState = passthrough;
  const dispatch = hook.queue.dispatch;
  return [passthrough, dispatch];
} // useFormState actions run sequentially, because each action receives the
// previous state as an argument. We store pending actions on a queue.


function dispatchFormState(fiber, actionQueue, setState, payload) {
  if (isRenderPhaseUpdate(fiber)) {
    throw Error(formatProdErrorMessage(485));
  }

  const last = actionQueue.pending;

  if (last === null) {
    // There are no pending actions; this is the first one. We can run
    // it immediately.
    const newLast = {
      payload,
      next: null // circular

    };
    newLast.next = actionQueue.pending = newLast;
    runFormStateAction(actionQueue, setState, payload);
  } else {
    // There's already an action running. Add to the queue.
    const first = last.next;
    const newLast = {
      payload,
      next: first
    };
    actionQueue.pending = last.next = newLast;
  }
}

function runFormStateAction(actionQueue, setState, payload) {
  const action = actionQueue.action;
  const prevState = actionQueue.state; // This is a fork of startTransition

  const prevTransition = ReactCurrentBatchConfig$3.transition;
  ReactCurrentBatchConfig$3.transition = {};

  try {
    const returnValue = action(prevState, payload);

    if (returnValue !== null && typeof returnValue === 'object' && // $FlowFixMe[method-unbinding]
    typeof returnValue.then === 'function') {
      const thenable = returnValue; // Attach a listener to read the return state of the action. As soon as
      // this resolves, we can run the next action in the sequence.

      thenable.then(nextState => {
        actionQueue.state = nextState;
        finishRunningFormStateAction(actionQueue, setState);
      }, () => finishRunningFormStateAction(actionQueue, setState));
      const entangledResult = requestAsyncActionContext(thenable, null);
      setState(entangledResult);
    } else {
      // This is either `returnValue` or a thenable that resolves to
      // `returnValue`, depending on whether we're inside an async action scope.
      const entangledResult = requestSyncActionContext(returnValue, null);
      setState(entangledResult);
      const nextState = returnValue;
      actionQueue.state = nextState;
      finishRunningFormStateAction(actionQueue, setState);
    }
  } catch (error) {
    // This is a trick to get the `useFormState` hook to rethrow the error.
    // When it unwraps the thenable with the `use` algorithm, the error
    // will be thrown.
    const rejectedThenable = {
      then() {},

      status: 'rejected',
      reason: error // $FlowFixMe: Not sure why this doesn't work

    };
    setState(rejectedThenable);
    finishRunningFormStateAction(actionQueue, setState);
  } finally {
    ReactCurrentBatchConfig$3.transition = prevTransition;
  }
}

function finishRunningFormStateAction(actionQueue, setState) {
  // The action finished running. Pop it from the queue and run the next pending
  // action, if there are any.
  const last = actionQueue.pending;

  if (last !== null) {
    const first = last.next;

    if (first === last) {
      // This was the last action in the queue.
      actionQueue.pending = null;
    } else {
      // Remove the first node from the circular queue.
      const next = first.next;
      last.next = next; // Run the next action.

      runFormStateAction(actionQueue, setState, next.payload);
    }
  }
}

function formStateReducer(oldState, newState) {
  return newState;
}

function mountFormState(action, initialStateProp, permalink) {
  let initialState = initialStateProp;

  if (getIsHydrating()) {
    const root = getWorkInProgressRoot();
    const ssrFormState = root.formState; // If a formState option was passed to the root, there are form state
    // markers that we need to hydrate. These indicate whether the form state
    // matches this hook instance.

    if (ssrFormState !== null) {
      const isMatching = tryToClaimNextHydratableFormMarkerInstance();

      if (isMatching) {
        initialState = ssrFormState[0];
      }
    }
  } // State hook. The state is stored in a thenable which is then unwrapped by
  // the `use` algorithm during render.


  const stateHook = mountWorkInProgressHook();
  stateHook.memoizedState = stateHook.baseState = initialState; // TODO: Typing this "correctly" results in recursion limit errors
  // const stateQueue: UpdateQueue<S | Awaited<S>, S | Awaited<S>> = {

  const stateQueue = {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: formStateReducer,
    lastRenderedState: initialState
  };
  stateHook.queue = stateQueue;
  const setState = dispatchSetState.bind(null, currentlyRenderingFiber$1, stateQueue);
  stateQueue.dispatch = setState; // Action queue hook. This is used to queue pending actions. The queue is
  // shared between all instances of the hook. Similar to a regular state queue,
  // but different because the actions are run sequentially, and they run in
  // an event instead of during render.

  const actionQueueHook = mountWorkInProgressHook();
  const actionQueue = {
    state: initialState,
    dispatch: null,
    // circular
    action,
    pending: null
  };
  actionQueueHook.queue = actionQueue;
  const dispatch = dispatchFormState.bind(null, currentlyRenderingFiber$1, actionQueue, setState);
  actionQueue.dispatch = dispatch; // Stash the action function on the memoized state of the hook. We'll use this
  // to detect when the action function changes so we can update it in
  // an effect.

  actionQueueHook.memoizedState = action;
  return [initialState, dispatch];
}

function updateFormState(action, initialState, permalink) {
  const stateHook = updateWorkInProgressHook();
  const currentStateHook = currentHook;
  return updateFormStateImpl(stateHook, currentStateHook, action);
}

function updateFormStateImpl(stateHook, currentStateHook, action, initialState, permalink) {
  const _updateReducerImpl = updateReducerImpl(stateHook, currentStateHook, formStateReducer),
        actionResult = _updateReducerImpl[0]; // This will suspend until the action finishes.


  const state = typeof actionResult === 'object' && actionResult !== null && // $FlowFixMe[method-unbinding]
  typeof actionResult.then === 'function' ? useThenable(actionResult) : actionResult;
  const actionQueueHook = updateWorkInProgressHook();
  const actionQueue = actionQueueHook.queue;
  const dispatch = actionQueue.dispatch; // Check if a new action was passed. If so, update it in an effect.

  const prevAction = actionQueueHook.memoizedState;

  if (action !== prevAction) {
    currentlyRenderingFiber$1.flags |= Passive$1;
    pushEffect(HasEffect | Passive, formStateActionEffect.bind(null, actionQueue, action), createEffectInstance(), null);
  }

  return [state, dispatch];
}

function formStateActionEffect(actionQueue, action) {
  actionQueue.action = action;
}

function rerenderFormState(action, initialState, permalink) {
  // Unlike useState, useFormState doesn't support render phase updates.
  // Also unlike useState, we need to replay all pending updates again in case
  // the passthrough value changed.
  //
  // So instead of a forked re-render implementation that knows how to handle
  // render phase udpates, we can use the same implementation as during a
  // regular mount or update.
  const stateHook = updateWorkInProgressHook();
  const currentStateHook = currentHook;

  if (currentStateHook !== null) {
    // This is an update. Process the update queue.
    return updateFormStateImpl(stateHook, currentStateHook, action);
  } // This is a mount. No updates to process.


  const state = stateHook.memoizedState;
  const actionQueueHook = updateWorkInProgressHook();
  const actionQueue = actionQueueHook.queue;
  const dispatch = actionQueue.dispatch; // This may have changed during the rerender.

  actionQueueHook.memoizedState = action;
  return [state, dispatch];
}

function pushEffect(tag, create, inst, deps) {
  const effect = {
    tag,
    create,
    inst,
    deps,
    // Circular
    next: null
  };
  let componentUpdateQueue = currentlyRenderingFiber$1.updateQueue;

  if (componentUpdateQueue === null) {
    componentUpdateQueue = createFunctionComponentUpdateQueue();
    currentlyRenderingFiber$1.updateQueue = componentUpdateQueue;
    componentUpdateQueue.lastEffect = effect.next = effect;
  } else {
    const lastEffect = componentUpdateQueue.lastEffect;

    if (lastEffect === null) {
      componentUpdateQueue.lastEffect = effect.next = effect;
    } else {
      const firstEffect = lastEffect.next;
      lastEffect.next = effect;
      effect.next = firstEffect;
      componentUpdateQueue.lastEffect = effect;
    }
  }

  return effect;
}

function createEffectInstance() {
  return {
    destroy: undefined
  };
}

function mountRef(initialValue) {
  const hook = mountWorkInProgressHook();

  {
    const ref = {
      current: initialValue
    };
    hook.memoizedState = ref;
    return ref;
  }
}

function updateRef(initialValue) {
  const hook = updateWorkInProgressHook();
  return hook.memoizedState;
}

function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  currentlyRenderingFiber$1.flags |= fiberFlags;
  hook.memoizedState = pushEffect(HasEffect | hookFlags, create, createEffectInstance(), nextDeps);
}

function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const effect = hook.memoizedState;
  const inst = effect.inst; // currentHook is null on initial mount when rerendering after a render phase
  // state update or for strict mode.

  if (currentHook !== null) {
    if (nextDeps !== null) {
      const prevEffect = currentHook.memoizedState;
      const prevDeps = prevEffect.deps;

      if (areHookInputsEqual(nextDeps, prevDeps)) {
        hook.memoizedState = pushEffect(hookFlags, create, inst, nextDeps);
        return;
      }
    }
  }

  currentlyRenderingFiber$1.flags |= fiberFlags;
  hook.memoizedState = pushEffect(HasEffect | hookFlags, create, inst, nextDeps);
}

function mountEffect(create, deps) {
  {
    mountEffectImpl(Passive$1 | PassiveStatic, Passive, create, deps);
  }
}

function updateEffect(create, deps) {
  updateEffectImpl(Passive$1, Passive, create, deps);
}

function useEffectEventImpl(payload) {
  currentlyRenderingFiber$1.flags |= Update;
  let componentUpdateQueue = currentlyRenderingFiber$1.updateQueue;

  if (componentUpdateQueue === null) {
    componentUpdateQueue = createFunctionComponentUpdateQueue();
    currentlyRenderingFiber$1.updateQueue = componentUpdateQueue;
    componentUpdateQueue.events = [payload];
  } else {
    const events = componentUpdateQueue.events;

    if (events === null) {
      componentUpdateQueue.events = [payload];
    } else {
      events.push(payload);
    }
  }
}

function mountEvent(callback) {
  const hook = mountWorkInProgressHook();
  const ref = {
    impl: callback
  };
  hook.memoizedState = ref; // $FlowIgnore[incompatible-return]

  return function eventFn() {
    if (isInvalidExecutionContextForEventFunction()) {
      throw Error(formatProdErrorMessage(440));
    }

    return ref.impl.apply(undefined, arguments);
  };
}

function updateEvent(callback) {
  const hook = updateWorkInProgressHook();
  const ref = hook.memoizedState;
  useEffectEventImpl({
    ref,
    nextImpl: callback
  }); // $FlowIgnore[incompatible-return]

  return function eventFn() {
    if (isInvalidExecutionContextForEventFunction()) {
      throw Error(formatProdErrorMessage(440));
    }

    return ref.impl.apply(undefined, arguments);
  };
}

function mountInsertionEffect(create, deps) {
  mountEffectImpl(Update, Insertion, create, deps);
}

function updateInsertionEffect(create, deps) {
  return updateEffectImpl(Update, Insertion, create, deps);
}

function mountLayoutEffect(create, deps) {
  let fiberFlags = Update | LayoutStatic;

  return mountEffectImpl(fiberFlags, Layout, create, deps);
}

function updateLayoutEffect(create, deps) {
  return updateEffectImpl(Update, Layout, create, deps);
}

function imperativeHandleEffect(create, ref) {
  if (typeof ref === 'function') {
    const refCallback = ref;
    const inst = create();
    refCallback(inst);
    return () => {
      refCallback(null);
    };
  } else if (ref !== null && ref !== undefined) {
    const refObject = ref;

    const inst = create();
    refObject.current = inst;
    return () => {
      refObject.current = null;
    };
  }
}

function mountImperativeHandle(ref, create, deps) {


  const effectDeps = deps !== null && deps !== undefined ? deps.concat([ref]) : null;
  let fiberFlags = Update | LayoutStatic;

  mountEffectImpl(fiberFlags, Layout, imperativeHandleEffect.bind(null, create, ref), effectDeps);
}

function updateImperativeHandle(ref, create, deps) {


  const effectDeps = deps !== null && deps !== undefined ? deps.concat([ref]) : null;
  updateEffectImpl(Update, Layout, imperativeHandleEffect.bind(null, create, ref), effectDeps);
}

function mountDebugValue(value, formatterFn) {// This hook is normally a no-op.
  // The react-debug-hooks package injects its own implementation
  // so that e.g. DevTools can display custom hook values.
}

const updateDebugValue = mountDebugValue;

function mountCallback(callback, deps) {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  hook.memoizedState = [callback, nextDeps];
  return callback;
}

function updateCallback(callback, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState;

  if (nextDeps !== null) {
    const prevDeps = prevState[1];

    if (areHookInputsEqual(nextDeps, prevDeps)) {
      return prevState[0];
    }
  }

  hook.memoizedState = [callback, nextDeps];
  return callback;
}

function mountMemo(nextCreate, deps) {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;

  if (shouldDoubleInvokeUserFnsInHooksDEV) {
    nextCreate();
  }

  const nextValue = nextCreate();
  hook.memoizedState = [nextValue, nextDeps];
  return nextValue;
}

function updateMemo(nextCreate, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState; // Assume these are defined. If they're not, areHookInputsEqual will warn.

  if (nextDeps !== null) {
    const prevDeps = prevState[1];

    if (areHookInputsEqual(nextDeps, prevDeps)) {
      return prevState[0];
    }
  }

  if (shouldDoubleInvokeUserFnsInHooksDEV) {
    nextCreate();
  }

  const nextValue = nextCreate();
  hook.memoizedState = [nextValue, nextDeps];
  return nextValue;
}

function mountDeferredValue(value, initialValue) {
  const hook = mountWorkInProgressHook();
  return mountDeferredValueImpl(hook, value, initialValue);
}

function updateDeferredValue(value, initialValue) {
  const hook = updateWorkInProgressHook();
  const resolvedCurrentHook = currentHook;
  const prevValue = resolvedCurrentHook.memoizedState;
  return updateDeferredValueImpl(hook, prevValue, value, initialValue);
}

function rerenderDeferredValue(value, initialValue) {
  const hook = updateWorkInProgressHook();

  if (currentHook === null) {
    // This is a rerender during a mount.
    return mountDeferredValueImpl(hook, value, initialValue);
  } else {
    // This is a rerender during an update.
    const prevValue = currentHook.memoizedState;
    return updateDeferredValueImpl(hook, prevValue, value, initialValue);
  }
}

function mountDeferredValueImpl(hook, value, initialValue) {
  if (// When `initialValue` is provided, we defer the initial render even if the
  // current render is not synchronous.
  initialValue !== undefined && // However, to avoid waterfalls, we do not defer if this render
  // was itself spawned by an earlier useDeferredValue. Check if DeferredLane
  // is part of the render lanes.
  !includesSomeLane(renderLanes, DeferredLane)) {
    // Render with the initial value
    hook.memoizedState = initialValue; // Schedule a deferred render to switch to the final value.

    const deferredLane = requestDeferredLane();
    currentlyRenderingFiber$1.lanes = mergeLanes(currentlyRenderingFiber$1.lanes, deferredLane);
    markSkippedUpdateLanes(deferredLane);
    return initialValue;
  } else {
    hook.memoizedState = value;
    return value;
  }
}

function updateDeferredValueImpl(hook, prevValue, value, initialValue) {
  if (objectIs(value, prevValue)) {
    // The incoming value is referentially identical to the currently rendered
    // value, so we can bail out quickly.
    return value;
  } else {
    // Received a new value that's different from the current value.
    // Check if we're inside a hidden tree
    if (isCurrentTreeHidden()) {
      // Revealing a prerendered tree is considered the same as mounting new
      // one, so we reuse the "mount" path in this case.
      const resultValue = mountDeferredValueImpl(hook, value, initialValue); // Unlike during an actual mount, we need to mark this as an update if
      // the value changed.

      if (!objectIs(resultValue, prevValue)) {
        markWorkInProgressReceivedUpdate();
      }

      return resultValue;
    }

    const shouldDeferValue = !includesOnlyNonUrgentLanes(renderLanes);

    if (shouldDeferValue) {
      // This is an urgent update. Since the value has changed, keep using the
      // previous value and spawn a deferred render to update it later.
      // Schedule a deferred render
      const deferredLane = requestDeferredLane();
      currentlyRenderingFiber$1.lanes = mergeLanes(currentlyRenderingFiber$1.lanes, deferredLane);
      markSkippedUpdateLanes(deferredLane); // Reuse the previous value. We do not need to mark this as an update,
      // because we did not render a new value.

      return prevValue;
    } else {
      // This is not an urgent update, so we can use the latest value regardless
      // of what it is. No need to defer it.
      // Mark this as an update to prevent the fiber from bailing out.
      markWorkInProgressReceivedUpdate();
      hook.memoizedState = value;
      return value;
    }
  }
}

function startTransition(fiber, queue, pendingState, finishedState, callback, options) {
  const previousPriority = getCurrentUpdatePriority();
  setCurrentUpdatePriority(higherEventPriority(previousPriority, ContinuousEventPriority));
  const prevTransition = ReactCurrentBatchConfig$3.transition;
  const currentTransition = {};

  {
    // We don't really need to use an optimistic update here, because we
    // schedule a second "revert" update below (which we use to suspend the
    // transition until the async action scope has finished). But we'll use an
    // optimistic update anyway to make it less likely the behavior accidentally
    // diverges; for example, both an optimistic update and this one should
    // share the same lane.
    ReactCurrentBatchConfig$3.transition = currentTransition;
    dispatchOptimisticSetState(fiber, false, queue, pendingState);
  }

  try {
    if (enableAsyncActions) {
      const returnValue = callback(); // Check if we're inside an async action scope. If so, we'll entangle
      // this new action with the existing scope.
      //
      // If we're not already inside an async action scope, and this action is
      // async, then we'll create a new async scope.
      //
      // In the async case, the resulting render will suspend until the async
      // action scope has finished.

      if (returnValue !== null && typeof returnValue === 'object' && typeof returnValue.then === 'function') {
        const thenable = returnValue; // This is a thenable that resolves to `finishedState` once the async
        // action scope has finished.

        const entangledResult = requestAsyncActionContext(thenable, finishedState);
        dispatchSetState(fiber, queue, entangledResult);
      } else {
        // This is either `finishedState` or a thenable that resolves to
        // `finishedState`, depending on whether we're inside an async
        // action scope.
        const entangledResult = requestSyncActionContext(returnValue, finishedState);
        dispatchSetState(fiber, queue, entangledResult);
      }
    }
  } catch (error) {
    {
      // This is a trick to get the `useTransition` hook to rethrow the error.
      // When it unwraps the thenable with the `use` algorithm, the error
      // will be thrown.
      const rejectedThenable = {
        then() {},

        status: 'rejected',
        reason: error
      };
      dispatchSetState(fiber, queue, rejectedThenable);
    }
  } finally {
    setCurrentUpdatePriority(previousPriority);
    ReactCurrentBatchConfig$3.transition = prevTransition;
  }
}

function startHostTransition(formFiber, pendingState, callback, formData) {

  if (formFiber.tag !== HostComponent) {
    throw Error(formatProdErrorMessage(476));
  }

  let queue;

  if (formFiber.memoizedState === null) {
    // Upgrade this host component fiber to be stateful. We're going to pretend
    // it was stateful all along so we can reuse most of the implementation
    // for function components and useTransition.
    //
    // Create the state hook used by TransitionAwareHostComponent. This is
    // essentially an inlined version of mountState.
    const newQueue = {
      pending: null,
      lanes: NoLanes,
      // We're going to cheat and intentionally not create a bound dispatch
      // method, because we can call it directly in startTransition.
      dispatch: null,
      lastRenderedReducer: basicStateReducer,
      lastRenderedState: NotPendingTransition
    };
    queue = newQueue;
    const stateHook = {
      memoizedState: NotPendingTransition,
      baseState: NotPendingTransition,
      baseQueue: null,
      queue: newQueue,
      next: null
    }; // Add the state hook to both fiber alternates. The idea is that the fiber
    // had this hook all along.

    formFiber.memoizedState = stateHook;
    const alternate = formFiber.alternate;

    if (alternate !== null) {
      alternate.memoizedState = stateHook;
    }
  } else {
    // This fiber was already upgraded to be stateful.
    const stateHook = formFiber.memoizedState;
    queue = stateHook.queue;
  }

  startTransition(formFiber, queue, pendingState, NotPendingTransition, // TODO: We can avoid this extra wrapper, somehow. Figure out layering
  // once more of this function is implemented.
  () => callback(formData));
}

function mountTransition() {
  const stateHook = mountStateImpl(false); // The `start` method never changes.

  const start = startTransition.bind(null, currentlyRenderingFiber$1, stateHook.queue, true, false);
  const hook = mountWorkInProgressHook();
  hook.memoizedState = start;
  return [false, start];
}

function updateTransition() {
  const _updateState = updateState(),
        booleanOrThenable = _updateState[0];

  const hook = updateWorkInProgressHook();
  const start = hook.memoizedState;
  const isPending = typeof booleanOrThenable === 'boolean' ? booleanOrThenable : // This will suspend until the async action scope has finished.
  useThenable(booleanOrThenable);
  return [isPending, start];
}

function rerenderTransition() {
  const _rerenderState = rerenderState(),
        booleanOrThenable = _rerenderState[0];

  const hook = updateWorkInProgressHook();
  const start = hook.memoizedState;
  const isPending = typeof booleanOrThenable === 'boolean' ? booleanOrThenable : // This will suspend until the async action scope has finished.
  useThenable(booleanOrThenable);
  return [isPending, start];
}

function useHostTransitionStatus() {

  const status = readContext(HostTransitionContext);
  return status !== null ? status : NotPendingTransition;
}

function mountId() {
  const hook = mountWorkInProgressHook();
  const root = getWorkInProgressRoot(); // TODO: In Fizz, id generation is specific to each server config. Maybe we
  // should do this in Fiber, too? Deferring this decision for now because
  // there's no other place to store the prefix except for an internal field on
  // the public createRoot object, which the fiber tree does not currently have
  // a reference to.

  const identifierPrefix = root.identifierPrefix;
  let id;

  if (getIsHydrating()) {
    const treeId = getTreeId(); // Use a captial R prefix for server-generated ids.

    id = ':' + identifierPrefix + 'R' + treeId; // Unless this is the first id at this level, append a number at the end
    // that represents the position of this useId hook among all the useId
    // hooks for this fiber.

    const localId = localIdCounter++;

    if (localId > 0) {
      id += 'H' + localId.toString(32);
    }

    id += ':';
  } else {
    // Use a lowercase r prefix for client-generated ids.
    const globalClientId = globalClientIdCounter++;
    id = ':' + identifierPrefix + 'r' + globalClientId.toString(32) + ':';
  }

  hook.memoizedState = id;
  return id;
}

function updateId() {
  const hook = updateWorkInProgressHook();
  const id = hook.memoizedState;
  return id;
}

function mountRefresh() {
  const hook = mountWorkInProgressHook();
  const refresh = hook.memoizedState = refreshCache.bind(null, currentlyRenderingFiber$1);
  return refresh;
}

function updateRefresh() {
  const hook = updateWorkInProgressHook();
  return hook.memoizedState;
}

function refreshCache(fiber, seedKey, seedValue) {
  // TODO: Consider warning if the refresh is at discrete priority, or if we
  // otherwise suspect that it wasn't batched properly.


  let provider = fiber.return;

  while (provider !== null) {
    switch (provider.tag) {
      case CacheComponent:
      case HostRoot:
        {
          // Schedule an update on the cache boundary to trigger a refresh.
          const lane = requestUpdateLane(provider);
          const refreshUpdate = createUpdate(lane);
          const root = enqueueUpdate(provider, refreshUpdate, lane);

          if (root !== null) {
            scheduleUpdateOnFiber(root, provider, lane);
            entangleTransitions(root, provider, lane);
          } // TODO: If a refresh never commits, the new cache created here must be
          // released. A simple case is start refreshing a cache boundary, but then
          // unmount that boundary before the refresh completes.


          const seededCache = createCache();

          if (seedKey !== null && seedKey !== undefined && root !== null) {
            {
              // Seed the cache with the value passed by the caller. This could be
              // from a server mutation, or it could be a streaming response.
              seededCache.data.set(seedKey, seedValue);
            }
          }

          const payload = {
            cache: seededCache
          };
          refreshUpdate.payload = payload;
          return;
        }
    }

    provider = provider.return;
  } // TODO: Warn if unmounted?

}

function dispatchReducerAction(fiber, queue, action) {

  const lane = requestUpdateLane(fiber);
  const update = {
    lane,
    revertLane: NoLane,
    action,
    hasEagerState: false,
    eagerState: null,
    next: null
  };

  if (isRenderPhaseUpdate(fiber)) {
    enqueueRenderPhaseUpdate(queue, update);
  } else {
    const root = enqueueConcurrentHookUpdate(fiber, queue, update, lane);

    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, lane);
      entangleTransitionUpdate(root, queue, lane);
    }
  }

  markUpdateInDevTools(fiber, lane);
}

function dispatchSetState(fiber, queue, action) {

  const lane = requestUpdateLane(fiber);
  const update = {
    lane,
    revertLane: NoLane,
    action,
    hasEagerState: false,
    eagerState: null,
    next: null
  };

  if (isRenderPhaseUpdate(fiber)) {
    enqueueRenderPhaseUpdate(queue, update);
  } else {
    const alternate = fiber.alternate;

    if (fiber.lanes === NoLanes && (alternate === null || alternate.lanes === NoLanes)) {
      // The queue is currently empty, which means we can eagerly compute the
      // next state before entering the render phase. If the new state is the
      // same as the current state, we may be able to bail out entirely.
      const lastRenderedReducer = queue.lastRenderedReducer;

      if (lastRenderedReducer !== null) {

        try {
          const currentState = queue.lastRenderedState;
          const eagerState = lastRenderedReducer(currentState, action); // Stash the eagerly computed state, and the reducer used to compute
          // it, on the update object. If the reducer hasn't changed by the
          // time we enter the render phase, then the eager state can be used
          // without calling the reducer again.

          update.hasEagerState = true;
          update.eagerState = eagerState;

          if (objectIs(eagerState, currentState)) {
            // Fast path. We can bail out without scheduling React to re-render.
            // It's still possible that we'll need to rebase this update later,
            // if the component re-renders for a different reason and by that
            // time the reducer has changed.
            // TODO: Do we still need to entangle transitions in this case?
            enqueueConcurrentHookUpdateAndEagerlyBailout(fiber, queue, update);
            return;
          }
        } catch (error) {// Suppress the error. It will throw again in the render phase.
        } finally {
        }
      }
    }

    const root = enqueueConcurrentHookUpdate(fiber, queue, update, lane);

    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, lane);
      entangleTransitionUpdate(root, queue, lane);
    }
  }

  markUpdateInDevTools(fiber, lane);
}

function dispatchOptimisticSetState(fiber, throwIfDuringRender, queue, action) {

  const update = {
    // An optimistic update commits synchronously.
    lane: SyncLane,
    // After committing, the optimistic update is "reverted" using the same
    // lane as the transition it's associated with.
    revertLane: requestTransitionLane(),
    action,
    hasEagerState: false,
    eagerState: null,
    next: null
  };

  if (isRenderPhaseUpdate(fiber)) {
    // When calling startTransition during render, this warns instead of
    // throwing because throwing would be a breaking change. setOptimisticState
    // is a new API so it's OK to throw.
    if (throwIfDuringRender) {
      throw Error(formatProdErrorMessage(479));
    }
  } else {
    const root = enqueueConcurrentHookUpdate(fiber, queue, update, SyncLane);

    if (root !== null) {
      // NOTE: The optimistic update implementation assumes that the transition
      // will never be attempted before the optimistic update. This currently
      // holds because the optimistic update is always synchronous. If we ever
      // change that, we'll need to account for this.
      scheduleUpdateOnFiber(root, fiber, SyncLane); // Optimistic updates are always synchronous, so we don't need to call
      // entangleTransitionUpdate here.
    }
  }

  markUpdateInDevTools(fiber, SyncLane);
}

function isRenderPhaseUpdate(fiber) {
  const alternate = fiber.alternate;
  return fiber === currentlyRenderingFiber$1 || alternate !== null && alternate === currentlyRenderingFiber$1;
}

function enqueueRenderPhaseUpdate(queue, update) {
  // This is a render phase update. Stash it in a lazily-created map of
  // queue -> linked list of updates. After this render pass, we'll restart
  // and apply the stashed updates on top of the work-in-progress hook.
  didScheduleRenderPhaseUpdateDuringThisPass = didScheduleRenderPhaseUpdate = true;
  const pending = queue.pending;

  if (pending === null) {
    // This is the first update. Create a circular list.
    update.next = update;
  } else {
    update.next = pending.next;
    pending.next = update;
  }

  queue.pending = update;
} // TODO: Move to ReactFiberConcurrentUpdates?


function entangleTransitionUpdate(root, queue, lane) {
  if (isTransitionLane(lane)) {
    let queueLanes = queue.lanes; // If any entangled lanes are no longer pending on the root, then they
    // must have finished. We can remove them from the shared queue, which
    // represents a superset of the actually pending lanes. In some cases we
    // may entangle more than we need to, but that's OK. In fact it's worse if
    // we *don't* entangle when we should.

    queueLanes = intersectLanes(queueLanes, root.pendingLanes); // Entangle the new transition lane with the other transition lanes.

    const newQueueLanes = mergeLanes(queueLanes, lane);
    queue.lanes = newQueueLanes; // Even if queue.lanes already include lane, we don't know for certain if
    // the lane finished since the last time we entangled it. So we need to
    // entangle it again, just to be sure.

    markRootEntangled(root, newQueueLanes);
  }
}

function markUpdateInDevTools(fiber, lane, action) {

  {
    markStateUpdateScheduled(fiber, lane);
  }
}

const ContextOnlyDispatcher = {
  readContext,
  use,
  useCallback: throwInvalidHookError,
  useContext: throwInvalidHookError,
  useEffect: throwInvalidHookError,
  useImperativeHandle: throwInvalidHookError,
  useInsertionEffect: throwInvalidHookError,
  useLayoutEffect: throwInvalidHookError,
  useMemo: throwInvalidHookError,
  useReducer: throwInvalidHookError,
  useRef: throwInvalidHookError,
  useState: throwInvalidHookError,
  useDebugValue: throwInvalidHookError,
  useDeferredValue: throwInvalidHookError,
  useTransition: throwInvalidHookError,
  useSyncExternalStore: throwInvalidHookError,
  useId: throwInvalidHookError
};

{
  ContextOnlyDispatcher.useCacheRefresh = throwInvalidHookError;
}

{
  ContextOnlyDispatcher.useMemoCache = throwInvalidHookError;
}

{
  ContextOnlyDispatcher.useEffectEvent = throwInvalidHookError;
}

{
  ContextOnlyDispatcher.useHostTransitionStatus = throwInvalidHookError;
  ContextOnlyDispatcher.useFormState = throwInvalidHookError;
}

{
  ContextOnlyDispatcher.useOptimistic = throwInvalidHookError;
}

const HooksDispatcherOnMount = {
  readContext,
  use,
  useCallback: mountCallback,
  useContext: readContext,
  useEffect: mountEffect,
  useImperativeHandle: mountImperativeHandle,
  useLayoutEffect: mountLayoutEffect,
  useInsertionEffect: mountInsertionEffect,
  useMemo: mountMemo,
  useReducer: mountReducer,
  useRef: mountRef,
  useState: mountState,
  useDebugValue: mountDebugValue,
  useDeferredValue: mountDeferredValue,
  useTransition: mountTransition,
  useSyncExternalStore: mountSyncExternalStore,
  useId: mountId
};

{
  HooksDispatcherOnMount.useCacheRefresh = mountRefresh;
}

{
  HooksDispatcherOnMount.useMemoCache = useMemoCache;
}

{
  HooksDispatcherOnMount.useEffectEvent = mountEvent;
}

{
  HooksDispatcherOnMount.useHostTransitionStatus = useHostTransitionStatus;
  HooksDispatcherOnMount.useFormState = mountFormState;
}

{
  HooksDispatcherOnMount.useOptimistic = mountOptimistic;
}

const HooksDispatcherOnUpdate = {
  readContext,
  use,
  useCallback: updateCallback,
  useContext: readContext,
  useEffect: updateEffect,
  useImperativeHandle: updateImperativeHandle,
  useInsertionEffect: updateInsertionEffect,
  useLayoutEffect: updateLayoutEffect,
  useMemo: updateMemo,
  useReducer: updateReducer,
  useRef: updateRef,
  useState: updateState,
  useDebugValue: updateDebugValue,
  useDeferredValue: updateDeferredValue,
  useTransition: updateTransition,
  useSyncExternalStore: updateSyncExternalStore,
  useId: updateId
};

{
  HooksDispatcherOnUpdate.useCacheRefresh = updateRefresh;
}

{
  HooksDispatcherOnUpdate.useMemoCache = useMemoCache;
}

{
  HooksDispatcherOnUpdate.useEffectEvent = updateEvent;
}

{
  HooksDispatcherOnUpdate.useHostTransitionStatus = useHostTransitionStatus;
  HooksDispatcherOnUpdate.useFormState = updateFormState;
}

{
  HooksDispatcherOnUpdate.useOptimistic = updateOptimistic;
}

const HooksDispatcherOnRerender = {
  readContext,
  use,
  useCallback: updateCallback,
  useContext: readContext,
  useEffect: updateEffect,
  useImperativeHandle: updateImperativeHandle,
  useInsertionEffect: updateInsertionEffect,
  useLayoutEffect: updateLayoutEffect,
  useMemo: updateMemo,
  useReducer: rerenderReducer,
  useRef: updateRef,
  useState: rerenderState,
  useDebugValue: updateDebugValue,
  useDeferredValue: rerenderDeferredValue,
  useTransition: rerenderTransition,
  useSyncExternalStore: updateSyncExternalStore,
  useId: updateId
};

{
  HooksDispatcherOnRerender.useCacheRefresh = updateRefresh;
}

{
  HooksDispatcherOnRerender.useMemoCache = useMemoCache;
}

{
  HooksDispatcherOnRerender.useEffectEvent = updateEvent;
}

{
  HooksDispatcherOnRerender.useHostTransitionStatus = useHostTransitionStatus;
  HooksDispatcherOnRerender.useFormState = rerenderFormState;
}

{
  HooksDispatcherOnRerender.useOptimistic = rerenderOptimistic;
}

const now = Scheduler.unstable_now;
let commitTime = 0;
let layoutEffectStartTime = -1;
let profilerStartTime = -1;
let passiveEffectStartTime = -1;
/**
 * Tracks whether the current update was a nested/cascading update (scheduled from a layout effect).
 *
 * The overall sequence is:
 *   1. render
 *   2. commit (and call `onRender`, `onCommit`)
 *   3. check for nested updates
 *   4. flush passive effects (and call `onPostCommit`)
 *
 * Nested updates are identified in step 3 above,
 * but step 4 still applies to the work that was just committed.
 * We use two flags to track nested updates then:
 * one tracks whether the upcoming update is a nested update,
 * and the other tracks whether the current update was a nested update.
 * The first value gets synced to the second at the start of the render phase.
 */

let currentUpdateIsNested = false;
let nestedUpdateScheduled = false;

function isCurrentUpdateNested() {
  return currentUpdateIsNested;
}

function markNestedUpdateScheduled() {
  {
    nestedUpdateScheduled = true;
  }
}

function resetNestedUpdateFlag() {
  {
    currentUpdateIsNested = false;
    nestedUpdateScheduled = false;
  }
}

function syncNestedUpdateFlag() {
  {
    currentUpdateIsNested = nestedUpdateScheduled;
    nestedUpdateScheduled = false;
  }
}

function getCommitTime() {
  return commitTime;
}

function recordCommitTime() {

  commitTime = now();
}

function startProfilerTimer(fiber) {

  profilerStartTime = now();

  if (fiber.actualStartTime < 0) {
    fiber.actualStartTime = now();
  }
}

function stopProfilerTimerIfRunning(fiber) {

  profilerStartTime = -1;
}

function stopProfilerTimerIfRunningAndRecordDelta(fiber, overrideBaseTime) {

  if (profilerStartTime >= 0) {
    const elapsedTime = now() - profilerStartTime;
    fiber.actualDuration += elapsedTime;

    if (overrideBaseTime) {
      fiber.selfBaseDuration = elapsedTime;
    }

    profilerStartTime = -1;
  }
}

function recordLayoutEffectDuration(fiber) {

  if (layoutEffectStartTime >= 0) {
    const elapsedTime = now() - layoutEffectStartTime;
    layoutEffectStartTime = -1; // Store duration on the next nearest Profiler ancestor
    // Or the root (for the DevTools Profiler to read)

    let parentFiber = fiber.return;

    while (parentFiber !== null) {
      switch (parentFiber.tag) {
        case HostRoot:
          const root = parentFiber.stateNode;
          root.effectDuration += elapsedTime;
          return;

        case Profiler:
          const parentStateNode = parentFiber.stateNode;
          parentStateNode.effectDuration += elapsedTime;
          return;
      }

      parentFiber = parentFiber.return;
    }
  }
}

function recordPassiveEffectDuration(fiber) {

  if (passiveEffectStartTime >= 0) {
    const elapsedTime = now() - passiveEffectStartTime;
    passiveEffectStartTime = -1; // Store duration on the next nearest Profiler ancestor
    // Or the root (for the DevTools Profiler to read)

    let parentFiber = fiber.return;

    while (parentFiber !== null) {
      switch (parentFiber.tag) {
        case HostRoot:
          const root = parentFiber.stateNode;

          if (root !== null) {
            root.passiveEffectDuration += elapsedTime;
          }

          return;

        case Profiler:
          const parentStateNode = parentFiber.stateNode;

          if (parentStateNode !== null) {
            // Detached fibers have their state node cleared out.
            // In this case, the return pointer is also cleared out,
            // so we won't be able to report the time spent in this Profiler's subtree.
            parentStateNode.passiveEffectDuration += elapsedTime;
          }

          return;
      }

      parentFiber = parentFiber.return;
    }
  }
}

function startLayoutEffectTimer() {

  layoutEffectStartTime = now();
}

function startPassiveEffectTimer() {

  passiveEffectStartTime = now();
}

function transferActualDuration(fiber) {
  // Transfer time spent rendering these children so we don't lose it
  // after we rerender. This is used as a helper in special cases
  // where we should count the work of multiple passes.
  let child = fiber.child;

  while (child) {
    // $FlowFixMe[unsafe-addition] addition with possible null/undefined value
    fiber.actualDuration += child.actualDuration;
    child = child.sibling;
  }
}

function resolveDefaultProps(Component, baseProps) {
  if (Component && Component.defaultProps) {
    // Resolve default props. Taken from ReactElement
    const props = assign({}, baseProps);
    const defaultProps = Component.defaultProps;

    for (const propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }

    return props;
  }

  return baseProps;
}

function applyDerivedStateFromProps(workInProgress, ctor, getDerivedStateFromProps, nextProps) {
  const prevState = workInProgress.memoizedState;
  let partialState = getDerivedStateFromProps(nextProps, prevState);


  const memoizedState = partialState === null || partialState === undefined ? prevState : assign({}, prevState, partialState);
  workInProgress.memoizedState = memoizedState; // Once the update queue is empty, persist the derived state onto the
  // base state.

  if (workInProgress.lanes === NoLanes) {
    // Queue is always non-null for classes
    const updateQueue = workInProgress.updateQueue;
    updateQueue.baseState = memoizedState;
  }
}

const classComponentUpdater = {
  isMounted,

  // $FlowFixMe[missing-local-annot]
  enqueueSetState(inst, payload, callback) {
    const fiber = get(inst);
    const lane = requestUpdateLane(fiber);
    const update = createUpdate(lane);
    update.payload = payload;

    if (callback !== undefined && callback !== null) {

      update.callback = callback;
    }

    const root = enqueueUpdate(fiber, update, lane);

    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, lane);
      entangleTransitions(root, fiber, lane);
    }

    {
      markStateUpdateScheduled(fiber, lane);
    }
  },

  enqueueReplaceState(inst, payload, callback) {
    const fiber = get(inst);
    const lane = requestUpdateLane(fiber);
    const update = createUpdate(lane);
    update.tag = ReplaceState;
    update.payload = payload;

    if (callback !== undefined && callback !== null) {

      update.callback = callback;
    }

    const root = enqueueUpdate(fiber, update, lane);

    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, lane);
      entangleTransitions(root, fiber, lane);
    }

    {
      markStateUpdateScheduled(fiber, lane);
    }
  },

  // $FlowFixMe[missing-local-annot]
  enqueueForceUpdate(inst, callback) {
    const fiber = get(inst);
    const lane = requestUpdateLane(fiber);
    const update = createUpdate(lane);
    update.tag = ForceUpdate;

    if (callback !== undefined && callback !== null) {

      update.callback = callback;
    }

    const root = enqueueUpdate(fiber, update, lane);

    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, lane);
      entangleTransitions(root, fiber, lane);
    }

    {
      markForceUpdateScheduled(fiber, lane);
    }
  }

};

function checkShouldComponentUpdate(workInProgress, ctor, oldProps, newProps, oldState, newState, nextContext) {
  const instance = workInProgress.stateNode;

  if (typeof instance.shouldComponentUpdate === 'function') {
    let shouldUpdate = instance.shouldComponentUpdate(newProps, newState, nextContext);

    return shouldUpdate;
  }

  if (ctor.prototype && ctor.prototype.isPureReactComponent) {
    return !shallowEqual(oldProps, newProps) || !shallowEqual(oldState, newState);
  }

  return true;
}

function adoptClassInstance(workInProgress, instance) {
  instance.updater = classComponentUpdater;
  workInProgress.stateNode = instance; // The instance needs access to the fiber so that it can schedule updates

  set(instance, workInProgress);
}

function constructClassInstance(workInProgress, ctor, props) {
  let isLegacyContextConsumer = false;
  let unmaskedContext = emptyContextObject;
  let context = emptyContextObject;
  const contextType = ctor.contextType;

  if (typeof contextType === 'object' && contextType !== null) {
    context = readContext(contextType);
  } else {
    unmaskedContext = getUnmaskedContext(workInProgress, ctor, true);
    const contextTypes = ctor.contextTypes;
    isLegacyContextConsumer = contextTypes !== null && contextTypes !== undefined;
    context = isLegacyContextConsumer ? getMaskedContext(workInProgress, unmaskedContext) : emptyContextObject;
  }

  let instance = new ctor(props, context); // Instantiate twice to help detect side-effects.

  workInProgress.memoizedState = instance.state !== null && instance.state !== undefined ? instance.state : null;
  adoptClassInstance(workInProgress, instance);
  // ReactFiberContext usually updates this cache but can't for newly-created instances.


  if (isLegacyContextConsumer) {
    cacheContext(workInProgress, unmaskedContext, context);
  }

  return instance;
}

function callComponentWillMount(workInProgress, instance) {
  const oldState = instance.state;

  if (typeof instance.componentWillMount === 'function') {
    instance.componentWillMount();
  }

  if (typeof instance.UNSAFE_componentWillMount === 'function') {
    instance.UNSAFE_componentWillMount();
  }

  if (oldState !== instance.state) {

    classComponentUpdater.enqueueReplaceState(instance, instance.state, null);
  }
}

function callComponentWillReceiveProps(workInProgress, instance, newProps, nextContext) {
  const oldState = instance.state;

  if (typeof instance.componentWillReceiveProps === 'function') {
    instance.componentWillReceiveProps(newProps, nextContext);
  }

  if (typeof instance.UNSAFE_componentWillReceiveProps === 'function') {
    instance.UNSAFE_componentWillReceiveProps(newProps, nextContext);
  }

  if (instance.state !== oldState) {

    classComponentUpdater.enqueueReplaceState(instance, instance.state, null);
  }
} // Invokes the mount life-cycles on a previously never rendered instance.


function mountClassInstance(workInProgress, ctor, newProps, renderLanes) {

  const instance = workInProgress.stateNode;
  instance.props = newProps;
  instance.state = workInProgress.memoizedState;
  instance.refs = {};
  initializeUpdateQueue(workInProgress);
  const contextType = ctor.contextType;

  if (typeof contextType === 'object' && contextType !== null) {
    instance.context = readContext(contextType);
  } else {
    const unmaskedContext = getUnmaskedContext(workInProgress, ctor, true);
    instance.context = getMaskedContext(workInProgress, unmaskedContext);
  }

  instance.state = workInProgress.memoizedState;
  const getDerivedStateFromProps = ctor.getDerivedStateFromProps;

  if (typeof getDerivedStateFromProps === 'function') {
    applyDerivedStateFromProps(workInProgress, ctor, getDerivedStateFromProps, newProps);
    instance.state = workInProgress.memoizedState;
  } // In order to support react-lifecycles-compat polyfilled components,
  // Unsafe lifecycles should not be invoked for components using the new APIs.


  if (typeof ctor.getDerivedStateFromProps !== 'function' && typeof instance.getSnapshotBeforeUpdate !== 'function' && (typeof instance.UNSAFE_componentWillMount === 'function' || typeof instance.componentWillMount === 'function')) {
    callComponentWillMount(workInProgress, instance); // If we had additional state updates during this life-cycle, let's
    // process them now.

    processUpdateQueue(workInProgress, newProps, instance, renderLanes);
    instance.state = workInProgress.memoizedState;
  }

  if (typeof instance.componentDidMount === 'function') {
    workInProgress.flags |= Update | LayoutStatic;
  }
}

function resumeMountClassInstance(workInProgress, ctor, newProps, renderLanes) {
  const instance = workInProgress.stateNode;
  const oldProps = workInProgress.memoizedProps;
  instance.props = oldProps;
  const oldContext = instance.context;
  const contextType = ctor.contextType;
  let nextContext = emptyContextObject;

  if (typeof contextType === 'object' && contextType !== null) {
    nextContext = readContext(contextType);
  } else {
    const nextLegacyUnmaskedContext = getUnmaskedContext(workInProgress, ctor, true);
    nextContext = getMaskedContext(workInProgress, nextLegacyUnmaskedContext);
  }

  const getDerivedStateFromProps = ctor.getDerivedStateFromProps;
  const hasNewLifecycles = typeof getDerivedStateFromProps === 'function' || typeof instance.getSnapshotBeforeUpdate === 'function'; // Note: During these life-cycles, instance.props/instance.state are what
  // ever the previously attempted to render - not the "current". However,
  // during componentDidUpdate we pass the "current" props.
  // In order to support react-lifecycles-compat polyfilled components,
  // Unsafe lifecycles should not be invoked for components using the new APIs.

  if (!hasNewLifecycles && (typeof instance.UNSAFE_componentWillReceiveProps === 'function' || typeof instance.componentWillReceiveProps === 'function')) {
    if (oldProps !== newProps || oldContext !== nextContext) {
      callComponentWillReceiveProps(workInProgress, instance, newProps, nextContext);
    }
  }

  resetHasForceUpdateBeforeProcessing();
  const oldState = workInProgress.memoizedState;
  let newState = instance.state = oldState;
  processUpdateQueue(workInProgress, newProps, instance, renderLanes);
  newState = workInProgress.memoizedState;

  if (oldProps === newProps && oldState === newState && !hasContextChanged() && !checkHasForceUpdateAfterProcessing()) {
    // If an update was already in progress, we should schedule an Update
    // effect even though we're bailing out, so that cWU/cDU are called.
    if (typeof instance.componentDidMount === 'function') {
      workInProgress.flags |= Update | LayoutStatic;
    }

    return false;
  }

  if (typeof getDerivedStateFromProps === 'function') {
    applyDerivedStateFromProps(workInProgress, ctor, getDerivedStateFromProps, newProps);
    newState = workInProgress.memoizedState;
  }

  const shouldUpdate = checkHasForceUpdateAfterProcessing() || checkShouldComponentUpdate(workInProgress, ctor, oldProps, newProps, oldState, newState, nextContext);

  if (shouldUpdate) {
    // In order to support react-lifecycles-compat polyfilled components,
    // Unsafe lifecycles should not be invoked for components using the new APIs.
    if (!hasNewLifecycles && (typeof instance.UNSAFE_componentWillMount === 'function' || typeof instance.componentWillMount === 'function')) {
      if (typeof instance.componentWillMount === 'function') {
        instance.componentWillMount();
      }

      if (typeof instance.UNSAFE_componentWillMount === 'function') {
        instance.UNSAFE_componentWillMount();
      }
    }

    if (typeof instance.componentDidMount === 'function') {
      workInProgress.flags |= Update | LayoutStatic;
    }
  } else {
    // If an update was already in progress, we should schedule an Update
    // effect even though we're bailing out, so that cWU/cDU are called.
    if (typeof instance.componentDidMount === 'function') {
      workInProgress.flags |= Update | LayoutStatic;
    }
    // memoized state to indicate that this work can be reused.


    workInProgress.memoizedProps = newProps;
    workInProgress.memoizedState = newState;
  } // Update the existing instance's state, props, and context pointers even
  // if shouldComponentUpdate returns false.


  instance.props = newProps;
  instance.state = newState;
  instance.context = nextContext;
  return shouldUpdate;
} // Invokes the update life-cycles and returns false if it shouldn't rerender.


function updateClassInstance(current, workInProgress, ctor, newProps, renderLanes) {
  const instance = workInProgress.stateNode;
  cloneUpdateQueue(current, workInProgress);
  const unresolvedOldProps = workInProgress.memoizedProps;
  const oldProps = workInProgress.type === workInProgress.elementType ? unresolvedOldProps : resolveDefaultProps(workInProgress.type, unresolvedOldProps);
  instance.props = oldProps;
  const unresolvedNewProps = workInProgress.pendingProps;
  const oldContext = instance.context;
  const contextType = ctor.contextType;
  let nextContext = emptyContextObject;

  if (typeof contextType === 'object' && contextType !== null) {
    nextContext = readContext(contextType);
  } else {
    const nextUnmaskedContext = getUnmaskedContext(workInProgress, ctor, true);
    nextContext = getMaskedContext(workInProgress, nextUnmaskedContext);
  }

  const getDerivedStateFromProps = ctor.getDerivedStateFromProps;
  const hasNewLifecycles = typeof getDerivedStateFromProps === 'function' || typeof instance.getSnapshotBeforeUpdate === 'function'; // Note: During these life-cycles, instance.props/instance.state are what
  // ever the previously attempted to render - not the "current". However,
  // during componentDidUpdate we pass the "current" props.
  // In order to support react-lifecycles-compat polyfilled components,
  // Unsafe lifecycles should not be invoked for components using the new APIs.

  if (!hasNewLifecycles && (typeof instance.UNSAFE_componentWillReceiveProps === 'function' || typeof instance.componentWillReceiveProps === 'function')) {
    if (unresolvedOldProps !== unresolvedNewProps || oldContext !== nextContext) {
      callComponentWillReceiveProps(workInProgress, instance, newProps, nextContext);
    }
  }

  resetHasForceUpdateBeforeProcessing();
  const oldState = workInProgress.memoizedState;
  let newState = instance.state = oldState;
  processUpdateQueue(workInProgress, newProps, instance, renderLanes);
  newState = workInProgress.memoizedState;

  if (unresolvedOldProps === unresolvedNewProps && oldState === newState && !hasContextChanged() && !checkHasForceUpdateAfterProcessing() && !(enableLazyContextPropagation   )) {
    // If an update was already in progress, we should schedule an Update
    // effect even though we're bailing out, so that cWU/cDU are called.
    if (typeof instance.componentDidUpdate === 'function') {
      if (unresolvedOldProps !== current.memoizedProps || oldState !== current.memoizedState) {
        workInProgress.flags |= Update;
      }
    }

    if (typeof instance.getSnapshotBeforeUpdate === 'function') {
      if (unresolvedOldProps !== current.memoizedProps || oldState !== current.memoizedState) {
        workInProgress.flags |= Snapshot;
      }
    }

    return false;
  }

  if (typeof getDerivedStateFromProps === 'function') {
    applyDerivedStateFromProps(workInProgress, ctor, getDerivedStateFromProps, newProps);
    newState = workInProgress.memoizedState;
  }

  const shouldUpdate = checkHasForceUpdateAfterProcessing() || checkShouldComponentUpdate(workInProgress, ctor, oldProps, newProps, oldState, newState, nextContext) || // TODO: In some cases, we'll end up checking if context has changed twice,
  // both before and after `shouldComponentUpdate` has been called. Not ideal,
  // but I'm loath to refactor this function. This only happens for memoized
  // components so it's not that common.
  enableLazyContextPropagation   ;

  if (shouldUpdate) {
    // In order to support react-lifecycles-compat polyfilled components,
    // Unsafe lifecycles should not be invoked for components using the new APIs.
    if (!hasNewLifecycles && (typeof instance.UNSAFE_componentWillUpdate === 'function' || typeof instance.componentWillUpdate === 'function')) {
      if (typeof instance.componentWillUpdate === 'function') {
        instance.componentWillUpdate(newProps, newState, nextContext);
      }

      if (typeof instance.UNSAFE_componentWillUpdate === 'function') {
        instance.UNSAFE_componentWillUpdate(newProps, newState, nextContext);
      }
    }

    if (typeof instance.componentDidUpdate === 'function') {
      workInProgress.flags |= Update;
    }

    if (typeof instance.getSnapshotBeforeUpdate === 'function') {
      workInProgress.flags |= Snapshot;
    }
  } else {
    // If an update was already in progress, we should schedule an Update
    // effect even though we're bailing out, so that cWU/cDU are called.
    if (typeof instance.componentDidUpdate === 'function') {
      if (unresolvedOldProps !== current.memoizedProps || oldState !== current.memoizedState) {
        workInProgress.flags |= Update;
      }
    }

    if (typeof instance.getSnapshotBeforeUpdate === 'function') {
      if (unresolvedOldProps !== current.memoizedProps || oldState !== current.memoizedState) {
        workInProgress.flags |= Snapshot;
      }
    } // If shouldComponentUpdate returned false, we should still update the
    // memoized props/state to indicate that this work can be reused.


    workInProgress.memoizedProps = newProps;
    workInProgress.memoizedState = newState;
  } // Update the existing instance's state, props, and context pointers even
  // if shouldComponentUpdate returns false.


  instance.props = newProps;
  instance.state = newState;
  instance.context = nextContext;
  return shouldUpdate;
}

function createCapturedValueAtFiber(value, source) {
  // If the value is an error, call this function immediately after it is thrown
  // so the stack is accurate.
  return {
    value,
    source,
    stack: getStackByFiberInDevAndProd(source),
    digest: null
  };
}
function createCapturedValue(value, digest, stack) {
  return {
    value,
    source: null,
    stack: stack != null ? stack : null,
    digest: digest != null ? digest : null
  };
}

// This module is forked in different environments.
// By default, return `true` to log errors to the console.
// Forks can return `false` if this isn't desirable.
function showErrorDialog(boundary, errorInfo) {
  return true;
}

function logCapturedError(boundary, errorInfo) {
  try {
    const logError = showErrorDialog(boundary, errorInfo); // Allow injected showErrorDialog() to prevent default console.error logging.
    // This enables renderers like ReactNative to better manage redbox behavior.

    if (logError === false) ;

    const error = errorInfo.value;

    if (false) ; else {
      // In production, we print the error directly.
      // This will include the message, the JS stack, and anything the browser wants to show.
      // We pass the error object instead of custom message so that the browser displays the error natively.
      console['error'](error); // Don't transform to our wrapper
    }
  } catch (e) {
    // This method must not throw, or React internal state will get messed up.
    // If console.error is overridden, or logCapturedError() shows a dialog that throws,
    // we want to report this error outside of the normal stack as a last resort.
    // https://github.com/facebook/react/issues/13188
    setTimeout(() => {
      throw e;
    });
  }
}

function createRootErrorUpdate(fiber, errorInfo, lane) {
  const update = createUpdate(lane); // Unmount the root by rendering null.

  update.tag = CaptureUpdate; // Caution: React DevTools currently depends on this property
  // being called "element".

  update.payload = {
    element: null
  };
  const error = errorInfo.value;

  update.callback = () => {
    onUncaughtError(error);
    logCapturedError(fiber, errorInfo);
  };

  return update;
}

function createClassErrorUpdate(fiber, errorInfo, lane) {
  const update = createUpdate(lane);
  update.tag = CaptureUpdate;
  const getDerivedStateFromError = fiber.type.getDerivedStateFromError;

  if (typeof getDerivedStateFromError === 'function') {
    const error = errorInfo.value;

    update.payload = () => {
      return getDerivedStateFromError(error);
    };

    update.callback = () => {

      logCapturedError(fiber, errorInfo);
    };
  }

  const inst = fiber.stateNode;

  if (inst !== null && typeof inst.componentDidCatch === 'function') {
    // $FlowFixMe[missing-this-annot]
    update.callback = function callback() {

      logCapturedError(fiber, errorInfo);

      if (typeof getDerivedStateFromError !== 'function') {
        // To preserve the preexisting retry behavior of error boundaries,
        // we keep track of which ones already failed during this batch.
        // This gets reset before we yield back to the browser.
        // TODO: Warn in strict mode if getDerivedStateFromError is
        // not defined.
        markLegacyErrorBoundaryAsFailed(this);
      }

      const error = errorInfo.value;
      const stack = errorInfo.stack;
      this.componentDidCatch(error, {
        componentStack: stack !== null ? stack : ''
      });
    };
  }

  return update;
}

function resetSuspendedComponent(sourceFiber, rootRenderLanes) {
  // A legacy mode Suspense quirk, only relevant to hook components.


  const tag = sourceFiber.tag;

  if ((sourceFiber.mode & ConcurrentMode) === NoMode && (tag === FunctionComponent || tag === ForwardRef || tag === SimpleMemoComponent)) {
    const currentSource = sourceFiber.alternate;

    if (currentSource) {
      sourceFiber.updateQueue = currentSource.updateQueue;
      sourceFiber.memoizedState = currentSource.memoizedState;
      sourceFiber.lanes = currentSource.lanes;
    } else {
      sourceFiber.updateQueue = null;
      sourceFiber.memoizedState = null;
    }
  }
}

function markSuspenseBoundaryShouldCapture(suspenseBoundary, returnFiber, sourceFiber, root, rootRenderLanes) {
  // This marks a Suspense boundary so that when we're unwinding the stack,
  // it captures the suspended "exception" and does a second (fallback) pass.
  if ((suspenseBoundary.mode & ConcurrentMode) === NoMode) {
    // Legacy Mode Suspense
    //
    // If the boundary is in legacy mode, we should *not*
    // suspend the commit. Pretend as if the suspended component rendered
    // null and keep rendering. When the Suspense boundary completes,
    // we'll do a second pass to render the fallback.
    if (suspenseBoundary === returnFiber) {
      // Special case where we suspended while reconciling the children of
      // a Suspense boundary's inner Offscreen wrapper fiber. This happens
      // when a React.lazy component is a direct child of a
      // Suspense boundary.
      //
      // Suspense boundaries are implemented as multiple fibers, but they
      // are a single conceptual unit. The legacy mode behavior where we
      // pretend the suspended fiber committed as `null` won't work,
      // because in this case the "suspended" fiber is the inner
      // Offscreen wrapper.
      //
      // Because the contents of the boundary haven't started rendering
      // yet (i.e. nothing in the tree has partially rendered) we can
      // switch to the regular, concurrent mode behavior: mark the
      // boundary with ShouldCapture and enter the unwind phase.
      suspenseBoundary.flags |= ShouldCapture;
    } else {
      suspenseBoundary.flags |= DidCapture;
      sourceFiber.flags |= ForceUpdateForLegacySuspense; // We're going to commit this fiber even though it didn't complete.
      // But we shouldn't call any lifecycle methods or callbacks. Remove
      // all lifecycle effect tags.

      sourceFiber.flags &= ~(LifecycleEffectMask | Incomplete);

      if (sourceFiber.tag === ClassComponent) {
        const currentSourceFiber = sourceFiber.alternate;

        if (currentSourceFiber === null) {
          // This is a new mount. Change the tag so it's not mistaken for a
          // completed class component. For example, we should not call
          // componentWillUnmount if it is deleted.
          sourceFiber.tag = IncompleteClassComponent;
        } else {
          // When we try rendering again, we should not reuse the current fiber,
          // since it's known to be in an inconsistent state. Use a force update to
          // prevent a bail out.
          const update = createUpdate(SyncLane);
          update.tag = ForceUpdate;
          enqueueUpdate(sourceFiber, update, SyncLane);
        }
      } // The source fiber did not complete. Mark it with Sync priority to
      // indicate that it still has pending work.


      sourceFiber.lanes = mergeLanes(sourceFiber.lanes, SyncLane);
    }

    return suspenseBoundary;
  } // Confirmed that the boundary is in a concurrent mode tree. Continue
  // with the normal suspend path.
  //
  // After this we'll use a set of heuristics to determine whether this
  // render pass will run to completion or restart or "suspend" the commit.
  // The actual logic for this is spread out in different places.
  //
  // This first principle is that if we're going to suspend when we complete
  // a root, then we should also restart if we get an update or ping that
  // might unsuspend it, and vice versa. The only reason to suspend is
  // because you think you might want to restart before committing. However,
  // it doesn't make sense to restart only while in the period we're suspended.
  //
  // Restarting too aggressively is also not good because it starves out any
  // intermediate loading state. So we use heuristics to determine when.
  // Suspense Heuristics
  //
  // If nothing threw a Promise or all the same fallbacks are already showing,
  // then don't suspend/restart.
  //
  // If this is an initial render of a new tree of Suspense boundaries and
  // those trigger a fallback, then don't suspend/restart. We want to ensure
  // that we can show the initial loading state as quickly as possible.
  //
  // If we hit a "Delayed" case, such as when we'd switch from content back into
  // a fallback, then we should always suspend/restart. Transitions apply
  // to this case. If none is defined, JND is used instead.
  //
  // If we're already showing a fallback and it gets "retried", allowing us to show
  // another level, but there's still an inner boundary that would show a fallback,
  // then we suspend/restart for 500ms since the last time we showed a fallback
  // anywhere in the tree. This effectively throttles progressive loading into a
  // consistent train of commits. This also gives us an opportunity to restart to
  // get to the completed state slightly earlier.
  //
  // If there's ambiguity due to batching it's resolved in preference of:
  // 1) "delayed", 2) "initial render", 3) "retry".
  //
  // We want to ensure that a "busy" state doesn't get force committed. We want to
  // ensure that new initial loading states can commit as soon as possible.


  suspenseBoundary.flags |= ShouldCapture; // TODO: I think we can remove this, since we now use `DidCapture` in
  // the begin phase to prevent an early bailout.

  suspenseBoundary.lanes = rootRenderLanes;
  return suspenseBoundary;
}

function throwException(root, returnFiber, sourceFiber, value, rootRenderLanes) {
  // The source fiber did not complete.
  sourceFiber.flags |= Incomplete;

  {
    if (isDevToolsPresent) {
      // If we have pending work still, restore the original updaters
      restorePendingUpdaters(root, rootRenderLanes);
    }
  }

  if (value !== null && typeof value === 'object') {
    if (value.$$typeof === REACT_POSTPONE_TYPE) {
      // Act as if this is an infinitely suspending promise.
      value = {
        then: function () {}
      };
    }

    if (typeof value.then === 'function') {
      // This is a wakeable. The component suspended.
      const wakeable = value;
      resetSuspendedComponent(sourceFiber);


      const suspenseBoundary = getSuspenseHandler();

      if (suspenseBoundary !== null) {
        switch (suspenseBoundary.tag) {
          case SuspenseComponent:
            {
              // If this suspense boundary is not already showing a fallback, mark
              // the in-progress render as suspended. We try to perform this logic
              // as soon as soon as possible during the render phase, so the work
              // loop can know things like whether it's OK to switch to other tasks,
              // or whether it can wait for data to resolve before continuing.
              // TODO: Most of these checks are already performed when entering a
              // Suspense boundary. We should track the information on the stack so
              // we don't have to recompute it on demand. This would also allow us
              // to unify with `use` which needs to perform this logic even sooner,
              // before `throwException` is called.
              if (sourceFiber.mode & ConcurrentMode) {
                if (getShellBoundary() === null) {
                  // Suspended in the "shell" of the app. This is an undesirable
                  // loading state. We should avoid committing this tree.
                  renderDidSuspendDelayIfPossible();
                } else {
                  // If we suspended deeper than the shell, we don't need to delay
                  // the commmit. However, we still call renderDidSuspend if this is
                  // a new boundary, to tell the work loop that a new fallback has
                  // appeared during this render.
                  // TODO: Theoretically we should be able to delete this branch.
                  // It's currently used for two things: 1) to throttle the
                  // appearance of successive loading states, and 2) in
                  // SuspenseList, to determine whether the children include any
                  // pending fallbacks. For 1, we should apply throttling to all
                  // retries, not just ones that render an additional fallback. For
                  // 2, we should check subtreeFlags instead. Then we can delete
                  // this branch.
                  const current = suspenseBoundary.alternate;

                  if (current === null) {
                    renderDidSuspend();
                  }
                }
              }

              suspenseBoundary.flags &= ~ForceClientRender;
              markSuspenseBoundaryShouldCapture(suspenseBoundary, returnFiber, sourceFiber, root, rootRenderLanes); // Retry listener
              //
              // If the fallback does commit, we need to attach a different type of
              // listener. This one schedules an update on the Suspense boundary to
              // turn the fallback state off.
              //
              // Stash the wakeable on the boundary fiber so we can access it in the
              // commit phase.
              //
              // When the wakeable resolves, we'll attempt to render the boundary
              // again ("retry").
              // Check if this is a Suspensey resource. We do not attach retry
              // listeners to these, because we don't actually need them for
              // rendering. Only for committing. Instead, if a fallback commits
              // and the only thing that suspended was a Suspensey resource, we
              // retry immediately.
              // TODO: Refactor throwException so that we don't have to do this type
              // check. The caller already knows what the cause was.

              const isSuspenseyResource = wakeable === noopSuspenseyCommitThenable;

              if (isSuspenseyResource) {
                suspenseBoundary.flags |= ScheduleRetry;
              } else {
                const retryQueue = suspenseBoundary.updateQueue;

                if (retryQueue === null) {
                  suspenseBoundary.updateQueue = new Set([wakeable]);
                } else {
                  retryQueue.add(wakeable);
                } // We only attach ping listeners in concurrent mode. Legacy
                // Suspense always commits fallbacks synchronously, so there are
                // no pings.


                if (suspenseBoundary.mode & ConcurrentMode) {
                  attachPingListener(root, wakeable, rootRenderLanes);
                }
              }

              return;
            }

          case OffscreenComponent:
            {
              if (suspenseBoundary.mode & ConcurrentMode) {
                suspenseBoundary.flags |= ShouldCapture;
                const isSuspenseyResource = wakeable === noopSuspenseyCommitThenable;

                if (isSuspenseyResource) {
                  suspenseBoundary.flags |= ScheduleRetry;
                } else {
                  const offscreenQueue = suspenseBoundary.updateQueue;

                  if (offscreenQueue === null) {
                    const newOffscreenQueue = {
                      transitions: null,
                      markerInstances: null,
                      retryQueue: new Set([wakeable])
                    };
                    suspenseBoundary.updateQueue = newOffscreenQueue;
                  } else {
                    const retryQueue = offscreenQueue.retryQueue;

                    if (retryQueue === null) {
                      offscreenQueue.retryQueue = new Set([wakeable]);
                    } else {
                      retryQueue.add(wakeable);
                    }
                  }

                  attachPingListener(root, wakeable, rootRenderLanes);
                }

                return;
              }
            }
        }

        throw Error(formatProdErrorMessage(435, suspenseBoundary.tag));
      } else {
        // No boundary was found. Unless this is a sync update, this is OK.
        // We can suspend and wait for more data to arrive.
        if (root.tag === ConcurrentRoot) {
          // In a concurrent root, suspending without a Suspense boundary is
          // allowed. It will suspend indefinitely without committing.
          //
          // TODO: Should we have different behavior for discrete updates? What
          // about flushSync? Maybe it should put the tree into an inert state,
          // and potentially log a warning. Revisit this for a future release.
          attachPingListener(root, wakeable, rootRenderLanes);
          renderDidSuspendDelayIfPossible();
          return;
        } else {
          // In a legacy root, suspending without a boundary is always an error.
          const uncaughtSuspenseError = Error(formatProdErrorMessage(426));
          value = uncaughtSuspenseError;
        }
      }
    }
  } // This is a regular error, not a Suspense wakeable.


  if (getIsHydrating() && sourceFiber.mode & ConcurrentMode) {
    const suspenseBoundary = getSuspenseHandler(); // If the error was thrown during hydration, we may be able to recover by
    // discarding the dehydrated content and switching to a client render.
    // Instead of surfacing the error, find the nearest Suspense boundary
    // and render it again without hydration.

    if (suspenseBoundary !== null) {
      if ((suspenseBoundary.flags & ShouldCapture) === NoFlags$1) {
        // Set a flag to indicate that we should try rendering the normal
        // children again, not the fallback.
        suspenseBoundary.flags |= ForceClientRender;
      }

      markSuspenseBoundaryShouldCapture(suspenseBoundary, returnFiber, sourceFiber, root, rootRenderLanes); // Even though the user may not be affected by this error, we should
      // still log it so it can be fixed.

      queueHydrationError(createCapturedValueAtFiber(value, sourceFiber));
      return;
    }
  }

  value = createCapturedValueAtFiber(value, sourceFiber);
  renderDidError(value); // We didn't find a boundary that could handle this type of exception. Start
  // over and traverse parent path again, this time treating the exception
  // as an error.

  let workInProgress = returnFiber;

  do {
    switch (workInProgress.tag) {
      case HostRoot:
        {
          const errorInfo = value;
          workInProgress.flags |= ShouldCapture;
          const lane = pickArbitraryLane(rootRenderLanes);
          workInProgress.lanes = mergeLanes(workInProgress.lanes, lane);
          const update = createRootErrorUpdate(workInProgress, errorInfo, lane);
          enqueueCapturedUpdate(workInProgress, update);
          return;
        }

      case ClassComponent:
        // Capture and retry
        const errorInfo = value;
        const ctor = workInProgress.type;
        const instance = workInProgress.stateNode;

        if ((workInProgress.flags & DidCapture) === NoFlags$1 && (typeof ctor.getDerivedStateFromError === 'function' || instance !== null && typeof instance.componentDidCatch === 'function' && !isAlreadyFailedLegacyErrorBoundary(instance))) {
          workInProgress.flags |= ShouldCapture;
          const lane = pickArbitraryLane(rootRenderLanes);
          workInProgress.lanes = mergeLanes(workInProgress.lanes, lane); // Schedule the error boundary to re-render using updated state

          const update = createClassErrorUpdate(workInProgress, errorInfo, lane);
          enqueueCapturedUpdate(workInProgress, update);
          return;
        }

        break;
    } // $FlowFixMe[incompatible-type] we bail out when we get a null


    workInProgress = workInProgress.return;
  } while (workInProgress !== null);
}

const ReactCurrentOwner$1 = ReactSharedInternals.ReactCurrentOwner; // A special exception that's used to unwind the stack when an update flows
// into a dehydrated boundary.

const SelectiveHydrationException = Error(formatProdErrorMessage(461));
let didReceiveUpdate = false;

function reconcileChildren(current, workInProgress, nextChildren, renderLanes) {
  if (current === null) {
    // If this is a fresh new component that hasn't been rendered yet, we
    // won't update its child set by applying minimal side-effects. Instead,
    // we will add them all to the child before it gets rendered. That means
    // we can optimize this reconciliation pass by not tracking side-effects.
    workInProgress.child = mountChildFibers(workInProgress, null, nextChildren, renderLanes);
  } else {
    // If the current child is the same as the work in progress, it means that
    // we haven't yet started any work on these children. Therefore, we use
    // the clone algorithm to create a copy of all the current children.
    // If we had any progressed work already, that is invalid at this point so
    // let's throw it out.
    workInProgress.child = reconcileChildFibers(workInProgress, current.child, nextChildren, renderLanes);
  }
}

function forceUnmountCurrentAndReconcile(current, workInProgress, nextChildren, renderLanes) {
  // This function is fork of reconcileChildren. It's used in cases where we
  // want to reconcile without matching against the existing set. This has the
  // effect of all current children being unmounted; even if the type and key
  // are the same, the old child is unmounted and a new child is created.
  //
  // To do this, we're going to go through the reconcile algorithm twice. In
  // the first pass, we schedule a deletion for all the current children by
  // passing null.
  workInProgress.child = reconcileChildFibers(workInProgress, current.child, null, renderLanes); // In the second pass, we mount the new children. The trick here is that we
  // pass null in place of where we usually pass the current child set. This has
  // the effect of remounting all children regardless of whether their
  // identities match.

  workInProgress.child = reconcileChildFibers(workInProgress, null, nextChildren, renderLanes);
}

function updateForwardRef(current, workInProgress, Component, nextProps, renderLanes) {

  const render = Component.render;
  const ref = workInProgress.ref; // The rest is a fork of updateFunctionComponent

  let nextChildren;
  let hasId;
  prepareToReadContext(workInProgress, renderLanes);

  {
    markComponentRenderStarted(workInProgress);
  }

  {
    nextChildren = renderWithHooks(current, workInProgress, render, nextProps, ref, renderLanes);
    hasId = checkDidRenderIdHook();
  }

  {
    markComponentRenderStopped();
  }

  if (current !== null && !didReceiveUpdate) {
    bailoutHooks(current, workInProgress, renderLanes);
    return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
  }

  if (getIsHydrating() && hasId) {
    pushMaterializedTreeId(workInProgress);
  } // React DevTools reads this flag.


  workInProgress.flags |= PerformedWork;
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}

function updateMemoComponent(current, workInProgress, Component, nextProps, renderLanes) {
  if (current === null) {
    const type = Component.type;

    if (isSimpleFunctionComponent(type) && Component.compare === null && // SimpleMemoComponent codepath doesn't resolve outer props either.
    Component.defaultProps === undefined) {
      let resolvedType = type;
      // and with only the default shallow comparison, we upgrade it
      // to a SimpleMemoComponent to allow fast path updates.


      workInProgress.tag = SimpleMemoComponent;
      workInProgress.type = resolvedType;

      return updateSimpleMemoComponent(current, workInProgress, resolvedType, nextProps, renderLanes);
    }

    const child = createFiberFromTypeAndProps(Component.type, null, nextProps, null, workInProgress, workInProgress.mode, renderLanes);
    child.ref = workInProgress.ref;
    child.return = workInProgress;
    workInProgress.child = child;
    return child;
  }

  const currentChild = current.child; // This is always exactly one child

  const hasScheduledUpdateOrContext = checkScheduledUpdateOrContext(current, renderLanes);

  if (!hasScheduledUpdateOrContext) {
    // This will be the props with resolved defaultProps,
    // unlike current.memoizedProps which will be the unresolved ones.
    const prevProps = currentChild.memoizedProps; // Default to shallow comparison

    let compare = Component.compare;
    compare = compare !== null ? compare : shallowEqual;

    if (compare(prevProps, nextProps) && current.ref === workInProgress.ref) {
      return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
    }
  } // React DevTools reads this flag.


  workInProgress.flags |= PerformedWork;
  const newChild = createWorkInProgress(currentChild, nextProps);
  newChild.ref = workInProgress.ref;
  newChild.return = workInProgress;
  workInProgress.child = newChild;
  return newChild;
}

function updateSimpleMemoComponent(current, workInProgress, Component, nextProps, renderLanes) {

  if (current !== null) {
    const prevProps = current.memoizedProps;

    if (shallowEqual(prevProps, nextProps) && current.ref === workInProgress.ref && ( // Prevent bailout if the implementation changed due to hot reload.
    true)) {
      didReceiveUpdate = false; // The props are shallowly equal. Reuse the previous props object, like we
      // would during a normal fiber bailout.
      //
      // We don't have strong guarantees that the props object is referentially
      // equal during updates where we can't bail out anyway — like if the props
      // are shallowly equal, but there's a local state or context update in the
      // same batch.
      //
      // However, as a principle, we should aim to make the behavior consistent
      // across different ways of memoizing a component. For example, React.memo
      // has a different internal Fiber layout if you pass a normal function
      // component (SimpleMemoComponent) versus if you pass a different type
      // like forwardRef (MemoComponent). But this is an implementation detail.
      // Wrapping a component in forwardRef (or React.lazy, etc) shouldn't
      // affect whether the props object is reused during a bailout.

      workInProgress.pendingProps = nextProps = prevProps;

      if (!checkScheduledUpdateOrContext(current, renderLanes)) {
        // The pending lanes were cleared at the beginning of beginWork. We're
        // about to bail out, but there might be other lanes that weren't
        // included in the current render. Usually, the priority level of the
        // remaining updates is accumulated during the evaluation of the
        // component (i.e. when processing the update queue). But since since
        // we're bailing out early *without* evaluating the component, we need
        // to account for it here, too. Reset to the value of the current fiber.
        // NOTE: This only applies to SimpleMemoComponent, not MemoComponent,
        // because a MemoComponent fiber does not have hooks or an update queue;
        // rather, it wraps around an inner component, which may or may not
        // contains hooks.
        // TODO: Move the reset at in beginWork out of the common path so that
        // this is no longer necessary.
        workInProgress.lanes = current.lanes;
        return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
      } else if ((current.flags & ForceUpdateForLegacySuspense) !== NoFlags$1) {
        // This is a special case that only exists for legacy mode.
        // See https://github.com/facebook/react/pull/19216.
        didReceiveUpdate = true;
      }
    }
  }

  return updateFunctionComponent(current, workInProgress, Component, nextProps, renderLanes);
}

function updateOffscreenComponent(current, workInProgress, renderLanes) {
  const nextProps = workInProgress.pendingProps;
  const nextChildren = nextProps.children;
  const nextIsDetached = (workInProgress.stateNode._pendingVisibility & OffscreenDetached) !== 0;
  const prevState = current !== null ? current.memoizedState : null;
  markRef$1(current, workInProgress);

  if (nextProps.mode === 'hidden' || enableLegacyHidden  || nextIsDetached) {
    // Rendering a hidden tree.
    const didSuspend = (workInProgress.flags & DidCapture) !== NoFlags$1;

    if (didSuspend) {
      // Something suspended inside a hidden tree
      // Include the base lanes from the last render
      const nextBaseLanes = prevState !== null ? mergeLanes(prevState.baseLanes, renderLanes) : renderLanes;

      if (current !== null) {
        // Reset to the current children
        let currentChild = workInProgress.child = current.child; // The current render suspended, but there may be other lanes with
        // pending work. We can't read `childLanes` from the current Offscreen
        // fiber because we reset it when it was deferred; however, we can read
        // the pending lanes from the child fibers.

        let currentChildLanes = NoLanes;

        while (currentChild !== null) {
          currentChildLanes = mergeLanes(mergeLanes(currentChildLanes, currentChild.lanes), currentChild.childLanes);
          currentChild = currentChild.sibling;
        }

        const lanesWeJustAttempted = nextBaseLanes;
        const remainingChildLanes = removeLanes(currentChildLanes, lanesWeJustAttempted);
        workInProgress.childLanes = remainingChildLanes;
      } else {
        workInProgress.childLanes = NoLanes;
        workInProgress.child = null;
      }

      return deferHiddenOffscreenComponent(current, workInProgress, nextBaseLanes);
    }

    if ((workInProgress.mode & ConcurrentMode) === NoMode) {
      // In legacy sync mode, don't defer the subtree. Render it now.
      // TODO: Consider how Offscreen should work with transitions in the future
      const nextState = {
        baseLanes: NoLanes,
        cachePool: null
      };
      workInProgress.memoizedState = nextState;

      {
        // push the cache pool even though we're going to bail out
        // because otherwise there'd be a context mismatch
        if (current !== null) {
          pushTransition(workInProgress, null);
        }
      }

      reuseHiddenContextOnStack();
      pushOffscreenSuspenseHandler(workInProgress);
    } else if (!includesSomeLane(renderLanes, OffscreenLane)) {
      // We're hidden, and we're not rendering at Offscreen. We will bail out
      // and resume this tree later.
      // Schedule this fiber to re-render at Offscreen priority
      workInProgress.lanes = workInProgress.childLanes = laneToLanes(OffscreenLane); // Include the base lanes from the last render

      const nextBaseLanes = prevState !== null ? mergeLanes(prevState.baseLanes, renderLanes) : renderLanes;
      return deferHiddenOffscreenComponent(current, workInProgress, nextBaseLanes);
    } else {
      // This is the second render. The surrounding visible content has already
      // committed. Now we resume rendering the hidden tree.
      // Rendering at offscreen, so we can clear the base lanes.
      const nextState = {
        baseLanes: NoLanes,
        cachePool: null
      };
      workInProgress.memoizedState = nextState;

      if (current !== null) {
        // If the render that spawned this one accessed the cache pool, resume
        // using the same cache. Unless the parent changed, since that means
        // there was a refresh.
        const prevCachePool = prevState !== null ? prevState.cachePool : null; // TODO: Consider if and how Offscreen pre-rendering should
        // be attributed to the transition that spawned it

        pushTransition(workInProgress, prevCachePool);
      } // Push the lanes that were skipped when we bailed out.


      if (prevState !== null) {
        pushHiddenContext(workInProgress, prevState);
      } else {
        reuseHiddenContextOnStack();
      }

      pushOffscreenSuspenseHandler(workInProgress);
    }
  } else {
    // Rendering a visible tree.
    if (prevState !== null) {
      // We're going from hidden -> visible.
      let prevCachePool = null;

      {
        // If the render that spawned this one accessed the cache pool, resume
        // using the same cache. Unless the parent changed, since that means
        // there was a refresh.
        prevCachePool = prevState.cachePool;
      }

      pushTransition(workInProgress, prevCachePool); // Push the lanes that were skipped when we bailed out.

      pushHiddenContext(workInProgress, prevState);
      reuseSuspenseHandlerOnStack(workInProgress); // Since we're not hidden anymore, reset the state

      workInProgress.memoizedState = null;
    } else {
      // We weren't previously hidden, and we still aren't, so there's nothing
      // special to do. Need to push to the stack regardless, though, to avoid
      // a push/pop misalignment.
      {
        // If the render that spawned this one accessed the cache pool, resume
        // using the same cache. Unless the parent changed, since that means
        // there was a refresh.
        if (current !== null) {
          pushTransition(workInProgress, null);
        }
      } // We're about to bail out, but we need to push this to the stack anyway
      // to avoid a push/pop misalignment.


      reuseHiddenContextOnStack();
      reuseSuspenseHandlerOnStack(workInProgress);
    }
  }

  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}

function deferHiddenOffscreenComponent(current, workInProgress, nextBaseLanes, renderLanes) {
  const nextState = {
    baseLanes: nextBaseLanes,
    // Save the cache pool so we can resume later.
    cachePool: getOffscreenDeferredCache() 
  };
  workInProgress.memoizedState = nextState;

  {
    // push the cache pool even though we're going to bail out
    // because otherwise there'd be a context mismatch
    if (current !== null) {
      pushTransition(workInProgress, null);
    }
  } // We're about to bail out, but we need to push this to the stack anyway
  // to avoid a push/pop misalignment.


  reuseHiddenContextOnStack();
  pushOffscreenSuspenseHandler(workInProgress);

  return null;
} // Note: These happen to have identical begin phases, for now. We shouldn't hold

function updateCacheComponent(current, workInProgress, renderLanes) {

  prepareToReadContext(workInProgress, renderLanes);
  const parentCache = readContext(CacheContext);

  if (current === null) {
    // Initial mount. Request a fresh cache from the pool.
    const freshCache = requestCacheFromPool(renderLanes);
    const initialState = {
      parent: parentCache,
      cache: freshCache
    };
    workInProgress.memoizedState = initialState;
    initializeUpdateQueue(workInProgress);
    pushCacheProvider(workInProgress, freshCache);
  } else {
    // Check for updates
    if (includesSomeLane(current.lanes, renderLanes)) {
      cloneUpdateQueue(current, workInProgress);
      processUpdateQueue(workInProgress, null, null, renderLanes);
    }

    const prevState = current.memoizedState;
    const nextState = workInProgress.memoizedState; // Compare the new parent cache to the previous to see detect there was
    // a refresh.

    if (prevState.parent !== parentCache) {
      // Refresh in parent. Update the parent.
      const derivedState = {
        parent: parentCache,
        cache: parentCache
      }; // Copied from getDerivedStateFromProps implementation. Once the update
      // queue is empty, persist the derived state onto the base state.

      workInProgress.memoizedState = derivedState;

      if (workInProgress.lanes === NoLanes) {
        const updateQueue = workInProgress.updateQueue;
        workInProgress.memoizedState = updateQueue.baseState = derivedState;
      }

      pushCacheProvider(workInProgress, parentCache); // No need to propagate a context change because the refreshed parent
      // already did.
    } else {
      // The parent didn't refresh. Now check if this cache did.
      const nextCache = nextState.cache;
      pushCacheProvider(workInProgress, nextCache);

      if (nextCache !== prevState.cache) {
        // This cache refreshed. Propagate a context change.
        propagateContextChange(workInProgress, CacheContext, renderLanes);
      }
    }
  }

  const nextChildren = workInProgress.pendingProps.children;
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
} // This should only be called if the name changes

function updateFragment(current, workInProgress, renderLanes) {
  const nextChildren = workInProgress.pendingProps;
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}

function updateMode(current, workInProgress, renderLanes) {
  const nextChildren = workInProgress.pendingProps.children;
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}

function updateProfiler(current, workInProgress, renderLanes) {
  {
    workInProgress.flags |= Update;

    {
      // Reset effect durations for the next eventual effect phase.
      // These are reset during render to allow the DevTools commit hook a chance to read them,
      const stateNode = workInProgress.stateNode;
      stateNode.effectDuration = 0;
      stateNode.passiveEffectDuration = 0;
    }
  }

  const nextProps = workInProgress.pendingProps;
  const nextChildren = nextProps.children;
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}

function markRef$1(current, workInProgress) {
  const ref = workInProgress.ref;

  if (current === null && ref !== null || current !== null && current.ref !== ref) {
    // Schedule a Ref effect
    workInProgress.flags |= Ref;
    workInProgress.flags |= RefStatic;
  }
}

function updateFunctionComponent(current, workInProgress, Component, nextProps, renderLanes) {

  let context;

  {
    const unmaskedContext = getUnmaskedContext(workInProgress, Component, true);
    context = getMaskedContext(workInProgress, unmaskedContext);
  }

  let nextChildren;
  let hasId;
  prepareToReadContext(workInProgress, renderLanes);

  {
    markComponentRenderStarted(workInProgress);
  }

  {
    nextChildren = renderWithHooks(current, workInProgress, Component, nextProps, context, renderLanes);
    hasId = checkDidRenderIdHook();
  }

  {
    markComponentRenderStopped();
  }

  if (current !== null && !didReceiveUpdate) {
    bailoutHooks(current, workInProgress, renderLanes);
    return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
  }

  if (getIsHydrating() && hasId) {
    pushMaterializedTreeId(workInProgress);
  } // React DevTools reads this flag.


  workInProgress.flags |= PerformedWork;
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}

function replayFunctionComponent(current, workInProgress, nextProps, Component, secondArg, renderLanes) {
  // This function is used to replay a component that previously suspended,
  // after its data resolves. It's a simplified version of
  // updateFunctionComponent that reuses the hooks from the previous attempt.
  prepareToReadContext(workInProgress, renderLanes);

  {
    markComponentRenderStarted(workInProgress);
  }

  const nextChildren = replaySuspendedComponentWithHooks(current, workInProgress, Component, nextProps, secondArg);
  const hasId = checkDidRenderIdHook();

  {
    markComponentRenderStopped();
  }

  if (current !== null && !didReceiveUpdate) {
    bailoutHooks(current, workInProgress, renderLanes);
    return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
  }

  if (getIsHydrating() && hasId) {
    pushMaterializedTreeId(workInProgress);
  } // React DevTools reads this flag.


  workInProgress.flags |= PerformedWork;
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}

function updateClassComponent(current, workInProgress, Component, nextProps, renderLanes) {
  // During mounting we don't know the child context yet as the instance doesn't exist.
  // We will invalidate the child context in finishClassComponent() right after rendering.


  let hasContext;

  if (isContextProvider(Component)) {
    hasContext = true;
    pushContextProvider(workInProgress);
  } else {
    hasContext = false;
  }

  prepareToReadContext(workInProgress, renderLanes);
  const instance = workInProgress.stateNode;
  let shouldUpdate;

  if (instance === null) {
    resetSuspendedCurrentOnMountInLegacyMode(current, workInProgress); // In the initial pass we might need to construct the instance.

    constructClassInstance(workInProgress, Component, nextProps);
    mountClassInstance(workInProgress, Component, nextProps, renderLanes);
    shouldUpdate = true;
  } else if (current === null) {
    // In a resume, we'll already have an instance we can reuse.
    shouldUpdate = resumeMountClassInstance(workInProgress, Component, nextProps, renderLanes);
  } else {
    shouldUpdate = updateClassInstance(current, workInProgress, Component, nextProps, renderLanes);
  }

  const nextUnitOfWork = finishClassComponent(current, workInProgress, Component, shouldUpdate, hasContext, renderLanes);

  return nextUnitOfWork;
}

function finishClassComponent(current, workInProgress, Component, shouldUpdate, hasContext, renderLanes) {
  // Refs should update even if shouldComponentUpdate returns false
  markRef$1(current, workInProgress);
  const didCaptureError = (workInProgress.flags & DidCapture) !== NoFlags$1;

  if (!shouldUpdate && !didCaptureError) {
    // Context providers should defer to sCU for rendering
    if (hasContext) {
      invalidateContextProvider(workInProgress, Component, false);
    }

    return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
  }

  const instance = workInProgress.stateNode; // Rerender

  ReactCurrentOwner$1.current = workInProgress;
  let nextChildren;

  if (didCaptureError && typeof Component.getDerivedStateFromError !== 'function') {
    // If we captured an error, but getDerivedStateFromError is not defined,
    // unmount all the children. componentDidCatch will schedule an update to
    // re-render a fallback. This is temporary until we migrate everyone to
    // the new API.
    // TODO: Warn in a future release.
    nextChildren = null;

    {
      stopProfilerTimerIfRunning();
    }
  } else {
    {
      markComponentRenderStarted(workInProgress);
    }

    {
      nextChildren = instance.render();
    }

    {
      markComponentRenderStopped();
    }
  } // React DevTools reads this flag.


  workInProgress.flags |= PerformedWork;

  if (current !== null && didCaptureError) {
    // If we're recovering from an error, reconcile without reusing any of
    // the existing children. Conceptually, the normal children and the children
    // that are shown on error are two different sets, so we shouldn't reuse
    // normal children even if their identities match.
    forceUnmountCurrentAndReconcile(current, workInProgress, nextChildren, renderLanes);
  } else {
    reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  } // Memoize state using the values we just used to render.
  // TODO: Restructure so we never read values from the instance.


  workInProgress.memoizedState = instance.state; // The context might have changed so we need to recalculate it.

  if (hasContext) {
    invalidateContextProvider(workInProgress, Component, true);
  }

  return workInProgress.child;
}

function pushHostRootContext(workInProgress) {
  const root = workInProgress.stateNode;

  if (root.pendingContext) {
    pushTopLevelContextObject(workInProgress, root.pendingContext, root.pendingContext !== root.context);
  } else if (root.context) {
    // Should always be set
    pushTopLevelContextObject(workInProgress, root.context, false);
  }

  pushHostContainer(workInProgress, root.containerInfo);
}

function updateHostRoot(current, workInProgress, renderLanes) {
  pushHostRootContext(workInProgress);

  if (current === null) {
    throw Error(formatProdErrorMessage(387));
  }

  const nextProps = workInProgress.pendingProps;
  const prevState = workInProgress.memoizedState;
  const prevChildren = prevState.element;
  cloneUpdateQueue(current, workInProgress);
  processUpdateQueue(workInProgress, nextProps, null, renderLanes);
  const nextState = workInProgress.memoizedState;

  {
    const nextCache = nextState.cache;
    pushCacheProvider(workInProgress, nextCache);

    if (nextCache !== prevState.cache) {
      // The root cache refreshed.
      propagateContextChange(workInProgress, CacheContext, renderLanes);
    }
  } // Caution: React DevTools currently depends on this property
  // being called "element".


  const nextChildren = nextState.element;

  if (prevState.isDehydrated) {
    // This is a hydration root whose shell has not yet hydrated. We should
    // attempt to hydrate.
    // Flip isDehydrated to false to indicate that when this render
    // finishes, the root will no longer be dehydrated.
    const overrideState = {
      element: nextChildren,
      isDehydrated: false,
      cache: nextState.cache
    };
    const updateQueue = workInProgress.updateQueue; // `baseState` can always be the last state because the root doesn't
    // have reducer functions so it doesn't need rebasing.

    updateQueue.baseState = overrideState;
    workInProgress.memoizedState = overrideState;

    if (workInProgress.flags & ForceClientRender) {
      // Something errored during a previous attempt to hydrate the shell, so we
      // forced a client render.
      const recoverableError = createCapturedValueAtFiber(Error(formatProdErrorMessage(423)), workInProgress);
      return mountHostRootWithoutHydrating(current, workInProgress, nextChildren, renderLanes, recoverableError);
    } else if (nextChildren !== prevChildren) {
      const recoverableError = createCapturedValueAtFiber(Error(formatProdErrorMessage(424)), workInProgress);
      return mountHostRootWithoutHydrating(current, workInProgress, nextChildren, renderLanes, recoverableError);
    } else {
      // The outermost shell has not hydrated yet. Start hydrating.
      enterHydrationState(workInProgress);
      const child = mountChildFibers(workInProgress, null, nextChildren, renderLanes);
      workInProgress.child = child;
      let node = child;

      while (node) {
        // Mark each child as hydrating. This is a fast path to know whether this
        // tree is part of a hydrating tree. This is used to determine if a child
        // node has fully mounted yet, and for scheduling event replaying.
        // Conceptually this is similar to Placement in that a new subtree is
        // inserted into the React tree here. It just happens to not need DOM
        // mutations because it already exists.
        node.flags = node.flags & ~Placement | Hydrating;
        node = node.sibling;
      }
    }
  } else {
    // Root is not dehydrated. Either this is a client-only root, or it
    // already hydrated.
    resetHydrationState();

    if (nextChildren === prevChildren) {
      return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
    }

    reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  }

  return workInProgress.child;
}

function mountHostRootWithoutHydrating(current, workInProgress, nextChildren, renderLanes, recoverableError) {
  // Revert to client rendering.
  resetHydrationState();
  queueHydrationError(recoverableError);
  workInProgress.flags |= ForceClientRender;
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}

function updateHostComponent$1(current, workInProgress, renderLanes) {
  pushHostContext(workInProgress);

  if (current === null) {
    tryToClaimNextHydratableInstance(workInProgress);
  }

  const type = workInProgress.type;
  const nextProps = workInProgress.pendingProps;
  const prevProps = current !== null ? current.memoizedProps : null;
  let nextChildren = nextProps.children;
  const isDirectTextChild = shouldSetTextContent(type, nextProps);

  if (isDirectTextChild) {
    // We special case a direct text child of a host node. This is a common
    // case. We won't handle it as a reified child. We will instead handle
    // this in the host environment that also has access to this prop. That
    // avoids allocating another HostText fiber and traversing it.
    nextChildren = null;
  } else if (prevProps !== null && shouldSetTextContent(type, prevProps)) {
    // If we're switching from a direct text child to a normal child, or to
    // empty, we need to schedule the text content to be reset.
    workInProgress.flags |= ContentReset;
  }

  {
    const memoizedState = workInProgress.memoizedState;

    if (memoizedState !== null) {
      // This fiber has been upgraded to a stateful component. The only way
      // happens currently is for form actions. We use hooks to track the
      // pending and error state of the form.
      //
      // Once a fiber is upgraded to be stateful, it remains stateful for the
      // rest of its lifetime.
      const newState = renderTransitionAwareHostComponentWithHooks(current, workInProgress, renderLanes); // If the transition state changed, propagate the change to all the
      // descendents. We use Context as an implementation detail for this.
      //
      // This is intentionally set here instead of pushHostContext because
      // pushHostContext gets called before we process the state hook, to avoid
      // a state mismatch in the event that something suspends.
      //
      // NOTE: This assumes that there cannot be nested transition providers,
      // because the only renderer that implements this feature is React DOM,
      // and forms cannot be nested. If we did support nested providers, then
      // we would need to push a context value even for host fibers that
      // haven't been upgraded yet.

      {
        HostTransitionContext._currentValue = newState;
      }

      {
        if (didReceiveUpdate) {
          if (current !== null) {
            const oldStateHook = current.memoizedState;
            const oldState = oldStateHook.memoizedState; // This uses regular equality instead of Object.is because we assume
            // that host transition state doesn't include NaN as a valid type.

            if (oldState !== newState) {
              propagateContextChange(workInProgress, HostTransitionContext, renderLanes);
            }
          }
        }
      }
    }
  }

  markRef$1(current, workInProgress);
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}

function updateHostHoistable(current, workInProgress, renderLanes) {
  markRef$1(current, workInProgress);
  const currentProps = current === null ? null : current.memoizedProps;
  const resource = workInProgress.memoizedState = getResource(workInProgress.type, currentProps, workInProgress.pendingProps);

  if (current === null) {
    if (!getIsHydrating() && resource === null) {
      // This is not a Resource Hoistable and we aren't hydrating so we construct the instance.
      workInProgress.stateNode = createHoistableInstance(workInProgress.type, workInProgress.pendingProps, getRootHostContainer(), workInProgress);
    }
  } // Resources never have reconciler managed children. It is possible for
  // the host implementation of getResource to consider children in the
  // resource construction but they will otherwise be discarded. In practice
  // this precludes all but the simplest children and Host specific warnings
  // should be implemented to warn when children are passsed when otherwise not
  // expected


  return null;
}

function updateHostSingleton(current, workInProgress, renderLanes) {
  pushHostContext(workInProgress);

  if (current === null) {
    claimHydratableSingleton(workInProgress);
  }

  const nextChildren = workInProgress.pendingProps.children;

  if (current === null && !getIsHydrating()) {
    // Similar to Portals we append Singleton children in the commit phase. So we
    // Track insertions even on mount.
    // TODO: Consider unifying this with how the root works.
    workInProgress.child = reconcileChildFibers(workInProgress, null, nextChildren, renderLanes);
  } else {
    reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  }

  markRef$1(current, workInProgress);
  return workInProgress.child;
}

function updateHostText$1(current, workInProgress) {
  if (current === null) {
    tryToClaimNextHydratableTextInstance(workInProgress);
  } // Nothing to do here. This is terminal. We'll do the completion step
  // immediately after.


  return null;
}

function mountLazyComponent(_current, workInProgress, elementType, renderLanes) {
  resetSuspendedCurrentOnMountInLegacyMode(_current, workInProgress);
  const props = workInProgress.pendingProps;
  const lazyComponent = elementType;
  const payload = lazyComponent._payload;
  const init = lazyComponent._init;
  let Component = init(payload); // Store the unwrapped component in the type.

  workInProgress.type = Component;
  const resolvedTag = workInProgress.tag = resolveLazyComponentTag(Component);
  const resolvedProps = resolveDefaultProps(Component, props);
  let child;

  switch (resolvedTag) {
    case FunctionComponent:
      {

        child = updateFunctionComponent(null, workInProgress, Component, resolvedProps, renderLanes);
        return child;
      }

    case ClassComponent:
      {

        child = updateClassComponent(null, workInProgress, Component, resolvedProps, renderLanes);
        return child;
      }

    case ForwardRef:
      {

        child = updateForwardRef(null, workInProgress, Component, resolvedProps, renderLanes);
        return child;
      }

    case MemoComponent:
      {

        child = updateMemoComponent(null, workInProgress, Component, resolveDefaultProps(Component.type, resolvedProps), // The inner type can have defaults too
        renderLanes);
        return child;
      }
  }

  let hint = '';
  // because the fact that it's a separate type of work is an
  // implementation detail.


  throw Error(formatProdErrorMessage(306, Component, hint));
}

function mountIncompleteClassComponent(_current, workInProgress, Component, nextProps, renderLanes) {
  resetSuspendedCurrentOnMountInLegacyMode(_current, workInProgress); // Promote the fiber to a class and try rendering again.

  workInProgress.tag = ClassComponent; // The rest of this function is a fork of `updateClassComponent`
  // Push context providers early to prevent context stack mismatches.
  // During mounting we don't know the child context yet as the instance doesn't exist.
  // We will invalidate the child context in finishClassComponent() right after rendering.

  let hasContext;

  if (isContextProvider(Component)) {
    hasContext = true;
    pushContextProvider(workInProgress);
  } else {
    hasContext = false;
  }

  prepareToReadContext(workInProgress, renderLanes);
  constructClassInstance(workInProgress, Component, nextProps);
  mountClassInstance(workInProgress, Component, nextProps, renderLanes);
  return finishClassComponent(null, workInProgress, Component, true, hasContext, renderLanes);
}

function mountIndeterminateComponent(_current, workInProgress, Component, renderLanes) {
  resetSuspendedCurrentOnMountInLegacyMode(_current, workInProgress);
  const props = workInProgress.pendingProps;
  let context;

  {
    const unmaskedContext = getUnmaskedContext(workInProgress, Component, false);
    context = getMaskedContext(workInProgress, unmaskedContext);
  }

  prepareToReadContext(workInProgress, renderLanes);
  let value;
  let hasId;

  {
    markComponentRenderStarted(workInProgress);
  }

  {
    value = renderWithHooks(null, workInProgress, Component, props, context, renderLanes);
    hasId = checkDidRenderIdHook();
  }

  {
    markComponentRenderStopped();
  } // React DevTools reads this flag.


  workInProgress.flags |= PerformedWork;

  if ( // Run these checks in production only if the flag is off.
  // Eventually we'll delete this branch altogether.
  typeof value === 'object' && value !== null && typeof value.render === 'function' && value.$$typeof === undefined) {


    workInProgress.tag = ClassComponent; // Throw out any hooks that were used.

    workInProgress.memoizedState = null;
    workInProgress.updateQueue = null; // Push context providers early to prevent context stack mismatches.
    // During mounting we don't know the child context yet as the instance doesn't exist.
    // We will invalidate the child context in finishClassComponent() right after rendering.

    let hasContext = false;

    if (isContextProvider(Component)) {
      hasContext = true;
      pushContextProvider(workInProgress);
    } else {
      hasContext = false;
    }

    workInProgress.memoizedState = value.state !== null && value.state !== undefined ? value.state : null;
    initializeUpdateQueue(workInProgress);
    adoptClassInstance(workInProgress, value);
    mountClassInstance(workInProgress, Component, props, renderLanes);
    return finishClassComponent(null, workInProgress, Component, true, hasContext, renderLanes);
  } else {
    // Proceed under the assumption that this is a function component
    workInProgress.tag = FunctionComponent;

    if (getIsHydrating() && hasId) {
      pushMaterializedTreeId(workInProgress);
    }

    reconcileChildren(null, workInProgress, value, renderLanes);

    return workInProgress.child;
  }
}

const SUSPENDED_MARKER = {
  dehydrated: null,
  treeContext: null,
  retryLane: NoLane
};

function mountSuspenseOffscreenState(renderLanes) {
  return {
    baseLanes: renderLanes,
    cachePool: getSuspendedCache()
  };
}

function updateSuspenseOffscreenState(prevOffscreenState, renderLanes) {
  let cachePool = null;

  {
    const prevCachePool = prevOffscreenState.cachePool;

    if (prevCachePool !== null) {
      const parentCache = CacheContext._currentValue ;

      if (prevCachePool.parent !== parentCache) {
        // Detected a refresh in the parent. This overrides any previously
        // suspended cache.
        cachePool = {
          parent: parentCache,
          pool: parentCache
        };
      } else {
        // We can reuse the cache from last time. The only thing that would have
        // overridden it is a parent refresh, which we checked for above.
        cachePool = prevCachePool;
      }
    } else {
      // If there's no previous cache pool, grab the current one.
      cachePool = getSuspendedCache();
    }
  }

  return {
    baseLanes: mergeLanes(prevOffscreenState.baseLanes, renderLanes),
    cachePool
  };
} // TODO: Probably should inline this back


function shouldRemainOnFallback(current, workInProgress, renderLanes) {
  // If we're already showing a fallback, there are cases where we need to
  // remain on that fallback regardless of whether the content has resolved.
  // For example, SuspenseList coordinates when nested content appears.
  // TODO: For compatibility with offscreen prerendering, this should also check
  // whether the current fiber (if it exists) was visible in the previous tree.
  if (current !== null) {
    const suspenseState = current.memoizedState;

    if (suspenseState === null) {
      // Currently showing content. Don't hide it, even if ForceSuspenseFallback
      // is true. More precise name might be "ForceRemainSuspenseFallback".
      // Note: This is a factoring smell. Can't remain on a fallback if there's
      // no fallback to remain on.
      return false;
    }
  } // Not currently showing content. Consult the Suspense context.


  const suspenseContext = suspenseStackCursor.current;
  return hasSuspenseListContext(suspenseContext, ForceSuspenseFallback);
}

function getRemainingWorkInPrimaryTree(current, renderLanes) {
  // TODO: Should not remove render lanes that were pinged during this render
  return removeLanes(current.childLanes, renderLanes);
}

function updateSuspenseComponent(current, workInProgress, renderLanes) {
  const nextProps = workInProgress.pendingProps; // This is used by DevTools to force a boundary to suspend.

  let showFallback = false;
  const didSuspend = (workInProgress.flags & DidCapture) !== NoFlags$1;

  if (didSuspend || shouldRemainOnFallback(current)) {
    // Something in this boundary's subtree already suspended. Switch to
    // rendering the fallback children.
    showFallback = true;
    workInProgress.flags &= ~DidCapture;
  } // OK, the next part is confusing. We're about to reconcile the Suspense
  // boundary's children. This involves some custom reconciliation logic. Two
  // main reasons this is so complicated.
  //
  // First, Legacy Mode has different semantics for backwards compatibility. The
  // primary tree will commit in an inconsistent state, so when we do the
  // second pass to render the fallback, we do some exceedingly, uh, clever
  // hacks to make that not totally break. Like transferring effects and
  // deletions from hidden tree. In Concurrent Mode, it's much simpler,
  // because we bailout on the primary tree completely and leave it in its old
  // state, no effects. Same as what we do for Offscreen (except that
  // Offscreen doesn't have the first render pass).
  //
  // Second is hydration. During hydration, the Suspense fiber has a slightly
  // different layout, where the child points to a dehydrated fragment, which
  // contains the DOM rendered by the server.
  //
  // Third, even if you set all that aside, Suspense is like error boundaries in
  // that we first we try to render one tree, and if that fails, we render again
  // and switch to a different tree. Like a try/catch block. So we have to track
  // which branch we're currently rendering. Ideally we would model this using
  // a stack.


  if (current === null) {
    // Initial mount
    // Special path for hydration
    // If we're currently hydrating, try to hydrate this boundary.
    if (getIsHydrating()) {
      // We must push the suspense handler context *before* attempting to
      // hydrate, to avoid a mismatch in case it errors.
      if (showFallback) {
        pushPrimaryTreeSuspenseHandler(workInProgress);
      } else {
        pushFallbackTreeSuspenseHandler(workInProgress);
      }

      tryToClaimNextHydratableSuspenseInstance(workInProgress); // This could've been a dehydrated suspense component.

      const suspenseState = workInProgress.memoizedState;

      if (suspenseState !== null) {
        const dehydrated = suspenseState.dehydrated;

        if (dehydrated !== null) {
          return mountDehydratedSuspenseComponent(workInProgress, dehydrated);
        }
      } // If hydration didn't succeed, fall through to the normal Suspense path.
      // To avoid a stack mismatch we need to pop the Suspense handler that we
      // pushed above. This will become less awkward when move the hydration
      // logic to its own fiber.


      popSuspenseHandler(workInProgress);
    }

    const nextPrimaryChildren = nextProps.children;
    const nextFallbackChildren = nextProps.fallback;

    if (showFallback) {
      pushFallbackTreeSuspenseHandler(workInProgress);
      const fallbackFragment = mountSuspenseFallbackChildren(workInProgress, nextPrimaryChildren, nextFallbackChildren, renderLanes);
      const primaryChildFragment = workInProgress.child;
      primaryChildFragment.memoizedState = mountSuspenseOffscreenState(renderLanes);
      workInProgress.memoizedState = SUSPENDED_MARKER;

      return fallbackFragment;
    } else if (typeof nextProps.unstable_expectedLoadTime === 'number') {
      // This is a CPU-bound tree. Skip this tree and show a placeholder to
      // unblock the surrounding content. Then immediately retry after the
      // initial commit.
      pushFallbackTreeSuspenseHandler(workInProgress);
      const fallbackFragment = mountSuspenseFallbackChildren(workInProgress, nextPrimaryChildren, nextFallbackChildren, renderLanes);
      const primaryChildFragment = workInProgress.child;
      primaryChildFragment.memoizedState = mountSuspenseOffscreenState(renderLanes);
      workInProgress.memoizedState = SUSPENDED_MARKER; // TODO: Transition Tracing is not yet implemented for CPU Suspense.
      // Since nothing actually suspended, there will nothing to ping this to
      // get it started back up to attempt the next item. While in terms of
      // priority this work has the same priority as this current render, it's
      // not part of the same transition once the transition has committed. If
      // it's sync, we still want to yield so that it can be painted.
      // Conceptually, this is really the same as pinging. We can use any
      // RetryLane even if it's the one currently rendering since we're leaving
      // it behind on this node.

      workInProgress.lanes = SomeRetryLane;
      return fallbackFragment;
    } else {
      pushPrimaryTreeSuspenseHandler(workInProgress);
      return mountSuspensePrimaryChildren(workInProgress, nextPrimaryChildren);
    }
  } else {
    // This is an update.
    // Special path for hydration
    const prevState = current.memoizedState;

    if (prevState !== null) {
      const dehydrated = prevState.dehydrated;

      if (dehydrated !== null) {
        return updateDehydratedSuspenseComponent(current, workInProgress, didSuspend, nextProps, dehydrated, prevState, renderLanes);
      }
    }

    if (showFallback) {
      pushFallbackTreeSuspenseHandler(workInProgress);
      const nextFallbackChildren = nextProps.fallback;
      const nextPrimaryChildren = nextProps.children;
      const fallbackChildFragment = updateSuspenseFallbackChildren(current, workInProgress, nextPrimaryChildren, nextFallbackChildren, renderLanes);
      const primaryChildFragment = workInProgress.child;
      const prevOffscreenState = current.child.memoizedState;
      primaryChildFragment.memoizedState = prevOffscreenState === null ? mountSuspenseOffscreenState(renderLanes) : updateSuspenseOffscreenState(prevOffscreenState, renderLanes);

      primaryChildFragment.childLanes = getRemainingWorkInPrimaryTree(current, renderLanes);
      workInProgress.memoizedState = SUSPENDED_MARKER;
      return fallbackChildFragment;
    } else {
      pushPrimaryTreeSuspenseHandler(workInProgress);
      const nextPrimaryChildren = nextProps.children;
      const primaryChildFragment = updateSuspensePrimaryChildren(current, workInProgress, nextPrimaryChildren, renderLanes);
      workInProgress.memoizedState = null;
      return primaryChildFragment;
    }
  }
}

function mountSuspensePrimaryChildren(workInProgress, primaryChildren, renderLanes) {
  const mode = workInProgress.mode;
  const primaryChildProps = {
    mode: 'visible',
    children: primaryChildren
  };
  const primaryChildFragment = mountWorkInProgressOffscreenFiber(primaryChildProps, mode);
  primaryChildFragment.return = workInProgress;
  workInProgress.child = primaryChildFragment;
  return primaryChildFragment;
}

function mountSuspenseFallbackChildren(workInProgress, primaryChildren, fallbackChildren, renderLanes) {
  const mode = workInProgress.mode;
  const progressedPrimaryFragment = workInProgress.child;
  const primaryChildProps = {
    mode: 'hidden',
    children: primaryChildren
  };
  let primaryChildFragment;
  let fallbackChildFragment;

  if ((mode & ConcurrentMode) === NoMode && progressedPrimaryFragment !== null) {
    // In legacy mode, we commit the primary tree as if it successfully
    // completed, even though it's in an inconsistent state.
    primaryChildFragment = progressedPrimaryFragment;
    primaryChildFragment.childLanes = NoLanes;
    primaryChildFragment.pendingProps = primaryChildProps;

    if (workInProgress.mode & ProfileMode) {
      // Reset the durations from the first pass so they aren't included in the
      // final amounts. This seems counterintuitive, since we're intentionally
      // not measuring part of the render phase, but this makes it match what we
      // do in Concurrent Mode.
      primaryChildFragment.actualDuration = 0;
      primaryChildFragment.actualStartTime = -1;
      primaryChildFragment.selfBaseDuration = 0;
      primaryChildFragment.treeBaseDuration = 0;
    }

    fallbackChildFragment = createFiberFromFragment(fallbackChildren, mode, renderLanes, null);
  } else {
    primaryChildFragment = mountWorkInProgressOffscreenFiber(primaryChildProps, mode);
    fallbackChildFragment = createFiberFromFragment(fallbackChildren, mode, renderLanes, null);
  }

  primaryChildFragment.return = workInProgress;
  fallbackChildFragment.return = workInProgress;
  primaryChildFragment.sibling = fallbackChildFragment;
  workInProgress.child = primaryChildFragment;
  return fallbackChildFragment;
}

function mountWorkInProgressOffscreenFiber(offscreenProps, mode, renderLanes) {
  // The props argument to `createFiberFromOffscreen` is `any` typed, so we use
  // this wrapper function to constrain it.
  return createFiberFromOffscreen(offscreenProps, mode, NoLanes, null);
}

function updateWorkInProgressOffscreenFiber(current, offscreenProps) {
  // The props argument to `createWorkInProgress` is `any` typed, so we use this
  // wrapper function to constrain it.
  return createWorkInProgress(current, offscreenProps);
}

function updateSuspensePrimaryChildren(current, workInProgress, primaryChildren, renderLanes) {
  const currentPrimaryChildFragment = current.child;
  const currentFallbackChildFragment = currentPrimaryChildFragment.sibling;
  const primaryChildFragment = updateWorkInProgressOffscreenFiber(currentPrimaryChildFragment, {
    mode: 'visible',
    children: primaryChildren
  });

  if ((workInProgress.mode & ConcurrentMode) === NoMode) {
    primaryChildFragment.lanes = renderLanes;
  }

  primaryChildFragment.return = workInProgress;
  primaryChildFragment.sibling = null;

  if (currentFallbackChildFragment !== null) {
    // Delete the fallback child fragment
    const deletions = workInProgress.deletions;

    if (deletions === null) {
      workInProgress.deletions = [currentFallbackChildFragment];
      workInProgress.flags |= ChildDeletion;
    } else {
      deletions.push(currentFallbackChildFragment);
    }
  }

  workInProgress.child = primaryChildFragment;
  return primaryChildFragment;
}

function updateSuspenseFallbackChildren(current, workInProgress, primaryChildren, fallbackChildren, renderLanes) {
  const mode = workInProgress.mode;
  const currentPrimaryChildFragment = current.child;
  const currentFallbackChildFragment = currentPrimaryChildFragment.sibling;
  const primaryChildProps = {
    mode: 'hidden',
    children: primaryChildren
  };
  let primaryChildFragment;

  if ( // In legacy mode, we commit the primary tree as if it successfully
  // completed, even though it's in an inconsistent state.
  (mode & ConcurrentMode) === NoMode && // Make sure we're on the second pass, i.e. the primary child fragment was
  // already cloned. In legacy mode, the only case where this isn't true is
  // when DevTools forces us to display a fallback; we skip the first render
  // pass entirely and go straight to rendering the fallback. (In Concurrent
  // Mode, SuspenseList can also trigger this scenario, but this is a legacy-
  // only codepath.)
  workInProgress.child !== currentPrimaryChildFragment) {
    const progressedPrimaryFragment = workInProgress.child;
    primaryChildFragment = progressedPrimaryFragment;
    primaryChildFragment.childLanes = NoLanes;
    primaryChildFragment.pendingProps = primaryChildProps;

    if (workInProgress.mode & ProfileMode) {
      // Reset the durations from the first pass so they aren't included in the
      // final amounts. This seems counterintuitive, since we're intentionally
      // not measuring part of the render phase, but this makes it match what we
      // do in Concurrent Mode.
      primaryChildFragment.actualDuration = 0;
      primaryChildFragment.actualStartTime = -1;
      primaryChildFragment.selfBaseDuration = currentPrimaryChildFragment.selfBaseDuration;
      primaryChildFragment.treeBaseDuration = currentPrimaryChildFragment.treeBaseDuration;
    } // The fallback fiber was added as a deletion during the first pass.
    // However, since we're going to remain on the fallback, we no longer want
    // to delete it.


    workInProgress.deletions = null;
  } else {
    primaryChildFragment = updateWorkInProgressOffscreenFiber(currentPrimaryChildFragment, primaryChildProps); // Since we're reusing a current tree, we need to reuse the flags, too.
    // (We don't do this in legacy mode, because in legacy mode we don't re-use
    // the current tree; see previous branch.)

    primaryChildFragment.subtreeFlags = currentPrimaryChildFragment.subtreeFlags & StaticMask;
  }

  let fallbackChildFragment;

  if (currentFallbackChildFragment !== null) {
    fallbackChildFragment = createWorkInProgress(currentFallbackChildFragment, fallbackChildren);
  } else {
    fallbackChildFragment = createFiberFromFragment(fallbackChildren, mode, renderLanes, null); // Needs a placement effect because the parent (the Suspense boundary) already
    // mounted but this is a new fiber.

    fallbackChildFragment.flags |= Placement;
  }

  fallbackChildFragment.return = workInProgress;
  primaryChildFragment.return = workInProgress;
  primaryChildFragment.sibling = fallbackChildFragment;
  workInProgress.child = primaryChildFragment;
  return fallbackChildFragment;
}

function retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes, recoverableError) {
  // Falling back to client rendering. Because this has performance
  // implications, it's considered a recoverable error, even though the user
  // likely won't observe anything wrong with the UI.
  //
  // The error is passed in as an argument to enforce that every caller provide
  // a custom message, or explicitly opt out (currently the only path that opts
  // out is legacy mode; every concurrent path provides an error).
  if (recoverableError !== null) {
    queueHydrationError(recoverableError);
  } // This will add the old fiber to the deletion list


  reconcileChildFibers(workInProgress, current.child, null, renderLanes); // We're now not suspended nor dehydrated.

  const nextProps = workInProgress.pendingProps;
  const primaryChildren = nextProps.children;
  const primaryChildFragment = mountSuspensePrimaryChildren(workInProgress, primaryChildren); // Needs a placement effect because the parent (the Suspense boundary) already
  // mounted but this is a new fiber.

  primaryChildFragment.flags |= Placement;
  workInProgress.memoizedState = null;
  return primaryChildFragment;
}

function mountSuspenseFallbackAfterRetryWithoutHydrating(current, workInProgress, primaryChildren, fallbackChildren, renderLanes) {
  const fiberMode = workInProgress.mode;
  const primaryChildProps = {
    mode: 'visible',
    children: primaryChildren
  };
  const primaryChildFragment = mountWorkInProgressOffscreenFiber(primaryChildProps, fiberMode);
  const fallbackChildFragment = createFiberFromFragment(fallbackChildren, fiberMode, renderLanes, null); // Needs a placement effect because the parent (the Suspense
  // boundary) already mounted but this is a new fiber.

  fallbackChildFragment.flags |= Placement;
  primaryChildFragment.return = workInProgress;
  fallbackChildFragment.return = workInProgress;
  primaryChildFragment.sibling = fallbackChildFragment;
  workInProgress.child = primaryChildFragment;

  if ((workInProgress.mode & ConcurrentMode) !== NoMode) {
    // We will have dropped the effect list which contains the
    // deletion. We need to reconcile to delete the current child.
    reconcileChildFibers(workInProgress, current.child, null, renderLanes);
  }

  return fallbackChildFragment;
}

function mountDehydratedSuspenseComponent(workInProgress, suspenseInstance, renderLanes) {
  // During the first pass, we'll bail out and not drill into the children.
  // Instead, we'll leave the content in place and try to hydrate it later.
  if ((workInProgress.mode & ConcurrentMode) === NoMode) {

    workInProgress.lanes = laneToLanes(SyncLane);
  } else if (isSuspenseInstanceFallback(suspenseInstance)) {
    // This is a client-only boundary. Since we won't get any content from the server
    // for this, we need to schedule that at a higher priority based on when it would
    // have timed out. In theory we could render it in this pass but it would have the
    // wrong priority associated with it and will prevent hydration of parent path.
    // Instead, we'll leave work left on it to render it in a separate commit.
    // TODO This time should be the time at which the server rendered response that is
    // a parent to this boundary was displayed. However, since we currently don't have
    // a protocol to transfer that time, we'll just estimate it by using the current
    // time. This will mean that Suspense timeouts are slightly shifted to later than
    // they should be.
    // Schedule a normal pri update to render this content.
    workInProgress.lanes = laneToLanes(DefaultHydrationLane);
  } else {
    // We'll continue hydrating the rest at offscreen priority since we'll already
    // be showing the right content coming from the server, it is no rush.
    workInProgress.lanes = laneToLanes(OffscreenLane);
  }

  return null;
}

function updateDehydratedSuspenseComponent(current, workInProgress, didSuspend, nextProps, suspenseInstance, suspenseState, renderLanes) {
  if (!didSuspend) {
    // This is the first render pass. Attempt to hydrate.
    pushPrimaryTreeSuspenseHandler(workInProgress); // We should never be hydrating at this point because it is the first pass,

    if ((workInProgress.mode & ConcurrentMode) === NoMode) {
      return retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes, null);
    }

    if (isSuspenseInstanceFallback(suspenseInstance)) {
      // This boundary is in a permanent fallback state. In this case, we'll never
      // get an update and we'll never be able to hydrate the final content. Let's just try the
      // client side render instead.
      let digest;
      let stack;

      {
        var _getSuspenseInstanceF2 = getSuspenseInstanceFallbackErrorDetails(suspenseInstance);

        digest = _getSuspenseInstanceF2.digest;
      }

      let capturedValue = null; // TODO: Figure out a better signal than encoding a magic digest value.

      if (digest !== 'POSTPONE') {
        let error;

        {
          error = Error(formatProdErrorMessage(419));
        }

        error.digest = digest;
        capturedValue = createCapturedValue(error, digest, stack);
      }

      return retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes, capturedValue);
    }
    // any context has changed, we need to treat is as if the input might have changed.


    const hasContextChanged = includesSomeLane(renderLanes, current.childLanes);

    if (didReceiveUpdate || hasContextChanged) {
      // This boundary has changed since the first render. This means that we are now unable to
      // hydrate it. We might still be able to hydrate it using a higher priority lane.
      const root = getWorkInProgressRoot();

      if (root !== null) {
        const attemptHydrationAtLane = getBumpedLaneForHydration(root, renderLanes);

        if (attemptHydrationAtLane !== NoLane && attemptHydrationAtLane !== suspenseState.retryLane) {
          // Intentionally mutating since this render will get interrupted. This
          // is one of the very rare times where we mutate the current tree
          // during the render phase.
          suspenseState.retryLane = attemptHydrationAtLane;
          enqueueConcurrentRenderForLane(current, attemptHydrationAtLane);
          scheduleUpdateOnFiber(root, current, attemptHydrationAtLane); // Throw a special object that signals to the work loop that it should
          // interrupt the current render.
          //
          // Because we're inside a React-only execution stack, we don't
          // strictly need to throw here — we could instead modify some internal
          // work loop state. But using an exception means we don't need to
          // check for this case on every iteration of the work loop. So doing
          // it this way moves the check out of the fast path.

          throw SelectiveHydrationException;
        }
      } // If we did not selectively hydrate, we'll continue rendering without
      // hydrating. Mark this tree as suspended to prevent it from committing
      // outside a transition.
      //
      // This path should only happen if the hydration lane already suspended.
      // Currently, it also happens during sync updates because there is no
      // hydration lane for sync updates.
      // TODO: We should ideally have a sync hydration lane that we can apply to do
      // a pass where we hydrate this subtree in place using the previous Context and then
      // reapply the update afterwards.


      if (isSuspenseInstancePending(suspenseInstance)) ; else {
        renderDidSuspendDelayIfPossible();
      }

      return retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes, null);
    } else if (isSuspenseInstancePending(suspenseInstance)) {
      // This component is still pending more data from the server, so we can't hydrate its
      // content. We treat it as if this component suspended itself. It might seem as if
      // we could just try to render it client-side instead. However, this will perform a
      // lot of unnecessary work and is unlikely to complete since it often will suspend
      // on missing data anyway. Additionally, the server might be able to render more
      // than we can on the client yet. In that case we'd end up with more fallback states
      // on the client than if we just leave it alone. If the server times out or errors
      // these should update this boundary to the permanent Fallback state instead.
      // Mark it as having captured (i.e. suspended).
      workInProgress.flags |= DidCapture; // Leave the child in place. I.e. the dehydrated fragment.

      workInProgress.child = current.child; // Register a callback to retry this boundary once the server has sent the result.

      const retry = retryDehydratedSuspenseBoundary.bind(null, current);
      registerSuspenseInstanceRetry(suspenseInstance, retry);
      return null;
    } else {
      // This is the first attempt.
      reenterHydrationStateFromDehydratedSuspenseInstance(workInProgress, suspenseInstance, suspenseState.treeContext);
      const primaryChildren = nextProps.children;
      const primaryChildFragment = mountSuspensePrimaryChildren(workInProgress, primaryChildren); // Mark the children as hydrating. This is a fast path to know whether this
      // tree is part of a hydrating tree. This is used to determine if a child
      // node has fully mounted yet, and for scheduling event replaying.
      // Conceptually this is similar to Placement in that a new subtree is
      // inserted into the React tree here. It just happens to not need DOM
      // mutations because it already exists.

      primaryChildFragment.flags |= Hydrating;
      return primaryChildFragment;
    }
  } else {
    // This is the second render pass. We already attempted to hydrated, but
    // something either suspended or errored.
    if (workInProgress.flags & ForceClientRender) {
      // Something errored during hydration. Try again without hydrating.
      pushPrimaryTreeSuspenseHandler(workInProgress);
      workInProgress.flags &= ~ForceClientRender;
      const capturedValue = createCapturedValue(Error(formatProdErrorMessage(422)));
      return retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes, capturedValue);
    } else if (workInProgress.memoizedState !== null) {
      // Something suspended and we should still be in dehydrated mode.
      // Leave the existing child in place.
      // Push to avoid a mismatch
      pushFallbackTreeSuspenseHandler(workInProgress);
      workInProgress.child = current.child; // The dehydrated completion pass expects this flag to be there
      // but the normal suspense pass doesn't.

      workInProgress.flags |= DidCapture;
      return null;
    } else {
      // Suspended but we should no longer be in dehydrated mode.
      // Therefore we now have to render the fallback.
      pushFallbackTreeSuspenseHandler(workInProgress);
      const nextPrimaryChildren = nextProps.children;
      const nextFallbackChildren = nextProps.fallback;
      const fallbackChildFragment = mountSuspenseFallbackAfterRetryWithoutHydrating(current, workInProgress, nextPrimaryChildren, nextFallbackChildren, renderLanes);
      const primaryChildFragment = workInProgress.child;
      primaryChildFragment.memoizedState = mountSuspenseOffscreenState(renderLanes);
      workInProgress.memoizedState = SUSPENDED_MARKER;
      return fallbackChildFragment;
    }
  }
}

function scheduleSuspenseWorkOnFiber(fiber, renderLanes, propagationRoot) {
  fiber.lanes = mergeLanes(fiber.lanes, renderLanes);
  const alternate = fiber.alternate;

  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, renderLanes);
  }

  scheduleContextWorkOnParentPath(fiber.return, renderLanes, propagationRoot);
}

function propagateSuspenseContextChange(workInProgress, firstChild, renderLanes) {
  // Mark any Suspense boundaries with fallbacks as having work to do.
  // If they were previously forced into fallbacks, they may now be able
  // to unblock.
  let node = firstChild;

  while (node !== null) {
    if (node.tag === SuspenseComponent) {
      const state = node.memoizedState;

      if (state !== null) {
        scheduleSuspenseWorkOnFiber(node, renderLanes, workInProgress);
      }
    } else if (node.tag === SuspenseListComponent) {
      // If the tail is hidden there might not be an Suspense boundaries
      // to schedule work on. In this case we have to schedule it on the
      // list itself.
      // We don't have to traverse to the children of the list since
      // the list will propagate the change when it rerenders.
      scheduleSuspenseWorkOnFiber(node, renderLanes, workInProgress);
    } else if (node.child !== null) {
      node.child.return = node;
      node = node.child;
      continue;
    }

    if (node === workInProgress) {
      return;
    } // $FlowFixMe[incompatible-use] found when upgrading Flow


    while (node.sibling === null) {
      // $FlowFixMe[incompatible-use] found when upgrading Flow
      if (node.return === null || node.return === workInProgress) {
        return;
      }

      node = node.return;
    } // $FlowFixMe[incompatible-use] found when upgrading Flow


    node.sibling.return = node.return;
    node = node.sibling;
  }
}

function findLastContentRow(firstChild) {
  // This is going to find the last row among these children that is already
  // showing content on the screen, as opposed to being in fallback state or
  // new. If a row has multiple Suspense boundaries, any of them being in the
  // fallback state, counts as the whole row being in a fallback state.
  // Note that the "rows" will be workInProgress, but any nested children
  // will still be current since we haven't rendered them yet. The mounted
  // order may not be the same as the new order. We use the new order.
  let row = firstChild;
  let lastContentRow = null;

  while (row !== null) {
    const currentRow = row.alternate; // New rows can't be content rows.

    if (currentRow !== null && findFirstSuspended(currentRow) === null) {
      lastContentRow = row;
    }

    row = row.sibling;
  }

  return lastContentRow;
}

function initSuspenseListRenderState(workInProgress, isBackwards, tail, lastContentRow, tailMode) {
  const renderState = workInProgress.memoizedState;

  if (renderState === null) {
    workInProgress.memoizedState = {
      isBackwards: isBackwards,
      rendering: null,
      renderingStartTime: 0,
      last: lastContentRow,
      tail: tail,
      tailMode: tailMode
    };
  } else {
    // We can reuse the existing object from previous renders.
    renderState.isBackwards = isBackwards;
    renderState.rendering = null;
    renderState.renderingStartTime = 0;
    renderState.last = lastContentRow;
    renderState.tail = tail;
    renderState.tailMode = tailMode;
  }
} // This can end up rendering this component multiple passes.
// The first pass splits the children fibers into two sets. A head and tail.
// We first render the head. If anything is in fallback state, we do another
// pass through beginWork to rerender all children (including the tail) with
// the force suspend context. If the first render didn't have anything in
// in fallback state. Then we render each row in the tail one-by-one.
// That happens in the completeWork phase without going back to beginWork.


function updateSuspenseListComponent(current, workInProgress, renderLanes) {
  const nextProps = workInProgress.pendingProps;
  const revealOrder = nextProps.revealOrder;
  const tailMode = nextProps.tail;
  const newChildren = nextProps.children;
  reconcileChildren(current, workInProgress, newChildren, renderLanes);
  let suspenseContext = suspenseStackCursor.current;
  const shouldForceFallback = hasSuspenseListContext(suspenseContext, ForceSuspenseFallback);

  if (shouldForceFallback) {
    suspenseContext = setShallowSuspenseListContext(suspenseContext, ForceSuspenseFallback);
    workInProgress.flags |= DidCapture;
  } else {
    const didSuspendBefore = current !== null && (current.flags & DidCapture) !== NoFlags$1;

    if (didSuspendBefore) {
      // If we previously forced a fallback, we need to schedule work
      // on any nested boundaries to let them know to try to render
      // again. This is the same as context updating.
      propagateSuspenseContextChange(workInProgress, workInProgress.child, renderLanes);
    }

    suspenseContext = setDefaultShallowSuspenseListContext(suspenseContext);
  }

  pushSuspenseListContext(workInProgress, suspenseContext);

  if ((workInProgress.mode & ConcurrentMode) === NoMode) {
    // In legacy mode, SuspenseList doesn't work so we just
    // use make it a noop by treating it as the default revealOrder.
    workInProgress.memoizedState = null;
  } else {
    switch (revealOrder) {
      case 'forwards':
        {
          const lastContentRow = findLastContentRow(workInProgress.child);
          let tail;

          if (lastContentRow === null) {
            // The whole list is part of the tail.
            // TODO: We could fast path by just rendering the tail now.
            tail = workInProgress.child;
            workInProgress.child = null;
          } else {
            // Disconnect the tail rows after the content row.
            // We're going to render them separately later.
            tail = lastContentRow.sibling;
            lastContentRow.sibling = null;
          }

          initSuspenseListRenderState(workInProgress, false, // isBackwards
          tail, lastContentRow, tailMode);
          break;
        }

      case 'backwards':
        {
          // We're going to find the first row that has existing content.
          // At the same time we're going to reverse the list of everything
          // we pass in the meantime. That's going to be our tail in reverse
          // order.
          let tail = null;
          let row = workInProgress.child;
          workInProgress.child = null;

          while (row !== null) {
            const currentRow = row.alternate; // New rows can't be content rows.

            if (currentRow !== null && findFirstSuspended(currentRow) === null) {
              // This is the beginning of the main content.
              workInProgress.child = row;
              break;
            }

            const nextRow = row.sibling;
            row.sibling = tail;
            tail = row;
            row = nextRow;
          } // TODO: If workInProgress.child is null, we can continue on the tail immediately.


          initSuspenseListRenderState(workInProgress, true, // isBackwards
          tail, null, // last
          tailMode);
          break;
        }

      case 'together':
        {
          initSuspenseListRenderState(workInProgress, false, // isBackwards
          null, // tail
          null, // last
          undefined);
          break;
        }

      default:
        {
          // The default reveal order is the same as not having
          // a boundary.
          workInProgress.memoizedState = null;
        }
    }
  }

  return workInProgress.child;
}

function updatePortalComponent(current, workInProgress, renderLanes) {
  pushHostContainer(workInProgress, workInProgress.stateNode.containerInfo);
  const nextChildren = workInProgress.pendingProps;

  if (current === null) {
    // Portals are special because we don't append the children during mount
    // but at commit. Therefore we need to track insertions which the normal
    // flow doesn't do during mount. This doesn't happen at the root because
    // the root always starts with a "current" with a null child.
    // TODO: Consider unifying this with how the root works.
    workInProgress.child = reconcileChildFibers(workInProgress, null, nextChildren, renderLanes);
  } else {
    reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  }

  return workInProgress.child;
}

function updateContextProvider(current, workInProgress, renderLanes) {
  const providerType = workInProgress.type;
  const context = providerType._context;
  const newProps = workInProgress.pendingProps;
  const oldProps = workInProgress.memoizedProps;
  const newValue = newProps.value;

  pushProvider(workInProgress, context, newValue);

  {
    if (oldProps !== null) {
      const oldValue = oldProps.value;

      if (objectIs(oldValue, newValue)) {
        // No change. Bailout early if children are the same.
        if (oldProps.children === newProps.children && !hasContextChanged()) {
          return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
        }
      } else {
        // The context value changed. Search for matching consumers and schedule
        // them to update.
        propagateContextChange(workInProgress, context, renderLanes);
      }
    }
  }

  const newChildren = newProps.children;
  reconcileChildren(current, workInProgress, newChildren, renderLanes);
  return workInProgress.child;
}

function updateContextConsumer(current, workInProgress, renderLanes) {
  let context = workInProgress.type; // The logic below for Context differs depending on PROD or DEV mode. In

  const newProps = workInProgress.pendingProps;
  const render = newProps.children;

  prepareToReadContext(workInProgress, renderLanes);
  const newValue = readContext(context);

  {
    markComponentRenderStarted(workInProgress);
  }

  let newChildren;

  {
    newChildren = render(newValue);
  }

  {
    markComponentRenderStopped();
  } // React DevTools reads this flag.


  workInProgress.flags |= PerformedWork;
  reconcileChildren(current, workInProgress, newChildren, renderLanes);
  return workInProgress.child;
}

function markWorkInProgressReceivedUpdate() {
  didReceiveUpdate = true;
}

function resetSuspendedCurrentOnMountInLegacyMode(current, workInProgress) {
  if ((workInProgress.mode & ConcurrentMode) === NoMode) {
    if (current !== null) {
      // A lazy component only mounts if it suspended inside a non-
      // concurrent tree, in an inconsistent state. We want to treat it like
      // a new mount, even though an empty version of it already committed.
      // Disconnect the alternate pointers.
      current.alternate = null;
      workInProgress.alternate = null; // Since this is conceptually a new fiber, schedule a Placement effect

      workInProgress.flags |= Placement;
    }
  }
}

function bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes) {
  if (current !== null) {
    // Reuse previous dependencies
    workInProgress.dependencies = current.dependencies;
  }

  {
    // Don't update "base" render times for bailouts.
    stopProfilerTimerIfRunning();
  }

  markSkippedUpdateLanes(workInProgress.lanes); // Check if the children have any pending work.

  if (!includesSomeLane(renderLanes, workInProgress.childLanes)) {
    // The children don't have any work either. We can skip them.
    // TODO: Once we add back resuming, we should check if the children are
    // a work-in-progress set. If so, we need to transfer their effects.
    {
      return null;
    }
  } // This fiber doesn't have work, but its subtree does. Clone the child
  // fibers and continue.


  cloneChildFibers(current, workInProgress);
  return workInProgress.child;
}

function checkScheduledUpdateOrContext(current, renderLanes) {
  // Before performing an early bailout, we must check if there are pending
  // updates or context.
  const updateLanes = current.lanes;

  if (includesSomeLane(updateLanes, renderLanes)) {
    return true;
  } // No pending update, but because context is propagated lazily, we need

  return false;
}

function attemptEarlyBailoutIfNoScheduledUpdate(current, workInProgress, renderLanes) {
  // This fiber does not have any pending work. Bailout without entering
  // the begin phase. There's still some bookkeeping we that needs to be done
  // in this optimized path, mostly pushing stuff onto the stack.
  switch (workInProgress.tag) {
    case HostRoot:
      pushHostRootContext(workInProgress);

      {
        const cache = current.memoizedState.cache;
        pushCacheProvider(workInProgress, cache);
      }

      resetHydrationState();
      break;

    case HostSingleton:
    case HostComponent:
      pushHostContext(workInProgress);
      break;

    case ClassComponent:
      {
        const Component = workInProgress.type;

        if (isContextProvider(Component)) {
          pushContextProvider(workInProgress);
        }

        break;
      }

    case HostPortal:
      pushHostContainer(workInProgress, workInProgress.stateNode.containerInfo);
      break;

    case ContextProvider:
      {
        const newValue = workInProgress.memoizedProps.value;
        const context = workInProgress.type._context;
        pushProvider(workInProgress, context, newValue);
        break;
      }

    case Profiler:
      {
        // Profiler should only call onRender when one of its descendants actually rendered.
        const hasChildWork = includesSomeLane(renderLanes, workInProgress.childLanes);

        if (hasChildWork) {
          workInProgress.flags |= Update;
        }

        {
          // Reset effect durations for the next eventual effect phase.
          // These are reset during render to allow the DevTools commit hook a chance to read them,
          const stateNode = workInProgress.stateNode;
          stateNode.effectDuration = 0;
          stateNode.passiveEffectDuration = 0;
        }
      }

      break;

    case SuspenseComponent:
      {
        const state = workInProgress.memoizedState;

        if (state !== null) {
          if (state.dehydrated !== null) {
            // We're not going to render the children, so this is just to maintain
            // push/pop symmetry
            pushPrimaryTreeSuspenseHandler(workInProgress); // We know that this component will suspend again because if it has
            // been unsuspended it has committed as a resolved Suspense component.
            // If it needs to be retried, it should have work scheduled on it.

            workInProgress.flags |= DidCapture; // We should never render the children of a dehydrated boundary until we
            // upgrade it. We return null instead of bailoutOnAlreadyFinishedWork.

            return null;
          } // If this boundary is currently timed out, we need to decide
          // whether to retry the primary children, or to skip over it and
          // go straight to the fallback. Check the priority of the primary
          // child fragment.


          const primaryChildFragment = workInProgress.child;
          const primaryChildLanes = primaryChildFragment.childLanes;

          if (includesSomeLane(renderLanes, primaryChildLanes)) {
            // The primary children have pending work. Use the normal path
            // to attempt to render the primary children again.
            return updateSuspenseComponent(current, workInProgress, renderLanes);
          } else {
            // The primary child fragment does not have pending work marked
            // on it
            pushPrimaryTreeSuspenseHandler(workInProgress); // The primary children do not have pending work with sufficient
            // priority. Bailout.

            const child = bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);

            if (child !== null) {
              // The fallback children have pending work. Skip over the
              // primary children and work on the fallback.
              return child.sibling;
            } else {
              // Note: We can return `null` here because we already checked
              // whether there were nested context consumers, via the call to
              // `bailoutOnAlreadyFinishedWork` above.
              return null;
            }
          }
        } else {
          pushPrimaryTreeSuspenseHandler(workInProgress);
        }

        break;
      }

    case SuspenseListComponent:
      {
        const didSuspendBefore = (current.flags & DidCapture) !== NoFlags$1;
        let hasChildWork = includesSomeLane(renderLanes, workInProgress.childLanes);

        if (didSuspendBefore) {
          if (hasChildWork) {
            // If something was in fallback state last time, and we have all the
            // same children then we're still in progressive loading state.
            // Something might get unblocked by state updates or retries in the
            // tree which will affect the tail. So we need to use the normal
            // path to compute the correct tail.
            return updateSuspenseListComponent(current, workInProgress, renderLanes);
          } // If none of the children had any work, that means that none of
          // them got retried so they'll still be blocked in the same way
          // as before. We can fast bail out.


          workInProgress.flags |= DidCapture;
        } // If nothing suspended before and we're rendering the same children,
        // then the tail doesn't matter. Anything new that suspends will work
        // in the "together" mode, so we can continue from the state we had.


        const renderState = workInProgress.memoizedState;

        if (renderState !== null) {
          // Reset to the "together" mode in case we've started a different
          // update in the past but didn't complete it.
          renderState.rendering = null;
          renderState.tail = null;
          renderState.lastEffect = null;
        }

        pushSuspenseListContext(workInProgress, suspenseStackCursor.current);

        if (hasChildWork) {
          break;
        } else {
          // If none of the children had any work, that means that none of
          // them got retried so they'll still be blocked in the same way
          // as before. We can fast bail out.
          return null;
        }
      }

    case OffscreenComponent:
    case LegacyHiddenComponent:
      {
        // Need to check if the tree still needs to be deferred. This is
        // almost identical to the logic used in the normal update path,
        // so we'll just enter that. The only difference is we'll bail out
        // at the next level instead of this one, because the child props
        // have not changed. Which is fine.
        // TODO: Probably should refactor `beginWork` to split the bailout
        // path from the normal path. I'm tempted to do a labeled break here
        // but I won't :)
        workInProgress.lanes = NoLanes;
        return updateOffscreenComponent(current, workInProgress, renderLanes);
      }

    case CacheComponent:
      {
        {
          const cache = current.memoizedState.cache;
          pushCacheProvider(workInProgress, cache);
        }

        break;
      }
  }

  return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
}

function beginWork$1(current, workInProgress, renderLanes) {

  if (current !== null) {
    const oldProps = current.memoizedProps;
    const newProps = workInProgress.pendingProps;

    if (oldProps !== newProps || hasContextChanged() || ( // Force a re-render if the implementation changed due to hot reload:
    false)) {
      // If props or context changed, mark the fiber as having performed work.
      // This may be unset if the props are determined to be equal later (memo).
      didReceiveUpdate = true;
    } else {
      // Neither props nor legacy context changes. Check if there's a pending
      // update or context change.
      const hasScheduledUpdateOrContext = checkScheduledUpdateOrContext(current, renderLanes);

      if (!hasScheduledUpdateOrContext && // If this is the second pass of an error or suspense boundary, there
      // may not be work scheduled on `current`, so we check for this flag.
      (workInProgress.flags & DidCapture) === NoFlags$1) {
        // No pending updates or context. Bail out now.
        didReceiveUpdate = false;
        return attemptEarlyBailoutIfNoScheduledUpdate(current, workInProgress, renderLanes);
      }

      if ((current.flags & ForceUpdateForLegacySuspense) !== NoFlags$1) {
        // This is a special case that only exists for legacy mode.
        // See https://github.com/facebook/react/pull/19216.
        didReceiveUpdate = true;
      } else {
        // An update was scheduled on this fiber, but there are no new props
        // nor legacy context. Set this to false. If an update queue or context
        // consumer produces a changed value, it will set this to true. Otherwise,
        // the component will assume the children have not changed and bail out.
        didReceiveUpdate = false;
      }
    }
  } else {
    didReceiveUpdate = false;

    if (getIsHydrating() && isForkedChild(workInProgress)) {
      // Check if this child belongs to a list of muliple children in
      // its parent.
      //
      // In a true multi-threaded implementation, we would render children on
      // parallel threads. This would represent the beginning of a new render
      // thread for this subtree.
      //
      // We only use this for id generation during hydration, which is why the
      // logic is located in this special branch.
      const slotIndex = workInProgress.index;
      const numberOfForks = getForksAtLevel();
      pushTreeId(workInProgress, numberOfForks, slotIndex);
    }
  } // Before entering the begin phase, clear pending update priority.
  // TODO: This assumes that we're about to evaluate the component and process
  // the update queue. However, there's an exception: SimpleMemoComponent
  // sometimes bails out later in the begin phase. This indicates that we should
  // move this assignment out of the common path and into each branch.


  workInProgress.lanes = NoLanes;

  switch (workInProgress.tag) {
    case IndeterminateComponent:
      {
        return mountIndeterminateComponent(current, workInProgress, workInProgress.type, renderLanes);
      }

    case LazyComponent:
      {
        const elementType = workInProgress.elementType;
        return mountLazyComponent(current, workInProgress, elementType, renderLanes);
      }

    case FunctionComponent:
      {
        const Component = workInProgress.type;
        const unresolvedProps = workInProgress.pendingProps;
        const resolvedProps = workInProgress.elementType === Component ? unresolvedProps : resolveDefaultProps(Component, unresolvedProps);
        return updateFunctionComponent(current, workInProgress, Component, resolvedProps, renderLanes);
      }

    case ClassComponent:
      {
        const Component = workInProgress.type;
        const unresolvedProps = workInProgress.pendingProps;
        const resolvedProps = workInProgress.elementType === Component ? unresolvedProps : resolveDefaultProps(Component, unresolvedProps);
        return updateClassComponent(current, workInProgress, Component, resolvedProps, renderLanes);
      }

    case HostRoot:
      return updateHostRoot(current, workInProgress, renderLanes);

    case HostHoistable:
      {
        return updateHostHoistable(current, workInProgress);
      }

    // Fall through

    case HostSingleton:
      {
        return updateHostSingleton(current, workInProgress, renderLanes);
      }

    // Fall through

    case HostComponent:
      return updateHostComponent$1(current, workInProgress, renderLanes);

    case HostText:
      return updateHostText$1(current, workInProgress);

    case SuspenseComponent:
      return updateSuspenseComponent(current, workInProgress, renderLanes);

    case HostPortal:
      return updatePortalComponent(current, workInProgress, renderLanes);

    case ForwardRef:
      {
        const type = workInProgress.type;
        const unresolvedProps = workInProgress.pendingProps;
        const resolvedProps = workInProgress.elementType === type ? unresolvedProps : resolveDefaultProps(type, unresolvedProps);
        return updateForwardRef(current, workInProgress, type, resolvedProps, renderLanes);
      }

    case Fragment:
      return updateFragment(current, workInProgress, renderLanes);

    case Mode:
      return updateMode(current, workInProgress, renderLanes);

    case Profiler:
      return updateProfiler(current, workInProgress, renderLanes);

    case ContextProvider:
      return updateContextProvider(current, workInProgress, renderLanes);

    case ContextConsumer:
      return updateContextConsumer(current, workInProgress, renderLanes);

    case MemoComponent:
      {
        const type = workInProgress.type;
        const unresolvedProps = workInProgress.pendingProps; // Resolve outer props first, then resolve inner props.

        let resolvedProps = resolveDefaultProps(type, unresolvedProps);

        resolvedProps = resolveDefaultProps(type.type, resolvedProps);
        return updateMemoComponent(current, workInProgress, type, resolvedProps, renderLanes);
      }

    case SimpleMemoComponent:
      {
        return updateSimpleMemoComponent(current, workInProgress, workInProgress.type, workInProgress.pendingProps, renderLanes);
      }

    case IncompleteClassComponent:
      {
        const Component = workInProgress.type;
        const unresolvedProps = workInProgress.pendingProps;
        const resolvedProps = workInProgress.elementType === Component ? unresolvedProps : resolveDefaultProps(Component, unresolvedProps);
        return mountIncompleteClassComponent(current, workInProgress, Component, resolvedProps, renderLanes);
      }

    case SuspenseListComponent:
      {
        return updateSuspenseListComponent(current, workInProgress, renderLanes);
      }

    case ScopeComponent:
      {

        break;
      }

    case OffscreenComponent:
      {
        return updateOffscreenComponent(current, workInProgress, renderLanes);
      }

    case LegacyHiddenComponent:
      {

        break;
      }

    case CacheComponent:
      {
        {
          return updateCacheComponent(current, workInProgress, renderLanes);
        }
      }
  }

  throw Error(formatProdErrorMessage(156, workInProgress.tag));
}

const valueCursor = createCursor(null);

let currentlyRenderingFiber = null;
let lastContextDependency = null;
let lastFullyObservedContext = null;
function resetContextDependencies() {
  // This is called right before React yields execution, to ensure `readContext`
  // cannot be called outside the render phase.
  currentlyRenderingFiber = null;
  lastContextDependency = null;
  lastFullyObservedContext = null;
}
function pushProvider(providerFiber, context, nextValue) {
  {
    push(valueCursor, context._currentValue);
    context._currentValue = nextValue;
  }
}
function popProvider(context, providerFiber) {
  const currentValue = valueCursor.current;

  {
    if (currentValue === REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED) {
      context._currentValue = context._defaultValue;
    } else {
      context._currentValue = currentValue;
    }
  }

  pop(valueCursor);
}
function scheduleContextWorkOnParentPath(parent, renderLanes, propagationRoot) {
  // Update the child lanes of all the ancestors, including the alternates.
  let node = parent;

  while (node !== null) {
    const alternate = node.alternate;

    if (!isSubsetOfLanes(node.childLanes, renderLanes)) {
      node.childLanes = mergeLanes(node.childLanes, renderLanes);

      if (alternate !== null) {
        alternate.childLanes = mergeLanes(alternate.childLanes, renderLanes);
      }
    } else if (alternate !== null && !isSubsetOfLanes(alternate.childLanes, renderLanes)) {
      alternate.childLanes = mergeLanes(alternate.childLanes, renderLanes);
    } else ;

    if (node === propagationRoot) {
      break;
    }

    node = node.return;
  }
}
function propagateContextChange(workInProgress, context, renderLanes) {
  {
    propagateContextChange_eager(workInProgress, context, renderLanes);
  }
}

function propagateContextChange_eager(workInProgress, context, renderLanes) {

  let fiber = workInProgress.child;

  if (fiber !== null) {
    // Set the return pointer of the child to the work-in-progress fiber.
    fiber.return = workInProgress;
  }

  while (fiber !== null) {
    let nextFiber; // Visit this fiber.

    const list = fiber.dependencies;

    if (list !== null) {
      nextFiber = fiber.child;
      let dependency = list.firstContext;

      while (dependency !== null) {
        // Check if the context matches.
        if (dependency.context === context) {
          // Match! Schedule an update on this fiber.
          if (fiber.tag === ClassComponent) {
            // Schedule a force update on the work-in-progress.
            const lane = pickArbitraryLane(renderLanes);
            const update = createUpdate(lane);
            update.tag = ForceUpdate; // TODO: Because we don't have a work-in-progress, this will add the
            // update to the current fiber, too, which means it will persist even if
            // this render is thrown away. Since it's a race condition, not sure it's
            // worth fixing.
            // Inlined `enqueueUpdate` to remove interleaved update check

            const updateQueue = fiber.updateQueue;

            if (updateQueue === null) ; else {
              const sharedQueue = updateQueue.shared;
              const pending = sharedQueue.pending;

              if (pending === null) {
                // This is the first update. Create a circular list.
                update.next = update;
              } else {
                update.next = pending.next;
                pending.next = update;
              }

              sharedQueue.pending = update;
            }
          }

          fiber.lanes = mergeLanes(fiber.lanes, renderLanes);
          const alternate = fiber.alternate;

          if (alternate !== null) {
            alternate.lanes = mergeLanes(alternate.lanes, renderLanes);
          }

          scheduleContextWorkOnParentPath(fiber.return, renderLanes, workInProgress); // Mark the updated lanes on the list, too.

          list.lanes = mergeLanes(list.lanes, renderLanes); // Since we already found a match, we can stop traversing the
          // dependency list.

          break;
        }

        dependency = dependency.next;
      }
    } else if (fiber.tag === ContextProvider) {
      // Don't scan deeper if this is a matching provider
      nextFiber = fiber.type === workInProgress.type ? null : fiber.child;
    } else if (fiber.tag === DehydratedFragment) {
      // If a dehydrated suspense boundary is in this subtree, we don't know
      // if it will have any context consumers in it. The best we can do is
      // mark it as having updates.
      const parentSuspense = fiber.return;

      if (parentSuspense === null) {
        throw Error(formatProdErrorMessage(341));
      }

      parentSuspense.lanes = mergeLanes(parentSuspense.lanes, renderLanes);
      const alternate = parentSuspense.alternate;

      if (alternate !== null) {
        alternate.lanes = mergeLanes(alternate.lanes, renderLanes);
      } // This is intentionally passing this fiber as the parent
      // because we want to schedule this fiber as having work
      // on its children. We'll use the childLanes on
      // this fiber to indicate that a context has changed.


      scheduleContextWorkOnParentPath(parentSuspense, renderLanes, workInProgress);
      nextFiber = fiber.sibling;
    } else {
      // Traverse down.
      nextFiber = fiber.child;
    }

    if (nextFiber !== null) {
      // Set the return pointer of the child to the work-in-progress fiber.
      nextFiber.return = fiber;
    } else {
      // No child. Traverse to next sibling.
      nextFiber = fiber;

      while (nextFiber !== null) {
        if (nextFiber === workInProgress) {
          // We're back to the root of this subtree. Exit.
          nextFiber = null;
          break;
        }

        const sibling = nextFiber.sibling;

        if (sibling !== null) {
          // Set the return pointer of the sibling to the work-in-progress fiber.
          sibling.return = nextFiber.return;
          nextFiber = sibling;
          break;
        } // No more siblings. Traverse up.


        nextFiber = nextFiber.return;
      }
    }

    fiber = nextFiber;
  }
}
function prepareToReadContext(workInProgress, renderLanes) {
  currentlyRenderingFiber = workInProgress;
  lastContextDependency = null;
  lastFullyObservedContext = null;
  const dependencies = workInProgress.dependencies;

  if (dependencies !== null) {
    {
      const firstContext = dependencies.firstContext;

      if (firstContext !== null) {
        if (includesSomeLane(dependencies.lanes, renderLanes)) {
          // Context list has a pending update. Mark that this fiber performed work.
          markWorkInProgressReceivedUpdate();
        } // Reset the work-in-progress list


        dependencies.firstContext = null;
      }
    }
  }
}
function readContext(context) {

  return readContextForConsumer(currentlyRenderingFiber, context);
}
function readContextDuringReconcilation(consumer, context, renderLanes) {
  if (currentlyRenderingFiber === null) {
    prepareToReadContext(consumer, renderLanes);
  }

  return readContextForConsumer(consumer, context);
}

function readContextForConsumer(consumer, context) {
  const value = context._currentValue ;

  if (lastFullyObservedContext === context) ; else {
    const contextItem = {
      context: context,
      memoizedValue: value,
      next: null
    };

    if (lastContextDependency === null) {
      if (consumer === null) {
        throw Error(formatProdErrorMessage(308));
      } // This is the first dependency for this component. Create a new list.


      lastContextDependency = contextItem;
      consumer.dependencies = {
        lanes: NoLanes,
        firstContext: contextItem
      };
    } else {
      // Append a new context item.
      lastContextDependency = lastContextDependency.next = contextItem;
    }
  }

  return value;
}

// replace it with a lightweight shim that only has the features we use.

const AbortControllerLocal = typeof AbortController !== 'undefined' ? AbortController : // $FlowFixMe[missing-this-annot]
// $FlowFixMe[prop-missing]
function AbortControllerShim() {
  const listeners = [];
  const signal = this.signal = {
    aborted: false,
    addEventListener: (type, listener) => {
      listeners.push(listener);
    }
  };

  this.abort = () => {
    signal.aborted = true;
    listeners.forEach(listener => listener());
  };
} ; // Intentionally not named imports because Rollup would
// use dynamic dispatch for CommonJS interop named imports.

const scheduleCallback$1 = Scheduler.unstable_scheduleCallback,
      NormalPriority = Scheduler.unstable_NormalPriority;
const CacheContext = {
  $$typeof: REACT_CONTEXT_TYPE,
  // We don't use Consumer/Provider for Cache components. So we'll cheat.
  Consumer: null,
  Provider: null,
  // We'll initialize these at the root.
  _currentValue: null,
  _currentValue2: null,
  _threadCount: 0,
  _defaultValue: null,
  _globalName: null
} ;
// for retaining the cache once it is in use (retainCache), and releasing the cache
// once it is no longer needed (releaseCache).


function createCache() {

  const cache = {
    controller: new AbortControllerLocal(),
    data: new Map(),
    refCount: 0
  };
  return cache;
}
function retainCache(cache) {

  cache.refCount++;
} // Cleanup a cache instance, potentially freeing it if there are no more references

function releaseCache(cache) {

  cache.refCount--;

  if (cache.refCount === 0) {
    scheduleCallback$1(NormalPriority, () => {
      cache.controller.abort();
    });
  }
}
function pushCacheProvider(workInProgress, cache) {

  pushProvider(workInProgress, CacheContext, cache);
}
function popCacheProvider(workInProgress, cache) {

  popProvider(CacheContext);
}

const ReactCurrentBatchConfig$2 = ReactSharedInternals.ReactCurrentBatchConfig;
const NoTransition = null;
function requestCurrentTransition() {
  return ReactCurrentBatchConfig$2.transition;
} // When retrying a Suspense/Offscreen boundary, we restore the cache that was
// used during the previous render by placing it here, on the stack.

const resumedCache = createCursor(null); // During the render/synchronous commit phase, we don't actually process the

function peekCacheFromPool() {
  // If we're rendering inside a Suspense boundary that is currently hidden,
  // we should use the same cache that we used during the previous render, if
  // one exists.


  const cacheResumedFromPreviousRender = resumedCache.current;

  if (cacheResumedFromPreviousRender !== null) {
    return cacheResumedFromPreviousRender;
  } // Otherwise, check the root's cache pool.


  const root = getWorkInProgressRoot();
  const cacheFromRootCachePool = root.pooledCache;
  return cacheFromRootCachePool;
}

function requestCacheFromPool(renderLanes) {
  // Similar to previous function, except if there's not already a cache in the
  // pool, we allocate a new one.
  const cacheFromPool = peekCacheFromPool();

  if (cacheFromPool !== null) {
    return cacheFromPool;
  } // Create a fresh cache and add it to the root cache pool. A cache can have
  // multiple owners:
  // - A cache pool that lives on the FiberRoot. This is where all fresh caches
  //   are originally created (TODO: except during refreshes, until we implement
  //   this correctly). The root takes ownership immediately when the cache is
  //   created. Conceptually, root.pooledCache is an Option<Arc<Cache>> (owned),
  //   and the return value of this function is a &Arc<Cache> (borrowed).
  // - One of several fiber types: host root, cache boundary, suspense
  //   component. These retain and release in the commit phase.


  const root = getWorkInProgressRoot();
  const freshCache = createCache();
  root.pooledCache = freshCache;
  retainCache(freshCache);

  if (freshCache !== null) {
    root.pooledCacheLanes |= renderLanes;
  }

  return freshCache;
}
function pushTransition(offscreenWorkInProgress, prevCachePool, newTransitions) {
  {
    if (prevCachePool === null) {
      push(resumedCache, resumedCache.current);
    } else {
      push(resumedCache, prevCachePool.pool);
    }
  }
}
function popTransition(workInProgress, current) {
  if (current !== null) {

    {
      pop(resumedCache);
    }
  }
}
function getSuspendedCache() {
  // cache that would have been used to render fresh data during this render,
  // if there was any, so that we can resume rendering with the same cache when
  // we receive more data.


  const cacheFromPool = peekCacheFromPool();

  if (cacheFromPool === null) {
    return null;
  }

  return {
    // We must also save the parent, so that when we resume we can detect
    // a refresh.
    parent: CacheContext._currentValue ,
    pool: cacheFromPool
  };
}
function getOffscreenDeferredCache() {

  const cacheFromPool = peekCacheFromPool();

  if (cacheFromPool === null) {
    return null;
  }

  return {
    // We must also store the parent, so that when we resume we can detect
    // a refresh.
    parent: CacheContext._currentValue ,
    pool: cacheFromPool
  };
}

/**
 * Tag the fiber with an update effect. This turns a Placement into
 * a PlacementAndUpdate.
 */

function markUpdate(workInProgress) {
  workInProgress.flags |= Update;
}

function markRef(workInProgress) {
  workInProgress.flags |= Ref | RefStatic;
}

function appendAllChildren(parent, workInProgress, needsVisibilityToggle, isHidden) {
  {
    // We only have the top Fiber that was created but we need recurse down its
    // children to find all the terminal nodes.
    let node = workInProgress.child;

    while (node !== null) {
      if (node.tag === HostComponent || node.tag === HostText) {
        appendInitialChild(parent, node.stateNode);
      } else if (node.tag === HostPortal || (node.tag === HostSingleton )) ; else if (node.child !== null) {
        node.child.return = node;
        node = node.child;
        continue;
      }

      if (node === workInProgress) {
        return;
      } // $FlowFixMe[incompatible-use] found when upgrading Flow


      while (node.sibling === null) {
        // $FlowFixMe[incompatible-use] found when upgrading Flow
        if (node.return === null || node.return === workInProgress) {
          return;
        }

        node = node.return;
      } // $FlowFixMe[incompatible-use] found when upgrading Flow


      node.sibling.return = node.return;
      node = node.sibling;
    }
  }
} // An unfortunate fork of appendAllChildren because we have two different parent types.

function updateHostComponent(current, workInProgress, type, newProps, renderLanes) {
  {
    // If we have an alternate, that means this is an update and we need to
    // schedule a side-effect to do the updates.
    const oldProps = current.memoizedProps;

    if (oldProps === newProps) {
      // In mutation mode, this is sufficient for a bailout because
      // we won't touch this node even if children changed.
      return;
    }

    markUpdate(workInProgress);
  }
} // This function must be called at the very end of the complete phase, because
// it might throw to suspend, and if the resource immediately loads, the work
// loop will resume rendering as if the work-in-progress completed. So it must
// fully complete.
// TODO: This should ideally move to begin phase, but currently the instance is
// not created until the complete phase. For our existing use cases, host nodes
// that suspend don't have children, so it doesn't matter. But that might not
// always be true in the future.


function preloadInstanceAndSuspendIfNeeded(workInProgress, type, props, renderLanes) {
  {
    // If this flag was set previously, we can remove it. The flag
    // represents whether this particular set of props might ever need to
    // suspend. The safest thing to do is for maySuspendCommit to always
    // return true, but if the renderer is reasonably confident that the
    // underlying resource won't be evicted, it can return false as a
    // performance optimization.
    workInProgress.flags &= ~MaySuspendCommit;
    return;
  } // Mark this fiber with a flag. This gets set on all host instances
}

function preloadResourceAndSuspendIfNeeded(workInProgress, resource, type, props, renderLanes) {
  // This is a fork of preloadInstanceAndSuspendIfNeeded, but for resources.
  if (!mayResourceSuspendCommit(resource)) {
    workInProgress.flags &= ~MaySuspendCommit;
    return;
  }

  workInProgress.flags |= MaySuspendCommit;
  const rootRenderLanes = getWorkInProgressRootRenderLanes();

  if (!includesOnlyNonUrgentLanes(rootRenderLanes)) ; else {
    const isReady = preloadResource(resource);

    if (!isReady) {
      if (shouldRemainOnPreviousScreen()) {
        workInProgress.flags |= ShouldSuspendCommit;
      } else {
        suspendCommit();
      }
    }
  }
}

function scheduleRetryEffect(workInProgress, retryQueue) {
  const wakeables = retryQueue;

  if (wakeables !== null) {
    // Schedule an effect to attach a retry listener to the promise.
    // TODO: Move to passive phase
    workInProgress.flags |= Update;
  } else {
    // This boundary suspended, but no wakeables were added to the retry
    // queue. Check if the renderer suspended commit. If so, this means
    // that once the fallback is committed, we can immediately retry
    // rendering again, because rendering wasn't actually blocked. Only
    // the commit phase.
    // TODO: Consider a model where we always schedule an immediate retry, even
    // for normal Suspense. That way the retry can partially render up to the
    // first thing that suspends.
    if (workInProgress.flags & ScheduleRetry) {
      const retryLane = // TODO: This check should probably be moved into claimNextRetryLane
      // I also suspect that we need some further consolidation of offscreen
      // and retry lanes.
      workInProgress.tag !== OffscreenComponent ? claimNextRetryLane() : OffscreenLane;
      workInProgress.lanes = mergeLanes(workInProgress.lanes, retryLane);
    }
  }
}

function updateHostText(current, workInProgress, oldText, newText) {
  {
    // If the text differs, mark it as an update. All the work in done in commitWork.
    if (oldText !== newText) {
      markUpdate(workInProgress);
    }
  }
}

function cutOffTailIfNeeded(renderState, hasRenderedATailFallback) {
  if (getIsHydrating()) {
    // If we're hydrating, we should consume as many items as we can
    // so we don't leave any behind.
    return;
  }

  switch (renderState.tailMode) {
    case 'hidden':
      {
        // Any insertions at the end of the tail list after this point
        // should be invisible. If there are already mounted boundaries
        // anything before them are not considered for collapsing.
        // Therefore we need to go through the whole tail to find if
        // there are any.
        let tailNode = renderState.tail;
        let lastTailNode = null;

        while (tailNode !== null) {
          if (tailNode.alternate !== null) {
            lastTailNode = tailNode;
          }

          tailNode = tailNode.sibling;
        } // Next we're simply going to delete all insertions after the
        // last rendered item.


        if (lastTailNode === null) {
          // All remaining items in the tail are insertions.
          renderState.tail = null;
        } else {
          // Detach the insertion after the last node that was already
          // inserted.
          lastTailNode.sibling = null;
        }

        break;
      }

    case 'collapsed':
      {
        // Any insertions at the end of the tail list after this point
        // should be invisible. If there are already mounted boundaries
        // anything before them are not considered for collapsing.
        // Therefore we need to go through the whole tail to find if
        // there are any.
        let tailNode = renderState.tail;
        let lastTailNode = null;

        while (tailNode !== null) {
          if (tailNode.alternate !== null) {
            lastTailNode = tailNode;
          }

          tailNode = tailNode.sibling;
        } // Next we're simply going to delete all insertions after the
        // last rendered item.


        if (lastTailNode === null) {
          // All remaining items in the tail are insertions.
          if (!hasRenderedATailFallback && renderState.tail !== null) {
            // We suspended during the head. We want to show at least one
            // row at the tail. So we'll keep on and cut off the rest.
            renderState.tail.sibling = null;
          } else {
            renderState.tail = null;
          }
        } else {
          // Detach the insertion after the last node that was already
          // inserted.
          lastTailNode.sibling = null;
        }

        break;
      }
  }
}

function bubbleProperties(completedWork) {
  const didBailout = completedWork.alternate !== null && completedWork.alternate.child === completedWork.child;
  let newChildLanes = NoLanes;
  let subtreeFlags = NoFlags$1;

  if (!didBailout) {
    // Bubble up the earliest expiration time.
    if ((completedWork.mode & ProfileMode) !== NoMode) {
      // In profiling mode, resetChildExpirationTime is also used to reset
      // profiler durations.
      let actualDuration = completedWork.actualDuration;
      let treeBaseDuration = completedWork.selfBaseDuration;
      let child = completedWork.child;

      while (child !== null) {
        newChildLanes = mergeLanes(newChildLanes, mergeLanes(child.lanes, child.childLanes));
        subtreeFlags |= child.subtreeFlags;
        subtreeFlags |= child.flags; // When a fiber is cloned, its actualDuration is reset to 0. This value will
        // only be updated if work is done on the fiber (i.e. it doesn't bailout).
        // When work is done, it should bubble to the parent's actualDuration. If
        // the fiber has not been cloned though, (meaning no work was done), then
        // this value will reflect the amount of time spent working on a previous
        // render. In that case it should not bubble. We determine whether it was
        // cloned by comparing the child pointer.
        // $FlowFixMe[unsafe-addition] addition with possible null/undefined value

        actualDuration += child.actualDuration; // $FlowFixMe[unsafe-addition] addition with possible null/undefined value

        treeBaseDuration += child.treeBaseDuration;
        child = child.sibling;
      }

      completedWork.actualDuration = actualDuration;
      completedWork.treeBaseDuration = treeBaseDuration;
    } else {
      let child = completedWork.child;

      while (child !== null) {
        newChildLanes = mergeLanes(newChildLanes, mergeLanes(child.lanes, child.childLanes));
        subtreeFlags |= child.subtreeFlags;
        subtreeFlags |= child.flags; // Update the return pointer so the tree is consistent. This is a code
        // smell because it assumes the commit phase is never concurrent with
        // the render phase. Will address during refactor to alternate model.

        child.return = completedWork;
        child = child.sibling;
      }
    }

    completedWork.subtreeFlags |= subtreeFlags;
  } else {
    // Bubble up the earliest expiration time.
    if ((completedWork.mode & ProfileMode) !== NoMode) {
      // In profiling mode, resetChildExpirationTime is also used to reset
      // profiler durations.
      let treeBaseDuration = completedWork.selfBaseDuration;
      let child = completedWork.child;

      while (child !== null) {
        newChildLanes = mergeLanes(newChildLanes, mergeLanes(child.lanes, child.childLanes)); // "Static" flags share the lifetime of the fiber/hook they belong to,
        // so we should bubble those up even during a bailout. All the other
        // flags have a lifetime only of a single render + commit, so we should
        // ignore them.

        subtreeFlags |= child.subtreeFlags & StaticMask;
        subtreeFlags |= child.flags & StaticMask; // $FlowFixMe[unsafe-addition] addition with possible null/undefined value

        treeBaseDuration += child.treeBaseDuration;
        child = child.sibling;
      }

      completedWork.treeBaseDuration = treeBaseDuration;
    } else {
      let child = completedWork.child;

      while (child !== null) {
        newChildLanes = mergeLanes(newChildLanes, mergeLanes(child.lanes, child.childLanes)); // "Static" flags share the lifetime of the fiber/hook they belong to,
        // so we should bubble those up even during a bailout. All the other
        // flags have a lifetime only of a single render + commit, so we should
        // ignore them.

        subtreeFlags |= child.subtreeFlags & StaticMask;
        subtreeFlags |= child.flags & StaticMask; // Update the return pointer so the tree is consistent. This is a code
        // smell because it assumes the commit phase is never concurrent with
        // the render phase. Will address during refactor to alternate model.

        child.return = completedWork;
        child = child.sibling;
      }
    }

    completedWork.subtreeFlags |= subtreeFlags;
  }

  completedWork.childLanes = newChildLanes;
  return didBailout;
}

function completeDehydratedSuspenseBoundary(current, workInProgress, nextState) {
  if (hasUnhydratedTailNodes() && (workInProgress.mode & ConcurrentMode) !== NoMode && (workInProgress.flags & DidCapture) === NoFlags$1) {
    warnIfUnhydratedTailNodes();
    resetHydrationState();
    workInProgress.flags |= ForceClientRender | DidCapture;
    return false;
  }

  const wasHydrated = popHydrationState(workInProgress);

  if (nextState !== null && nextState.dehydrated !== null) {
    // We might be inside a hydration state the first time we're picking up this
    // Suspense boundary, and also after we've reentered it for further hydration.
    if (current === null) {
      if (!wasHydrated) {
        throw Error(formatProdErrorMessage(318));
      }

      prepareToHydrateHostSuspenseInstance(workInProgress);
      bubbleProperties(workInProgress);

      {
        if ((workInProgress.mode & ProfileMode) !== NoMode) {
          const isTimedOutSuspense = nextState !== null;

          if (isTimedOutSuspense) {
            // Don't count time spent in a timed out Suspense subtree as part of the base duration.
            const primaryChildFragment = workInProgress.child;

            if (primaryChildFragment !== null) {
              // $FlowFixMe[unsafe-arithmetic] Flow doesn't support type casting in combination with the -= operator
              workInProgress.treeBaseDuration -= primaryChildFragment.treeBaseDuration;
            }
          }
        }
      }

      return false;
    } else {
      // We might have reentered this boundary to hydrate it. If so, we need to reset the hydration
      // state since we're now exiting out of it. popHydrationState doesn't do that for us.
      resetHydrationState();

      if ((workInProgress.flags & DidCapture) === NoFlags$1) {
        // This boundary did not suspend so it's now hydrated and unsuspended.
        workInProgress.memoizedState = null;
      } // If nothing suspended, we need to schedule an effect to mark this boundary
      // as having hydrated so events know that they're free to be invoked.
      // It's also a signal to replay events and the suspense callback.
      // If something suspended, schedule an effect to attach retry listeners.
      // So we might as well always mark this.


      workInProgress.flags |= Update;
      bubbleProperties(workInProgress);

      {
        if ((workInProgress.mode & ProfileMode) !== NoMode) {
          const isTimedOutSuspense = nextState !== null;

          if (isTimedOutSuspense) {
            // Don't count time spent in a timed out Suspense subtree as part of the base duration.
            const primaryChildFragment = workInProgress.child;

            if (primaryChildFragment !== null) {
              // $FlowFixMe[unsafe-arithmetic] Flow doesn't support type casting in combination with the -= operator
              workInProgress.treeBaseDuration -= primaryChildFragment.treeBaseDuration;
            }
          }
        }
      }

      return false;
    }
  } else {
    // Successfully completed this tree. If this was a forced client render,
    // there may have been recoverable errors during first hydration
    // attempt. If so, add them to a queue so we can log them in the
    // commit phase.
    upgradeHydrationErrorsToRecoverable(); // Fall through to normal Suspense path

    return true;
  }
}

function completeWork(current, workInProgress, renderLanes) {
  const newProps = workInProgress.pendingProps; // Note: This intentionally doesn't check if we're hydrating because comparing
  // to the current tree provider fiber is just as fast and less error-prone.
  // Ideally we would have a special version of the work loop only
  // for hydration.

  popTreeContext(workInProgress);

  switch (workInProgress.tag) {
    case IndeterminateComponent:
    case LazyComponent:
    case SimpleMemoComponent:
    case FunctionComponent:
    case ForwardRef:
    case Fragment:
    case Mode:
    case Profiler:
    case ContextConsumer:
    case MemoComponent:
      bubbleProperties(workInProgress);
      return null;

    case ClassComponent:
      {
        const Component = workInProgress.type;

        if (isContextProvider(Component)) {
          popContext();
        }

        bubbleProperties(workInProgress);
        return null;
      }

    case HostRoot:
      {
        const fiberRoot = workInProgress.stateNode;

        {
          let previousCache = null;

          if (current !== null) {
            previousCache = current.memoizedState.cache;
          }

          const cache = workInProgress.memoizedState.cache;

          if (cache !== previousCache) {
            // Run passive effects to retain/release the cache.
            workInProgress.flags |= Passive$1;
          }

          popCacheProvider();
        }
        popHostContainer();
        popTopLevelContextObject();

        if (fiberRoot.pendingContext) {
          fiberRoot.context = fiberRoot.pendingContext;
          fiberRoot.pendingContext = null;
        }

        if (current === null || current.child === null) {
          // If we hydrated, pop so that we can delete any remaining children
          // that weren't hydrated.
          const wasHydrated = popHydrationState(workInProgress);

          if (wasHydrated) {
            // If we hydrated, then we'll need to schedule an update for
            // the commit side-effects on the root.
            markUpdate(workInProgress);
          } else {
            if (current !== null) {
              const prevState = current.memoizedState;

              if ( // Check if this is a client root
              !prevState.isDehydrated || // Check if we reverted to client rendering (e.g. due to an error)
              (workInProgress.flags & ForceClientRender) !== NoFlags$1) {
                // Schedule an effect to clear this container at the start of the
                // next commit. This handles the case of React rendering into a
                // container with previous children. It's also safe to do for
                // updates too, because current.child would only be null if the
                // previous render was null (so the container would already
                // be empty).
                workInProgress.flags |= Snapshot; // If this was a forced client render, there may have been
                // recoverable errors during first hydration attempt. If so, add
                // them to a queue so we can log them in the commit phase.

                upgradeHydrationErrorsToRecoverable();
              }
            }
          }
        }
        bubbleProperties(workInProgress);

        return null;
      }

    case HostHoistable:
      {
        {
          const nextResource = workInProgress.memoizedState;

          if (current === null) {
            // We are mounting and must Update this Hoistable in this commit
            // @TODO refactor this block to create the instance here in complete
            // phase if we are not hydrating.
            markUpdate(workInProgress);

            if (workInProgress.ref !== null) {
              markRef(workInProgress);
            }

            if (nextResource !== null) {
              // This is a Hoistable Resource
              // This must come at the very end of the complete phase.
              bubbleProperties(workInProgress);
              preloadResourceAndSuspendIfNeeded(workInProgress, nextResource);
              return null;
            } else {
              // This is a Hoistable Instance
              // This must come at the very end of the complete phase.
              bubbleProperties(workInProgress);
              preloadInstanceAndSuspendIfNeeded(workInProgress);
              return null;
            }
          } else {
            // We are updating.
            const currentResource = current.memoizedState;

            if (nextResource !== currentResource) {
              // We are transitioning to, from, or between Hoistable Resources
              // and require an update
              markUpdate(workInProgress);
            }

            if (current.ref !== workInProgress.ref) {
              markRef(workInProgress);
            }

            if (nextResource !== null) {
              // This is a Hoistable Resource
              // This must come at the very end of the complete phase.
              bubbleProperties(workInProgress);

              if (nextResource === currentResource) {
                workInProgress.flags &= ~MaySuspendCommit;
              } else {
                preloadResourceAndSuspendIfNeeded(workInProgress, nextResource);
              }

              return null;
            } else {
              // This is a Hoistable Instance
              // We may have props to update on the Hoistable instance.
              {
                const oldProps = current.memoizedProps;

                if (oldProps !== newProps) {
                  markUpdate(workInProgress);
                }
              } // This must come at the very end of the complete phase.


              bubbleProperties(workInProgress);
              preloadInstanceAndSuspendIfNeeded(workInProgress);
              return null;
            }
          }
        } // Fall through

      }

    case HostSingleton:
      {
        {
          popHostContext(workInProgress);
          const rootContainerInstance = getRootHostContainer();
          const type = workInProgress.type;

          if (current !== null && workInProgress.stateNode != null) {
            {
              const oldProps = current.memoizedProps;

              if (oldProps !== newProps) {
                markUpdate(workInProgress);
              }
            }

            if (current.ref !== workInProgress.ref) {
              markRef(workInProgress);
            }
          } else {
            if (!newProps) {
              if (workInProgress.stateNode === null) {
                throw Error(formatProdErrorMessage(166));
              } // This can happen when we abort work.


              bubbleProperties(workInProgress);
              return null;
            }

            const currentHostContext = getHostContext();
            const wasHydrated = popHydrationState(workInProgress);
            let instance;

            if (wasHydrated) {
              // We ignore the boolean indicating there is an updateQueue because
              // it is used only to set text children and HostSingletons do not
              // use them.
              prepareToHydrateHostInstance(workInProgress, currentHostContext);
              instance = workInProgress.stateNode;
            } else {
              instance = resolveSingletonInstance(type, newProps, rootContainerInstance);
              workInProgress.stateNode = instance;
              markUpdate(workInProgress);
            }

            if (workInProgress.ref !== null) {
              // If there is a ref on a host node we need to schedule a callback
              markRef(workInProgress);
            }
          }

          bubbleProperties(workInProgress);
          return null;
        } // Fall through

      }

    case HostComponent:
      {
        popHostContext(workInProgress);
        const type = workInProgress.type;

        if (current !== null && workInProgress.stateNode != null) {
          updateHostComponent(current, workInProgress, type, newProps);

          if (current.ref !== workInProgress.ref) {
            markRef(workInProgress);
          }
        } else {
          if (!newProps) {
            if (workInProgress.stateNode === null) {
              throw Error(formatProdErrorMessage(166));
            } // This can happen when we abort work.


            bubbleProperties(workInProgress);
            return null;
          }

          const currentHostContext = getHostContext(); // TODO: Move createInstance to beginWork and keep it on a context
          // "stack" as the parent. Then append children as we go in beginWork
          // or completeWork depending on whether we want to add them top->down or
          // bottom->up. Top->down is faster in IE11.

          const wasHydrated = popHydrationState(workInProgress);

          if (wasHydrated) {
            // TODO: Move this and createInstance step into the beginPhase
            // to consolidate.
            prepareToHydrateHostInstance(workInProgress, currentHostContext);
          } else {
            const rootContainerInstance = getRootHostContainer();
            const instance = createInstance(type, newProps, rootContainerInstance, currentHostContext, workInProgress); // TODO: For persistent renderers, we should pass children as part
            // of the initial instance creation

            appendAllChildren(instance, workInProgress);
            workInProgress.stateNode = instance; // Certain renderers require commit-time effects for initial mount.
            // (eg DOM renderer supports auto-focus for certain elements).
            // Make sure such renderers get scheduled for later work.

            if (finalizeInitialChildren(instance, type, newProps)) {
              markUpdate(workInProgress);
            }
          }

          if (workInProgress.ref !== null) {
            // If there is a ref on a host node we need to schedule a callback
            markRef(workInProgress);
          }
        }

        bubbleProperties(workInProgress); // This must come at the very end of the complete phase, because it might
        // throw to suspend, and if the resource immediately loads, the work loop
        // will resume rendering as if the work-in-progress completed. So it must
        // fully complete.

        preloadInstanceAndSuspendIfNeeded(workInProgress);
        return null;
      }

    case HostText:
      {
        const newText = newProps;

        if (current && workInProgress.stateNode != null) {
          const oldText = current.memoizedProps; // If we have an alternate, that means this is an update and we need
          // to schedule a side-effect to do the updates.

          updateHostText(current, workInProgress, oldText, newText);
        } else {
          if (typeof newText !== 'string') {
            if (workInProgress.stateNode === null) {
              throw Error(formatProdErrorMessage(166));
            } // This can happen when we abort work.

          }

          const rootContainerInstance = getRootHostContainer();
          const currentHostContext = getHostContext();
          const wasHydrated = popHydrationState(workInProgress);

          if (wasHydrated) {
            if (prepareToHydrateHostTextInstance(workInProgress)) {
              markUpdate(workInProgress);
            }
          } else {
            workInProgress.stateNode = createTextInstance(newText, rootContainerInstance, currentHostContext, workInProgress);
          }
        }

        bubbleProperties(workInProgress);
        return null;
      }

    case SuspenseComponent:
      {
        popSuspenseHandler(workInProgress);
        const nextState = workInProgress.memoizedState; // Special path for dehydrated boundaries. We may eventually move this
        // to its own fiber type so that we can add other kinds of hydration
        // boundaries that aren't associated with a Suspense tree. In anticipation
        // of such a refactor, all the hydration logic is contained in
        // this branch.

        if (current === null || current.memoizedState !== null && current.memoizedState.dehydrated !== null) {
          const fallthroughToNormalSuspensePath = completeDehydratedSuspenseBoundary(current, workInProgress, nextState);

          if (!fallthroughToNormalSuspensePath) {
            if (workInProgress.flags & ForceClientRender) {
              // Special case. There were remaining unhydrated nodes. We treat
              // this as a mismatch. Revert to client rendering.
              return workInProgress;
            } else {
              // Did not finish hydrating, either because this is the initial
              // render or because something suspended.
              return null;
            }
          } // Continue with the normal Suspense path.

        }

        if ((workInProgress.flags & DidCapture) !== NoFlags$1) {
          // Something suspended. Re-render with the fallback children.
          workInProgress.lanes = renderLanes; // Do not reset the effect list.

          if ((workInProgress.mode & ProfileMode) !== NoMode) {
            transferActualDuration(workInProgress);
          } // Don't bubble properties in this case.


          return workInProgress;
        }

        const nextDidTimeout = nextState !== null;
        const prevDidTimeout = current !== null && current.memoizedState !== null;

        if (nextDidTimeout) {
          const offscreenFiber = workInProgress.child;
          let previousCache = null;

          if (offscreenFiber.alternate !== null && offscreenFiber.alternate.memoizedState !== null && offscreenFiber.alternate.memoizedState.cachePool !== null) {
            previousCache = offscreenFiber.alternate.memoizedState.cachePool.pool;
          }

          let cache = null;

          if (offscreenFiber.memoizedState !== null && offscreenFiber.memoizedState.cachePool !== null) {
            cache = offscreenFiber.memoizedState.cachePool.pool;
          }

          if (cache !== previousCache) {
            // Run passive effects to retain/release the cache.
            offscreenFiber.flags |= Passive$1;
          }
        } // If the suspended state of the boundary changes, we need to schedule
        // a passive effect, which is when we process the transitions


        if (nextDidTimeout !== prevDidTimeout) {
          // an effect to toggle the subtree's visibility. When we switch from
          // fallback -> primary, the inner Offscreen fiber schedules this effect
          // as part of its normal complete phase. But when we switch from
          // primary -> fallback, the inner Offscreen fiber does not have a complete
          // phase. So we need to schedule its effect here.
          //
          // We also use this flag to connect/disconnect the effects, but the same
          // logic applies: when re-connecting, the Offscreen fiber's complete
          // phase will handle scheduling the effect. It's only when the fallback
          // is active that we have to do anything special.


          if (nextDidTimeout) {
            const offscreenFiber = workInProgress.child;
            offscreenFiber.flags |= Visibility;
          }
        }

        const retryQueue = workInProgress.updateQueue;
        scheduleRetryEffect(workInProgress, retryQueue);

        bubbleProperties(workInProgress);

        {
          if ((workInProgress.mode & ProfileMode) !== NoMode) {
            if (nextDidTimeout) {
              // Don't count time spent in a timed out Suspense subtree as part of the base duration.
              const primaryChildFragment = workInProgress.child;

              if (primaryChildFragment !== null) {
                // $FlowFixMe[unsafe-arithmetic] Flow doesn't support type casting in combination with the -= operator
                workInProgress.treeBaseDuration -= primaryChildFragment.treeBaseDuration;
              }
            }
          }
        }

        return null;
      }

    case HostPortal:
      popHostContainer();

      if (current === null) {
        preparePortalMount(workInProgress.stateNode.containerInfo);
      }

      bubbleProperties(workInProgress);
      return null;

    case ContextProvider:
      // Pop provider fiber
      const context = workInProgress.type._context;
      popProvider(context);
      bubbleProperties(workInProgress);
      return null;

    case IncompleteClassComponent:
      {
        // Same as class component case. I put it down here so that the tags are
        // sequential to ensure this switch is compiled to a jump table.
        const Component = workInProgress.type;

        if (isContextProvider(Component)) {
          popContext();
        }

        bubbleProperties(workInProgress);
        return null;
      }

    case SuspenseListComponent:
      {
        popSuspenseListContext();
        const renderState = workInProgress.memoizedState;

        if (renderState === null) {
          // We're running in the default, "independent" mode.
          // We don't do anything in this mode.
          bubbleProperties(workInProgress);
          return null;
        }

        let didSuspendAlready = (workInProgress.flags & DidCapture) !== NoFlags$1;
        const renderedTail = renderState.rendering;

        if (renderedTail === null) {
          // We just rendered the head.
          if (!didSuspendAlready) {
            // This is the first pass. We need to figure out if anything is still
            // suspended in the rendered set.
            // If new content unsuspended, but there's still some content that
            // didn't. Then we need to do a second pass that forces everything
            // to keep showing their fallbacks.
            // We might be suspended if something in this render pass suspended, or
            // something in the previous committed pass suspended. Otherwise,
            // there's no chance so we can skip the expensive call to
            // findFirstSuspended.
            const cannotBeSuspended = renderHasNotSuspendedYet() && (current === null || (current.flags & DidCapture) === NoFlags$1);

            if (!cannotBeSuspended) {
              let row = workInProgress.child;

              while (row !== null) {
                const suspended = findFirstSuspended(row);

                if (suspended !== null) {
                  didSuspendAlready = true;
                  workInProgress.flags |= DidCapture;
                  cutOffTailIfNeeded(renderState, false); // If this is a newly suspended tree, it might not get committed as
                  // part of the second pass. In that case nothing will subscribe to
                  // its thenables. Instead, we'll transfer its thenables to the
                  // SuspenseList so that it can retry if they resolve.
                  // There might be multiple of these in the list but since we're
                  // going to wait for all of them anyway, it doesn't really matter
                  // which ones gets to ping. In theory we could get clever and keep
                  // track of how many dependencies remain but it gets tricky because
                  // in the meantime, we can add/remove/change items and dependencies.
                  // We might bail out of the loop before finding any but that
                  // doesn't matter since that means that the other boundaries that
                  // we did find already has their listeners attached.

                  const retryQueue = suspended.updateQueue;
                  workInProgress.updateQueue = retryQueue;
                  scheduleRetryEffect(workInProgress, retryQueue); // Rerender the whole list, but this time, we'll force fallbacks
                  // to stay in place.
                  // Reset the effect flags before doing the second pass since that's now invalid.
                  // Reset the child fibers to their original state.

                  workInProgress.subtreeFlags = NoFlags$1;
                  resetChildFibers(workInProgress, renderLanes); // Set up the Suspense List Context to force suspense and
                  // immediately rerender the children.

                  pushSuspenseListContext(workInProgress, setShallowSuspenseListContext(suspenseStackCursor.current, ForceSuspenseFallback)); // Don't bubble properties in this case.

                  return workInProgress.child;
                }

                row = row.sibling;
              }
            }

            if (renderState.tail !== null && now$1() > getRenderTargetTime()) {
              // We have already passed our CPU deadline but we still have rows
              // left in the tail. We'll just give up further attempts to render
              // the main content and only render fallbacks.
              workInProgress.flags |= DidCapture;
              didSuspendAlready = true;
              cutOffTailIfNeeded(renderState, false); // Since nothing actually suspended, there will nothing to ping this
              // to get it started back up to attempt the next item. While in terms
              // of priority this work has the same priority as this current render,
              // it's not part of the same transition once the transition has
              // committed. If it's sync, we still want to yield so that it can be
              // painted. Conceptually, this is really the same as pinging.
              // We can use any RetryLane even if it's the one currently rendering
              // since we're leaving it behind on this node.

              workInProgress.lanes = SomeRetryLane;
            }
          } else {
            cutOffTailIfNeeded(renderState, false);
          } // Next we're going to render the tail.

        } else {
          // Append the rendered row to the child list.
          if (!didSuspendAlready) {
            const suspended = findFirstSuspended(renderedTail);

            if (suspended !== null) {
              workInProgress.flags |= DidCapture;
              didSuspendAlready = true; // Ensure we transfer the update queue to the parent so that it doesn't
              // get lost if this row ends up dropped during a second pass.

              const retryQueue = suspended.updateQueue;
              workInProgress.updateQueue = retryQueue;
              scheduleRetryEffect(workInProgress, retryQueue);
              cutOffTailIfNeeded(renderState, true); // This might have been modified.

              if (renderState.tail === null && renderState.tailMode === 'hidden' && !renderedTail.alternate && !getIsHydrating() // We don't cut it if we're hydrating.
              ) {
                  // We're done.
                  bubbleProperties(workInProgress);
                  return null;
                }
            } else if ( // The time it took to render last row is greater than the remaining
            // time we have to render. So rendering one more row would likely
            // exceed it.
            now$1() * 2 - renderState.renderingStartTime > getRenderTargetTime() && renderLanes !== OffscreenLane) {
              // We have now passed our CPU deadline and we'll just give up further
              // attempts to render the main content and only render fallbacks.
              // The assumption is that this is usually faster.
              workInProgress.flags |= DidCapture;
              didSuspendAlready = true;
              cutOffTailIfNeeded(renderState, false); // Since nothing actually suspended, there will nothing to ping this
              // to get it started back up to attempt the next item. While in terms
              // of priority this work has the same priority as this current render,
              // it's not part of the same transition once the transition has
              // committed. If it's sync, we still want to yield so that it can be
              // painted. Conceptually, this is really the same as pinging.
              // We can use any RetryLane even if it's the one currently rendering
              // since we're leaving it behind on this node.

              workInProgress.lanes = SomeRetryLane;
            }
          }

          if (renderState.isBackwards) {
            // The effect list of the backwards tail will have been added
            // to the end. This breaks the guarantee that life-cycles fire in
            // sibling order but that isn't a strong guarantee promised by React.
            // Especially since these might also just pop in during future commits.
            // Append to the beginning of the list.
            renderedTail.sibling = workInProgress.child;
            workInProgress.child = renderedTail;
          } else {
            const previousSibling = renderState.last;

            if (previousSibling !== null) {
              previousSibling.sibling = renderedTail;
            } else {
              workInProgress.child = renderedTail;
            }

            renderState.last = renderedTail;
          }
        }

        if (renderState.tail !== null) {
          // We still have tail rows to render.
          // Pop a row.
          const next = renderState.tail;
          renderState.rendering = next;
          renderState.tail = next.sibling;
          renderState.renderingStartTime = now$1();
          next.sibling = null; // Restore the context.
          // TODO: We can probably just avoid popping it instead and only
          // setting it the first time we go from not suspended to suspended.

          let suspenseContext = suspenseStackCursor.current;

          if (didSuspendAlready) {
            suspenseContext = setShallowSuspenseListContext(suspenseContext, ForceSuspenseFallback);
          } else {
            suspenseContext = setDefaultShallowSuspenseListContext(suspenseContext);
          }

          pushSuspenseListContext(workInProgress, suspenseContext); // Do a pass over the next row.
          // Don't bubble properties in this case.

          return next;
        }

        bubbleProperties(workInProgress);
        return null;
      }

    case ScopeComponent:
      {

        break;
      }

    case OffscreenComponent:
    case LegacyHiddenComponent:
      {
        popSuspenseHandler(workInProgress);
        popHiddenContext();
        const nextState = workInProgress.memoizedState;
        const nextIsHidden = nextState !== null; // Schedule a Visibility effect if the visibility has changed

        {
          if (current !== null) {
            const prevState = current.memoizedState;
            const prevIsHidden = prevState !== null;

            if (prevIsHidden !== nextIsHidden) {
              workInProgress.flags |= Visibility;
            }
          } else {
            // On initial mount, we only need a Visibility effect if the tree
            // is hidden.
            if (nextIsHidden) {
              workInProgress.flags |= Visibility;
            }
          }
        }

        if (!nextIsHidden || (workInProgress.mode & ConcurrentMode) === NoMode) {
          bubbleProperties(workInProgress);
        } else {
          // Don't bubble properties for hidden children unless we're rendering
          // at offscreen priority.
          if (includesSomeLane(renderLanes, OffscreenLane) && // Also don't bubble if the tree suspended
          (workInProgress.flags & DidCapture) === NoLanes) {
            bubbleProperties(workInProgress); // Check if there was an insertion or update in the hidden subtree.
            // If so, we need to hide those nodes in the commit phase, so
            // schedule a visibility effect.

            if (workInProgress.subtreeFlags & (Placement | Update)) {
              workInProgress.flags |= Visibility;
            }
          }
        }

        const offscreenQueue = workInProgress.updateQueue;

        if (offscreenQueue !== null) {
          const retryQueue = offscreenQueue.retryQueue;
          scheduleRetryEffect(workInProgress, retryQueue);
        }

        {
          let previousCache = null;

          if (current !== null && current.memoizedState !== null && current.memoizedState.cachePool !== null) {
            previousCache = current.memoizedState.cachePool.pool;
          }

          let cache = null;

          if (workInProgress.memoizedState !== null && workInProgress.memoizedState.cachePool !== null) {
            cache = workInProgress.memoizedState.cachePool.pool;
          }

          if (cache !== previousCache) {
            // Run passive effects to retain/release the cache.
            workInProgress.flags |= Passive$1;
          }
        }

        popTransition(workInProgress, current);
        return null;
      }

    case CacheComponent:
      {
        {
          let previousCache = null;

          if (current !== null) {
            previousCache = current.memoizedState.cache;
          }

          const cache = workInProgress.memoizedState.cache;

          if (cache !== previousCache) {
            // Run passive effects to retain/release the cache.
            workInProgress.flags |= Passive$1;
          }

          popCacheProvider();
          bubbleProperties(workInProgress);
        }

        return null;
      }

    case TracingMarkerComponent:
      {

        return null;
      }
  }

  throw Error(formatProdErrorMessage(156, workInProgress.tag));
}

function unwindWork(current, workInProgress, renderLanes) {
  // Note: This intentionally doesn't check if we're hydrating because comparing
  // to the current tree provider fiber is just as fast and less error-prone.
  // Ideally we would have a special version of the work loop only
  // for hydration.
  popTreeContext(workInProgress);

  switch (workInProgress.tag) {
    case ClassComponent:
      {
        const Component = workInProgress.type;

        if (isContextProvider(Component)) {
          popContext();
        }

        const flags = workInProgress.flags;

        if (flags & ShouldCapture) {
          workInProgress.flags = flags & ~ShouldCapture | DidCapture;

          if ((workInProgress.mode & ProfileMode) !== NoMode) {
            transferActualDuration(workInProgress);
          }

          return workInProgress;
        }

        return null;
      }

    case HostRoot:
      {

        {
          popCacheProvider();
        }
        popHostContainer();
        popTopLevelContextObject();
        const flags = workInProgress.flags;

        if ((flags & ShouldCapture) !== NoFlags$1 && (flags & DidCapture) === NoFlags$1) {
          // There was an error during render that wasn't captured by a suspense
          // boundary. Do a second pass on the root to unmount the children.
          workInProgress.flags = flags & ~ShouldCapture | DidCapture;
          return workInProgress;
        } // We unwound to the root without completing it. Exit.


        return null;
      }

    case HostHoistable:
    case HostSingleton:
    case HostComponent:
      {
        // TODO: popHydrationState
        popHostContext(workInProgress);
        return null;
      }

    case SuspenseComponent:
      {
        popSuspenseHandler(workInProgress);
        const suspenseState = workInProgress.memoizedState;

        if (suspenseState !== null && suspenseState.dehydrated !== null) {
          if (workInProgress.alternate === null) {
            throw Error(formatProdErrorMessage(340));
          }

          resetHydrationState();
        }

        const flags = workInProgress.flags;

        if (flags & ShouldCapture) {
          workInProgress.flags = flags & ~ShouldCapture | DidCapture; // Captured a suspense effect. Re-render the boundary.

          if ((workInProgress.mode & ProfileMode) !== NoMode) {
            transferActualDuration(workInProgress);
          }

          return workInProgress;
        }

        return null;
      }

    case SuspenseListComponent:
      {
        popSuspenseListContext(); // SuspenseList doesn't actually catch anything. It should've been
        // caught by a nested boundary. If not, it should bubble through.

        return null;
      }

    case HostPortal:
      popHostContainer();
      return null;

    case ContextProvider:
      const context = workInProgress.type._context;
      popProvider(context);
      return null;

    case OffscreenComponent:
    case LegacyHiddenComponent:
      {
        popSuspenseHandler(workInProgress);
        popHiddenContext();
        popTransition(workInProgress, current);
        const flags = workInProgress.flags;

        if (flags & ShouldCapture) {
          workInProgress.flags = flags & ~ShouldCapture | DidCapture; // Captured a suspense effect. Re-render the boundary.

          if ((workInProgress.mode & ProfileMode) !== NoMode) {
            transferActualDuration(workInProgress);
          }

          return workInProgress;
        }

        return null;
      }

    case CacheComponent:
      {
        popCacheProvider();
      }

      return null;

    case TracingMarkerComponent:

      return null;

    default:
      return null;
  }
}

function unwindInterruptedWork(current, interruptedWork, renderLanes) {
  // Note: This intentionally doesn't check if we're hydrating because comparing
  // to the current tree provider fiber is just as fast and less error-prone.
  // Ideally we would have a special version of the work loop only
  // for hydration.
  popTreeContext(interruptedWork);

  switch (interruptedWork.tag) {
    case ClassComponent:
      {
        const childContextTypes = interruptedWork.type.childContextTypes;

        if (childContextTypes !== null && childContextTypes !== undefined) {
          popContext();
        }

        break;
      }

    case HostRoot:
      {

        {
          popCacheProvider();
        }
        popHostContainer();
        popTopLevelContextObject();
        break;
      }

    case HostHoistable:
    case HostSingleton:
    case HostComponent:
      {
        popHostContext(interruptedWork);
        break;
      }

    case HostPortal:
      popHostContainer();
      break;

    case SuspenseComponent:
      popSuspenseHandler(interruptedWork);
      break;

    case SuspenseListComponent:
      popSuspenseListContext();
      break;

    case ContextProvider:
      const context = interruptedWork.type._context;
      popProvider(context);
      break;

    case OffscreenComponent:
    case LegacyHiddenComponent:
      popSuspenseHandler(interruptedWork);
      popHiddenContext();
      popTransition(interruptedWork, current);
      break;

    case CacheComponent:
      {
        popCacheProvider();
      }

      break;
  }
}

function invokeGuardedCallbackImpl(name, func, context) {
  {
    // $FlowFixMe[method-unbinding]
    const funcArgs = Array.prototype.slice.call(arguments, 3);

    try {
      // $FlowFixMe[incompatible-call] Flow doesn't understand the arguments splicing.
      func.apply(context, funcArgs);
    } catch (error) {
      this.onError(error);
    }
  }
}

let hasError = false;
let caughtError = null; // Used by event system to capture/rethrow the first error.

let hasRethrowError = false;
let rethrowError = null;
const reporter = {
  onError(error) {
    hasError = true;
    caughtError = error;
  }

};
/**
 * Call a function while guarding against errors that happens within it.
 * Returns an error if it throws, otherwise null.
 *
 * In production, this is implemented using a try-catch. The reason we don't
 * use a try-catch directly is so that we can swap out a different
 * implementation in DEV mode.
 *
 * @param {String} name of the guard to use for logging or debugging
 * @param {Function} func The function to invoke
 * @param {*} context The context to use when calling the function
 * @param {...*} args Arguments for function
 */

function invokeGuardedCallback(name, func, context, a, b, c, d, e, f) {
  hasError = false;
  caughtError = null;
  invokeGuardedCallbackImpl.apply(reporter, arguments);
}
/**
 * Same as invokeGuardedCallback, but instead of returning an error, it stores
 * it in a global so it can be rethrown by `rethrowCaughtError` later.
 * TODO: See if caughtError and rethrowError can be unified.
 *
 * @param {String} name of the guard to use for logging or debugging
 * @param {Function} func The function to invoke
 * @param {*} context The context to use when calling the function
 * @param {...*} args Arguments for function
 */

function invokeGuardedCallbackAndCatchFirstError(name, func, context, a, b, c, d, e, f) {
  invokeGuardedCallback.apply(this, arguments);

  if (hasError) {
    const error = clearCaughtError();

    if (!hasRethrowError) {
      hasRethrowError = true;
      rethrowError = error;
    }
  }
}
/**
 * During execution of guarded functions we will capture the first error which
 * we will rethrow to be handled by the top level error handler.
 */

function rethrowCaughtError() {
  if (hasRethrowError) {
    const error = rethrowError;
    hasRethrowError = false;
    rethrowError = null;
    throw error;
  }
}
function clearCaughtError() {
  if (hasError) {
    const error = caughtError;
    hasError = false;
    caughtError = null;
    return error;
  } else {
    throw Error(formatProdErrorMessage(198));
  }
}

// Allows us to avoid traversing the return path to find the nearest Offscreen ancestor.


let offscreenSubtreeIsHidden = false;
let offscreenSubtreeWasHidden = false;
const PossiblyWeakSet = typeof WeakSet === 'function' ? WeakSet : Set;
let nextEffect = null; // Used for Profiling builds to track updaters.

let inProgressLanes = null;
let inProgressRoot = null;

function shouldProfile(current) {
  return (current.mode & ProfileMode) !== NoMode && (getExecutionContext() & CommitContext) !== NoContext;
}

function callComponentWillUnmountWithTimer(current, instance) {
  instance.props = current.memoizedProps;
  instance.state = current.memoizedState;

  if (shouldProfile(current)) {
    try {
      startLayoutEffectTimer();
      instance.componentWillUnmount();
    } finally {
      recordLayoutEffectDuration(current);
    }
  } else {
    instance.componentWillUnmount();
  }
} // Capture errors so they don't interrupt unmounting.


function safelyCallComponentWillUnmount(current, nearestMountedAncestor, instance) {
  try {
    callComponentWillUnmountWithTimer(current, instance);
  } catch (error) {
    captureCommitPhaseError(current, nearestMountedAncestor, error);
  }
} // Capture errors so they don't interrupt mounting.


function safelyAttachRef(current, nearestMountedAncestor) {
  try {
    commitAttachRef(current);
  } catch (error) {
    captureCommitPhaseError(current, nearestMountedAncestor, error);
  }
}

function safelyDetachRef(current, nearestMountedAncestor) {
  const ref = current.ref;
  const refCleanup = current.refCleanup;

  if (ref !== null) {
    if (typeof refCleanup === 'function') {
      try {
        if (shouldProfile(current)) {
          try {
            startLayoutEffectTimer();
            refCleanup();
          } finally {
            recordLayoutEffectDuration(current);
          }
        } else {
          refCleanup();
        }
      } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error);
      } finally {
        // `refCleanup` has been called. Nullify all references to it to prevent double invocation.
        current.refCleanup = null;
        const finishedWork = current.alternate;

        if (finishedWork != null) {
          finishedWork.refCleanup = null;
        }
      }
    } else if (typeof ref === 'function') {
      let retVal;

      try {
        if (shouldProfile(current)) {
          try {
            startLayoutEffectTimer();
            retVal = ref(null);
          } finally {
            recordLayoutEffectDuration(current);
          }
        } else {
          retVal = ref(null);
        }
      } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error);
      }
    } else {
      // $FlowFixMe[incompatible-use] unable to narrow type to RefObject
      ref.current = null;
    }
  }
}

function safelyCallDestroy(current, nearestMountedAncestor, destroy) {
  try {
    destroy();
  } catch (error) {
    captureCommitPhaseError(current, nearestMountedAncestor, error);
  }
}
let shouldFireAfterActiveInstanceBlur = false;
function commitBeforeMutationEffects(root, firstChild) {
  prepareForCommit();
  nextEffect = firstChild;
  commitBeforeMutationEffects_begin(); // We no longer need to track the active instance fiber

  const shouldFire = shouldFireAfterActiveInstanceBlur;
  shouldFireAfterActiveInstanceBlur = false;
  return shouldFire;
}

function commitBeforeMutationEffects_begin() {
  while (nextEffect !== null) {
    const fiber = nextEffect; // This phase is only used for beforeActiveInstanceBlur.

    const child = fiber.child;

    if ((fiber.subtreeFlags & BeforeMutationMask) !== NoFlags$1 && child !== null) {
      child.return = fiber;
      nextEffect = child;
    } else {
      commitBeforeMutationEffects_complete();
    }
  }
}

function commitBeforeMutationEffects_complete() {
  while (nextEffect !== null) {
    const fiber = nextEffect;

    try {
      commitBeforeMutationEffectsOnFiber(fiber);
    } catch (error) {
      captureCommitPhaseError(fiber, fiber.return, error);
    }
    const sibling = fiber.sibling;

    if (sibling !== null) {
      sibling.return = fiber.return;
      nextEffect = sibling;
      return;
    }

    nextEffect = fiber.return;
  }
}

function commitBeforeMutationEffectsOnFiber(finishedWork) {
  const current = finishedWork.alternate;
  const flags = finishedWork.flags;

  switch (finishedWork.tag) {
    case FunctionComponent:
      {
        {
          if ((flags & Update) !== NoFlags$1) {
            commitUseEffectEventMount(finishedWork);
          }
        }

        break;
      }

    case ForwardRef:
    case SimpleMemoComponent:
      {
        break;
      }

    case ClassComponent:
      {
        if ((flags & Snapshot) !== NoFlags$1) {
          if (current !== null) {
            const prevProps = current.memoizedProps;
            const prevState = current.memoizedState;
            const instance = finishedWork.stateNode; // We could update instance props and state here,

            const snapshot = instance.getSnapshotBeforeUpdate(finishedWork.elementType === finishedWork.type ? prevProps : resolveDefaultProps(finishedWork.type, prevProps), prevState);

            instance.__reactInternalSnapshotBeforeUpdate = snapshot;
          }
        }

        break;
      }

    case HostRoot:
      {
        if ((flags & Snapshot) !== NoFlags$1) {
          {
            const root = finishedWork.stateNode;
            clearContainer(root.containerInfo);
          }
        }

        break;
      }

    case HostComponent:
    case HostHoistable:
    case HostSingleton:
    case HostText:
    case HostPortal:
    case IncompleteClassComponent:
      // Nothing to do for these component types
      break;

    default:
      {
        if ((flags & Snapshot) !== NoFlags$1) {
          throw Error(formatProdErrorMessage(163));
        }
      }
  }
}

function commitHookEffectListUnmount(flags, finishedWork, nearestMountedAncestor) {
  const updateQueue = finishedWork.updateQueue;
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;

  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;

    do {
      if ((effect.tag & flags) === flags) {
        // Unmount
        const inst = effect.inst;
        const destroy = inst.destroy;

        if (destroy !== undefined) {
          inst.destroy = undefined;

          {
            if ((flags & Passive) !== NoFlags) {
              markComponentPassiveEffectUnmountStarted(finishedWork);
            } else if ((flags & Layout) !== NoFlags) {
              markComponentLayoutEffectUnmountStarted(finishedWork);
            }
          }

          safelyCallDestroy(finishedWork, nearestMountedAncestor, destroy);

          {
            if ((flags & Passive) !== NoFlags) {
              markComponentPassiveEffectUnmountStopped();
            } else if ((flags & Layout) !== NoFlags) {
              markComponentLayoutEffectUnmountStopped();
            }
          }
        }
      }

      effect = effect.next;
    } while (effect !== firstEffect);
  }
}

function commitHookEffectListMount(flags, finishedWork) {
  const updateQueue = finishedWork.updateQueue;
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;

  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;

    do {
      if ((effect.tag & flags) === flags) {
        {
          if ((flags & Passive) !== NoFlags) {
            markComponentPassiveEffectMountStarted(finishedWork);
          } else if ((flags & Layout) !== NoFlags) {
            markComponentLayoutEffectMountStarted(finishedWork);
          }
        } // Mount


        const create = effect.create;

        const inst = effect.inst;
        const destroy = create();
        inst.destroy = destroy;

        {
          if ((flags & Passive) !== NoFlags) {
            markComponentPassiveEffectMountStopped();
          } else if ((flags & Layout) !== NoFlags) {
            markComponentLayoutEffectMountStopped();
          }
        }
      }

      effect = effect.next;
    } while (effect !== firstEffect);
  }
}

function commitUseEffectEventMount(finishedWork) {
  const updateQueue = finishedWork.updateQueue;
  const eventPayloads = updateQueue !== null ? updateQueue.events : null;

  if (eventPayloads !== null) {
    for (let ii = 0; ii < eventPayloads.length; ii++) {
      const _eventPayloads$ii = eventPayloads[ii],
            ref = _eventPayloads$ii.ref,
            nextImpl = _eventPayloads$ii.nextImpl;
      ref.impl = nextImpl;
    }
  }
}

function commitPassiveEffectDurations(finishedRoot, finishedWork) {
  if (getExecutionContext() & CommitContext) {
    // Only Profilers with work in their subtree will have an Update effect scheduled.
    if ((finishedWork.flags & Update) !== NoFlags$1) {
      switch (finishedWork.tag) {
        case Profiler:
          {
            const passiveEffectDuration = finishedWork.stateNode.passiveEffectDuration;
            const _finishedWork$memoize = finishedWork.memoizedProps,
                  id = _finishedWork$memoize.id,
                  onPostCommit = _finishedWork$memoize.onPostCommit; // This value will still reflect the previous commit phase.
            // It does not get reset until the start of the next commit phase.

            const commitTime = getCommitTime();
            let phase = finishedWork.alternate === null ? 'mount' : 'update';

            {
              if (isCurrentUpdateNested()) {
                phase = 'nested-update';
              }
            }

            if (typeof onPostCommit === 'function') {
              onPostCommit(id, phase, passiveEffectDuration, commitTime);
            } // Bubble times to the next nearest ancestor Profiler.
            // After we process that Profiler, we'll bubble further up.


            let parentFiber = finishedWork.return;

            outer: while (parentFiber !== null) {
              switch (parentFiber.tag) {
                case HostRoot:
                  const root = parentFiber.stateNode;
                  root.passiveEffectDuration += passiveEffectDuration;
                  break outer;

                case Profiler:
                  const parentStateNode = parentFiber.stateNode;
                  parentStateNode.passiveEffectDuration += passiveEffectDuration;
                  break outer;
              }

              parentFiber = parentFiber.return;
            }

            break;
          }
      }
    }
  }
}

function commitHookLayoutEffects(finishedWork, hookFlags) {
  // At this point layout effects have already been destroyed (during mutation phase).
  // This is done to prevent sibling component effects from interfering with each other,
  // e.g. a destroy function in one component should never override a ref set
  // by a create function in another component during the same commit.
  if (shouldProfile(finishedWork)) {
    try {
      startLayoutEffectTimer();
      commitHookEffectListMount(hookFlags, finishedWork);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }

    recordLayoutEffectDuration(finishedWork);
  } else {
    try {
      commitHookEffectListMount(hookFlags, finishedWork);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }
  }
}

function commitClassLayoutLifecycles(finishedWork, current) {
  const instance = finishedWork.stateNode;

  if (current === null) {

    if (shouldProfile(finishedWork)) {
      try {
        startLayoutEffectTimer();
        instance.componentDidMount();
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }

      recordLayoutEffectDuration(finishedWork);
    } else {
      try {
        instance.componentDidMount();
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
  } else {
    const prevProps = finishedWork.elementType === finishedWork.type ? current.memoizedProps : resolveDefaultProps(finishedWork.type, current.memoizedProps);
    const prevState = current.memoizedState; // We could update instance props and state here,

    if (shouldProfile(finishedWork)) {
      try {
        startLayoutEffectTimer();
        instance.componentDidUpdate(prevProps, prevState, instance.__reactInternalSnapshotBeforeUpdate);
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }

      recordLayoutEffectDuration(finishedWork);
    } else {
      try {
        instance.componentDidUpdate(prevProps, prevState, instance.__reactInternalSnapshotBeforeUpdate);
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
  }
}

function commitClassCallbacks(finishedWork) {
  // TODO: I think this is now always non-null by the time it reaches the
  // commit phase. Consider removing the type check.
  const updateQueue = finishedWork.updateQueue;

  if (updateQueue !== null) {
    const instance = finishedWork.stateNode;
    // but instead we rely on them being set during last render.
    // TODO: revisit this when we implement resuming.


    try {
      commitCallbacks(updateQueue, instance);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }
  }
}

function commitHostComponentMount(finishedWork) {
  const type = finishedWork.type;
  const props = finishedWork.memoizedProps;
  const instance = finishedWork.stateNode;

  try {
    commitMount(instance, type, props, finishedWork);
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

function commitProfilerUpdate(finishedWork, current) {
  if (getExecutionContext() & CommitContext) {
    try {
      const _finishedWork$memoize2 = finishedWork.memoizedProps,
            onCommit = _finishedWork$memoize2.onCommit,
            onRender = _finishedWork$memoize2.onRender;
      const effectDuration = finishedWork.stateNode.effectDuration;
      const commitTime = getCommitTime();
      let phase = current === null ? 'mount' : 'update';

      if (enableProfilerNestedUpdatePhase) {
        if (isCurrentUpdateNested()) {
          phase = 'nested-update';
        }
      }

      if (typeof onRender === 'function') {
        onRender(finishedWork.memoizedProps.id, phase, finishedWork.actualDuration, finishedWork.treeBaseDuration, finishedWork.actualStartTime, commitTime);
      }

      if (enableProfilerCommitHooks) {
        if (typeof onCommit === 'function') {
          onCommit(finishedWork.memoizedProps.id, phase, effectDuration, commitTime);
        } // Schedule a passive effect for this Profiler to call onPostCommit hooks.
        // This effect should be scheduled even if there is no onPostCommit callback for this Profiler,
        // because the effect is also where times bubble to parent Profilers.


        enqueuePendingPassiveProfilerEffect(finishedWork); // Propagate layout effect durations to the next nearest Profiler ancestor.
        // Do not reset these values until the next render so DevTools has a chance to read them first.

        let parentFiber = finishedWork.return;

        outer: while (parentFiber !== null) {
          switch (parentFiber.tag) {
            case HostRoot:
              const root = parentFiber.stateNode;
              root.effectDuration += effectDuration;
              break outer;

            case Profiler:
              const parentStateNode = parentFiber.stateNode;
              parentStateNode.effectDuration += effectDuration;
              break outer;
          }

          parentFiber = parentFiber.return;
        }
      }
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }
  }
}

function commitLayoutEffectOnFiber(finishedRoot, current, finishedWork, committedLanes) {
  // When updating this function, also update reappearLayoutEffects, which does
  // most of the same things when an offscreen tree goes from hidden -> visible.
  const flags = finishedWork.flags;

  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
      {
        recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);

        if (flags & Update) {
          commitHookLayoutEffects(finishedWork, Layout | HasEffect);
        }

        break;
      }

    case ClassComponent:
      {
        recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);

        if (flags & Update) {
          commitClassLayoutLifecycles(finishedWork, current);
        }

        if (flags & Callback) {
          commitClassCallbacks(finishedWork);
        }

        if (flags & Ref) {
          safelyAttachRef(finishedWork, finishedWork.return);
        }

        break;
      }

    case HostRoot:
      {
        recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);

        if (flags & Callback) {
          // TODO: I think this is now always non-null by the time it reaches the
          // commit phase. Consider removing the type check.
          const updateQueue = finishedWork.updateQueue;

          if (updateQueue !== null) {
            let instance = null;

            if (finishedWork.child !== null) {
              switch (finishedWork.child.tag) {
                case HostSingleton:
                case HostComponent:
                  instance = getPublicInstance(finishedWork.child.stateNode);
                  break;

                case ClassComponent:
                  instance = finishedWork.child.stateNode;
                  break;
              }
            }

            try {
              commitCallbacks(updateQueue, instance);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
        }

        break;
      }

    case HostHoistable:
      {
        {
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);

          if (flags & Ref) {
            safelyAttachRef(finishedWork, finishedWork.return);
          }

          break;
        } // Fall through

      }

    case HostSingleton:
    case HostComponent:
      {
        recursivelyTraverseLayoutEffects(finishedRoot, finishedWork); // Renderers may schedule work to be done after host components are mounted
        // (eg DOM renderer may schedule auto-focus for inputs and form controls).
        // These effects should only be committed when components are first mounted,
        // aka when there is no current/alternate.

        if (current === null && flags & Update) {
          commitHostComponentMount(finishedWork);
        }

        if (flags & Ref) {
          safelyAttachRef(finishedWork, finishedWork.return);
        }

        break;
      }

    case Profiler:
      {
        recursivelyTraverseLayoutEffects(finishedRoot, finishedWork); // TODO: Should this fire inside an offscreen tree? Or should it wait to
        // fire when the tree becomes visible again.

        if (flags & Update) {
          commitProfilerUpdate(finishedWork, current);
        }

        break;
      }

    case SuspenseComponent:
      {
        recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);

        if (flags & Update) {
          commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
        }

        break;
      }

    case OffscreenComponent:
      {
        const isModernRoot = (finishedWork.mode & ConcurrentMode) !== NoMode;

        if (isModernRoot) {
          const isHidden = finishedWork.memoizedState !== null;
          const newOffscreenSubtreeIsHidden = isHidden || offscreenSubtreeIsHidden;

          if (newOffscreenSubtreeIsHidden) ; else {
            // The Offscreen tree is visible.
            const wasHidden = current !== null && current.memoizedState !== null;
            const newOffscreenSubtreeWasHidden = wasHidden || offscreenSubtreeWasHidden;
            const prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden;
            const prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
            offscreenSubtreeIsHidden = newOffscreenSubtreeIsHidden;
            offscreenSubtreeWasHidden = newOffscreenSubtreeWasHidden;

            if (offscreenSubtreeWasHidden && !prevOffscreenSubtreeWasHidden) {
              // This is the root of a reappearing boundary. As we continue
              // traversing the layout effects, we must also re-mount layout
              // effects that were unmounted when the Offscreen subtree was
              // hidden. So this is a superset of the normal commitLayoutEffects.
              const includeWorkInProgressEffects = (finishedWork.subtreeFlags & LayoutMask) !== NoFlags$1;
              recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
            } else {
              recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            }

            offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
            offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
          }
        } else {
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
        }

        if (flags & Ref) {
          const props = finishedWork.memoizedProps;

          if (props.mode === 'manual') {
            safelyAttachRef(finishedWork, finishedWork.return);
          } else {
            safelyDetachRef(finishedWork, finishedWork.return);
          }
        }

        break;
      }

    default:
      {
        recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
        break;
      }
  }
}

function hideOrUnhideAllChildren(finishedWork, isHidden) {
  // Only hide or unhide the top-most host nodes.
  let hostSubtreeRoot = null;

  {
    // We only have the top Fiber that was inserted but we need to recurse down its
    // children to find all the terminal nodes.
    let node = finishedWork;

    while (true) {
      if (node.tag === HostComponent || (node.tag === HostHoistable ) || (node.tag === HostSingleton )) {
        if (hostSubtreeRoot === null) {
          hostSubtreeRoot = node;

          try {
            const instance = node.stateNode;

            if (isHidden) {
              hideInstance(instance);
            } else {
              unhideInstance(node.stateNode, node.memoizedProps);
            }
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        }
      } else if (node.tag === HostText) {
        if (hostSubtreeRoot === null) {
          try {
            const instance = node.stateNode;

            if (isHidden) {
              hideTextInstance(instance);
            } else {
              unhideTextInstance(instance, node.memoizedProps);
            }
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        }
      } else if ((node.tag === OffscreenComponent || node.tag === LegacyHiddenComponent) && node.memoizedState !== null && node !== finishedWork) ; else if (node.child !== null) {
        node.child.return = node;
        node = node.child;
        continue;
      }

      if (node === finishedWork) {
        return;
      }

      while (node.sibling === null) {
        if (node.return === null || node.return === finishedWork) {
          return;
        }

        if (hostSubtreeRoot === node) {
          hostSubtreeRoot = null;
        }

        node = node.return;
      }

      if (hostSubtreeRoot === node) {
        hostSubtreeRoot = null;
      }

      node.sibling.return = node.return;
      node = node.sibling;
    }
  }
}

function commitAttachRef(finishedWork) {
  const ref = finishedWork.ref;

  if (ref !== null) {
    const instance = finishedWork.stateNode;
    let instanceToUse;

    switch (finishedWork.tag) {
      case HostHoistable:
      case HostSingleton:
      case HostComponent:
        instanceToUse = getPublicInstance(instance);
        break;

      default:
        instanceToUse = instance;
    } // Moved outside to ensure DCE works with this flag

    if (typeof ref === 'function') {
      if (shouldProfile(finishedWork)) {
        try {
          startLayoutEffectTimer();
          finishedWork.refCleanup = ref(instanceToUse);
        } finally {
          recordLayoutEffectDuration(finishedWork);
        }
      } else {
        finishedWork.refCleanup = ref(instanceToUse);
      }
    } else {


      ref.current = instanceToUse;
    }
  }
}

function detachFiberMutation(fiber) {
  // Cut off the return pointer to disconnect it from the tree.
  // This enables us to detect and warn against state updates on an unmounted component.
  // It also prevents events from bubbling from within disconnected components.
  //
  // Ideally, we should also clear the child pointer of the parent alternate to let this
  // get GC:ed but we don't know which for sure which parent is the current
  // one so we'll settle for GC:ing the subtree of this child.
  // This child itself will be GC:ed when the parent updates the next time.
  //
  // Note that we can't clear child or sibling pointers yet.
  // They're needed for passive effects and for findDOMNode.
  // We defer those fields, and all other cleanup, to the passive phase (see detachFiberAfterEffects).
  //
  // Don't reset the alternate yet, either. We need that so we can detach the
  // alternate's fields in the passive phase. Clearing the return pointer is
  // sufficient for findDOMNode semantics.
  const alternate = fiber.alternate;

  if (alternate !== null) {
    alternate.return = null;
  }

  fiber.return = null;
}

function detachFiberAfterEffects(fiber) {
  const alternate = fiber.alternate;

  if (alternate !== null) {
    fiber.alternate = null;
    detachFiberAfterEffects(alternate);
  } // Clear cyclical Fiber fields. This level alone is designed to roughly
  // approximate the planned Fiber refactor. In that world, `setState` will be
  // bound to a special "instance" object instead of a Fiber. The Instance
  // object will not have any of these fields. It will only be connected to
  // the fiber tree via a single link at the root. So if this level alone is
  // sufficient to fix memory issues, that bodes well for our plans.


  fiber.child = null;
  fiber.deletions = null;
  fiber.sibling = null; // The `stateNode` is cyclical because on host nodes it points to the host
  // tree, which has its own pointers to children, parents, and siblings.
  // The other host nodes also point back to fibers, so we should detach that
  // one, too.

  if (fiber.tag === HostComponent) {
    const hostInstance = fiber.stateNode;

    if (hostInstance !== null) {
      detachDeletedInstance(hostInstance);
    }
  }

  fiber.stateNode = null;
  // disconnected the fiber from the tree. So even if something leaks this
  // particular fiber, it won't leak anything else.


  fiber.return = null;
  fiber.dependencies = null;
  fiber.memoizedProps = null;
  fiber.memoizedState = null;
  fiber.pendingProps = null;
  fiber.stateNode = null; // TODO: Move to `commitPassiveUnmountInsideDeletedTreeOnFiber` instead.

  fiber.updateQueue = null;
}

function getHostParentFiber(fiber) {
  let parent = fiber.return;

  while (parent !== null) {
    if (isHostParent(parent)) {
      return parent;
    }

    parent = parent.return;
  }

  throw Error(formatProdErrorMessage(160));
}

function isHostParent(fiber) {
  return fiber.tag === HostComponent || fiber.tag === HostRoot || (fiber.tag === HostHoistable ) || (fiber.tag === HostSingleton ) || fiber.tag === HostPortal;
}

function getHostSibling(fiber) {
  // We're going to search forward into the tree until we find a sibling host
  // node. Unfortunately, if multiple insertions are done in a row we have to
  // search past them. This leads to exponential search for the next sibling.
  // TODO: Find a more efficient way to do this.
  let node = fiber;

  siblings: while (true) {
    // If we didn't find anything, let's try the next sibling.
    while (node.sibling === null) {
      if (node.return === null || isHostParent(node.return)) {
        // If we pop out of the root or hit the parent the fiber we are the
        // last sibling.
        return null;
      } // $FlowFixMe[incompatible-type] found when upgrading Flow


      node = node.return;
    }

    node.sibling.return = node.return;
    node = node.sibling;

    while (node.tag !== HostComponent && node.tag !== HostText && (node.tag !== HostSingleton) && node.tag !== DehydratedFragment) {
      // If it is not host node and, we might have a host node inside it.
      // Try to search down until we find one.
      if (node.flags & Placement) {
        // If we don't have a child, try the siblings instead.
        continue siblings;
      } // If we don't have a child, try the siblings instead.
      // We also skip portals because they are not part of this host tree.


      if (node.child === null || node.tag === HostPortal) {
        continue siblings;
      } else {
        node.child.return = node;
        node = node.child;
      }
    } // Check if this host node is stable or about to be placed.


    if (!(node.flags & Placement)) {
      // Found it!
      return node.stateNode;
    }
  }
}

function commitPlacement(finishedWork) {

  {
    if (finishedWork.tag === HostSingleton) {
      // Singletons are already in the Host and don't need to be placed
      // Since they operate somewhat like Portals though their children will
      // have Placement and will get placed inside them
      return;
    }
  } // Recursively insert all host nodes into the parent.


  const parentFiber = getHostParentFiber(finishedWork);

  switch (parentFiber.tag) {
    case HostSingleton:
      {
        {
          const parent = parentFiber.stateNode;
          const before = getHostSibling(finishedWork); // We only have the top Fiber that was inserted but we need to recurse down its
          // children to find all the terminal nodes.

          insertOrAppendPlacementNode(finishedWork, before, parent);
          break;
        } // Fall through

      }

    case HostComponent:
      {
        const parent = parentFiber.stateNode;

        if (parentFiber.flags & ContentReset) {
          // Reset the text content of the parent before doing any insertions
          resetTextContent(parent); // Clear ContentReset from the effect tag

          parentFiber.flags &= ~ContentReset;
        }

        const before = getHostSibling(finishedWork); // We only have the top Fiber that was inserted but we need to recurse down its
        // children to find all the terminal nodes.

        insertOrAppendPlacementNode(finishedWork, before, parent);
        break;
      }

    case HostRoot:
    case HostPortal:
      {
        const parent = parentFiber.stateNode.containerInfo;
        const before = getHostSibling(finishedWork);
        insertOrAppendPlacementNodeIntoContainer(finishedWork, before, parent);
        break;
      }

    default:
      throw Error(formatProdErrorMessage(161));
  }
}

function insertOrAppendPlacementNodeIntoContainer(node, before, parent) {
  const tag = node.tag;
  const isHost = tag === HostComponent || tag === HostText;

  if (isHost) {
    const stateNode = node.stateNode;

    if (before) {
      insertInContainerBefore(parent, stateNode, before);
    } else {
      appendChildToContainer(parent, stateNode);
    }
  } else if (tag === HostPortal || (tag === HostSingleton )) ; else {
    const child = node.child;

    if (child !== null) {
      insertOrAppendPlacementNodeIntoContainer(child, before, parent);
      let sibling = child.sibling;

      while (sibling !== null) {
        insertOrAppendPlacementNodeIntoContainer(sibling, before, parent);
        sibling = sibling.sibling;
      }
    }
  }
}

function insertOrAppendPlacementNode(node, before, parent) {
  const tag = node.tag;
  const isHost = tag === HostComponent || tag === HostText;

  if (isHost) {
    const stateNode = node.stateNode;

    if (before) {
      insertBefore(parent, stateNode, before);
    } else {
      appendChild(parent, stateNode);
    }
  } else if (tag === HostPortal || (tag === HostSingleton )) ; else {
    const child = node.child;

    if (child !== null) {
      insertOrAppendPlacementNode(child, before, parent);
      let sibling = child.sibling;

      while (sibling !== null) {
        insertOrAppendPlacementNode(sibling, before, parent);
        sibling = sibling.sibling;
      }
    }
  }
} // These are tracked on the stack as we recursively traverse a
// deleted subtree.
// TODO: Update these during the whole mutation phase, not just during
// a deletion.


let hostParent = null;
let hostParentIsContainer = false;

function commitDeletionEffects(root, returnFiber, deletedFiber) {
  {
    // We only have the top Fiber that was deleted but we need to recurse down its
    // children to find all the terminal nodes.
    // Recursively delete all host nodes from the parent, detach refs, clean
    // up mounted layout effects, and call componentWillUnmount.
    // We only need to remove the topmost host child in each branch. But then we
    // still need to keep traversing to unmount effects, refs, and cWU. TODO: We
    // could split this into two separate traversals functions, where the second
    // one doesn't include any removeChild logic. This is maybe the same
    // function as "disappearLayoutEffects" (or whatever that turns into after
    // the layout phase is refactored to use recursion).
    // Before starting, find the nearest host parent on the stack so we know
    // which instance/container to remove the children from.
    // TODO: Instead of searching up the fiber return path on every deletion, we
    // can track the nearest host component on the JS stack as we traverse the
    // tree during the commit phase. This would make insertions faster, too.
    let parent = returnFiber;

    findParent: while (parent !== null) {
      switch (parent.tag) {
        case HostSingleton:
        case HostComponent:
          {
            hostParent = parent.stateNode;
            hostParentIsContainer = false;
            break findParent;
          }

        case HostRoot:
          {
            hostParent = parent.stateNode.containerInfo;
            hostParentIsContainer = true;
            break findParent;
          }

        case HostPortal:
          {
            hostParent = parent.stateNode.containerInfo;
            hostParentIsContainer = true;
            break findParent;
          }
      }

      parent = parent.return;
    }

    if (hostParent === null) {
      throw Error(formatProdErrorMessage(160));
    }

    commitDeletionEffectsOnFiber(root, returnFiber, deletedFiber);
    hostParent = null;
    hostParentIsContainer = false;
  }

  detachFiberMutation(deletedFiber);
}

function recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, parent) {
  // TODO: Use a static flag to skip trees that don't have unmount effects
  let child = parent.child;

  while (child !== null) {
    commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, child);
    child = child.sibling;
  }
}

function commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, deletedFiber) {
  onCommitUnmount(deletedFiber); // The cases in this outer switch modify the stack before they traverse
  // into their subtree. There are simpler cases in the inner switch
  // that don't modify the stack.

  switch (deletedFiber.tag) {
    case HostHoistable:
      {
        {
          if (!offscreenSubtreeWasHidden) {
            safelyDetachRef(deletedFiber, nearestMountedAncestor);
          }

          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);

          if (deletedFiber.memoizedState) {
            releaseResource(deletedFiber.memoizedState);
          } else if (deletedFiber.stateNode) {
            unmountHoistable(deletedFiber.stateNode);
          }

          return;
        } // Fall through

      }

    case HostSingleton:
      {
        {
          if (!offscreenSubtreeWasHidden) {
            safelyDetachRef(deletedFiber, nearestMountedAncestor);
          }

          const prevHostParent = hostParent;
          const prevHostParentIsContainer = hostParentIsContainer;
          hostParent = deletedFiber.stateNode;
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber); // Normally this is called in passive unmount effect phase however with
          // HostSingleton we warn if you acquire one that is already associated to
          // a different fiber. To increase our chances of avoiding this, specifically
          // if you keyed a HostSingleton so there will be a delete followed by a Placement
          // we treat detach eagerly here

          releaseSingletonInstance(deletedFiber.stateNode);
          hostParent = prevHostParent;
          hostParentIsContainer = prevHostParentIsContainer;
          return;
        } // Fall through

      }

    case HostComponent:
      {
        if (!offscreenSubtreeWasHidden) {
          safelyDetachRef(deletedFiber, nearestMountedAncestor);
        } // Intentional fallthrough to next branch

      }

    case HostText:
      {
        // We only need to remove the nearest host child. Set the host parent
        // to `null` on the stack to indicate that nested children don't
        // need to be removed.
        {
          const prevHostParent = hostParent;
          const prevHostParentIsContainer = hostParentIsContainer;
          hostParent = null;
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
          hostParent = prevHostParent;
          hostParentIsContainer = prevHostParentIsContainer;

          if (hostParent !== null) {
            // Now that all the child effects have unmounted, we can remove the
            // node from the tree.
            if (hostParentIsContainer) {
              removeChildFromContainer(hostParent, deletedFiber.stateNode);
            } else {
              removeChild(hostParent, deletedFiber.stateNode);
            }
          }
        }

        return;
      }

    case DehydratedFragment:
      {
        // Delete the dehydrated suspense boundary and all of its content.


        {
          if (hostParent !== null) {
            if (hostParentIsContainer) {
              clearSuspenseBoundaryFromContainer(hostParent, deletedFiber.stateNode);
            } else {
              clearSuspenseBoundary(hostParent, deletedFiber.stateNode);
            }
          }
        }

        return;
      }

    case HostPortal:
      {
        {
          // When we go into a portal, it becomes the parent to remove from.
          const prevHostParent = hostParent;
          const prevHostParentIsContainer = hostParentIsContainer;
          hostParent = deletedFiber.stateNode.containerInfo;
          hostParentIsContainer = true;
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
          hostParent = prevHostParent;
          hostParentIsContainer = prevHostParentIsContainer;
        }

        return;
      }

    case FunctionComponent:
    case ForwardRef:
    case MemoComponent:
    case SimpleMemoComponent:
      {
        if (!offscreenSubtreeWasHidden) {
          const updateQueue = deletedFiber.updateQueue;

          if (updateQueue !== null) {
            const lastEffect = updateQueue.lastEffect;

            if (lastEffect !== null) {
              const firstEffect = lastEffect.next;
              let effect = firstEffect;

              do {
                const tag = effect.tag;
                const inst = effect.inst;
                const destroy = inst.destroy;

                if (destroy !== undefined) {
                  if ((tag & Insertion) !== NoFlags) {
                    inst.destroy = undefined;
                    safelyCallDestroy(deletedFiber, nearestMountedAncestor, destroy);
                  } else if ((tag & Layout) !== NoFlags) {
                    {
                      markComponentLayoutEffectUnmountStarted(deletedFiber);
                    }

                    if (shouldProfile(deletedFiber)) {
                      startLayoutEffectTimer();
                      inst.destroy = undefined;
                      safelyCallDestroy(deletedFiber, nearestMountedAncestor, destroy);
                      recordLayoutEffectDuration(deletedFiber);
                    } else {
                      inst.destroy = undefined;
                      safelyCallDestroy(deletedFiber, nearestMountedAncestor, destroy);
                    }

                    {
                      markComponentLayoutEffectUnmountStopped();
                    }
                  }
                }

                effect = effect.next;
              } while (effect !== firstEffect);
            }
          }
        }

        recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
        return;
      }

    case ClassComponent:
      {
        if (!offscreenSubtreeWasHidden) {
          safelyDetachRef(deletedFiber, nearestMountedAncestor);
          const instance = deletedFiber.stateNode;

          if (typeof instance.componentWillUnmount === 'function') {
            safelyCallComponentWillUnmount(deletedFiber, nearestMountedAncestor, instance);
          }
        }

        recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
        return;
      }

    case ScopeComponent:
      {

        recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
        return;
      }

    case OffscreenComponent:
      {
        safelyDetachRef(deletedFiber, nearestMountedAncestor);

        if (deletedFiber.mode & ConcurrentMode) {
          // If this offscreen component is hidden, we already unmounted it. Before
          // deleting the children, track that it's already unmounted so that we
          // don't attempt to unmount the effects again.
          // TODO: If the tree is hidden, in most cases we should be able to skip
          // over the nested children entirely. An exception is we haven't yet found
          // the topmost host node to delete, which we already track on the stack.
          // But the other case is portals, which need to be detached no matter how
          // deeply they are nested. We should use a subtree flag to track whether a
          // subtree includes a nested portal.
          const prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || deletedFiber.memoizedState !== null;
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
        } else {
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
        }

        break;
      }

    default:
      {
        recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
        return;
      }
  }
}

function commitSuspenseCallback(finishedWork) {
}

function commitSuspenseHydrationCallbacks(finishedRoot, finishedWork) {

  const newState = finishedWork.memoizedState;

  if (newState === null) {
    const current = finishedWork.alternate;

    if (current !== null) {
      const prevState = current.memoizedState;

      if (prevState !== null) {
        const suspenseInstance = prevState.dehydrated;

        if (suspenseInstance !== null) {
          try {
            commitHydratedSuspenseInstance(suspenseInstance);

            if (enableSuspenseCallback) ;
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        }
      }
    }
  }
}

function getRetryCache(finishedWork) {
  // TODO: Unify the interface for the retry cache so we don't have to switch
  // on the tag like this.
  switch (finishedWork.tag) {
    case SuspenseComponent:
    case SuspenseListComponent:
      {
        let retryCache = finishedWork.stateNode;

        if (retryCache === null) {
          retryCache = finishedWork.stateNode = new PossiblyWeakSet();
        }

        return retryCache;
      }

    case OffscreenComponent:
      {
        const instance = finishedWork.stateNode;
        let retryCache = instance._retryCache;

        if (retryCache === null) {
          retryCache = instance._retryCache = new PossiblyWeakSet();
        }

        return retryCache;
      }

    default:
      {
        throw Error(formatProdErrorMessage(435, finishedWork.tag));
      }
  }
}

function detachOffscreenInstance(instance) {
  const fiber = instance._current;

  if (fiber === null) {
    throw Error(formatProdErrorMessage(456));
  }

  if ((instance._pendingVisibility & OffscreenDetached) !== NoFlags$1) {
    // The instance is already detached, this is a noop.
    return;
  } // TODO: There is an opportunity to optimise this by not entering commit phase
  // and unmounting effects directly.


  const root = enqueueConcurrentRenderForLane(fiber, SyncLane);

  if (root !== null) {
    instance._pendingVisibility |= OffscreenDetached;
    scheduleUpdateOnFiber(root, fiber, SyncLane);
  }
}
function attachOffscreenInstance(instance) {
  const fiber = instance._current;

  if (fiber === null) {
    throw Error(formatProdErrorMessage(456));
  }

  if ((instance._pendingVisibility & OffscreenDetached) === NoFlags$1) {
    // The instance is already attached, this is a noop.
    return;
  }

  const root = enqueueConcurrentRenderForLane(fiber, SyncLane);

  if (root !== null) {
    instance._pendingVisibility &= ~OffscreenDetached;
    scheduleUpdateOnFiber(root, fiber, SyncLane);
  }
}

function attachSuspenseRetryListeners(finishedWork, wakeables) {
  // If this boundary just timed out, then it will have a set of wakeables.
  // For each wakeable, attach a listener so that when it resolves, React
  // attempts to re-render the boundary in the primary (pre-timeout) state.
  const retryCache = getRetryCache(finishedWork);
  wakeables.forEach(wakeable => {
    // Memoize using the boundary fiber to prevent redundant listeners.
    const retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);

    if (!retryCache.has(wakeable)) {
      retryCache.add(wakeable);

      {
        if (isDevToolsPresent) {
          if (inProgressLanes !== null && inProgressRoot !== null) {
            // If we have pending work still, associate the original updaters with it.
            restorePendingUpdaters(inProgressRoot, inProgressLanes);
          } else {
            throw Error(formatProdErrorMessage(413));
          }
        }
      }

      wakeable.then(retry, retry);
    }
  });
} // This function detects when a Suspense boundary goes from visible to hidden.
function commitMutationEffects(root, finishedWork, committedLanes) {
  inProgressLanes = committedLanes;
  inProgressRoot = root;
  commitMutationEffectsOnFiber(finishedWork, root);
  inProgressLanes = null;
  inProgressRoot = null;
}

function recursivelyTraverseMutationEffects(root, parentFiber, lanes) {
  // Deletions effects can be scheduled on any fiber type. They need to happen
  // before the children effects hae fired.
  const deletions = parentFiber.deletions;

  if (deletions !== null) {
    for (let i = 0; i < deletions.length; i++) {
      const childToDelete = deletions[i];

      try {
        commitDeletionEffects(root, parentFiber, childToDelete);
      } catch (error) {
        captureCommitPhaseError(childToDelete, parentFiber, error);
      }
    }
  }

  if (parentFiber.subtreeFlags & MutationMask) {
    let child = parentFiber.child;

    while (child !== null) {
      commitMutationEffectsOnFiber(child, root);
      child = child.sibling;
    }
  }
}

let currentHoistableRoot = null;

function commitMutationEffectsOnFiber(finishedWork, root, lanes) {
  const current = finishedWork.alternate;
  const flags = finishedWork.flags; // The effect flag should be checked *after* we refine the type of fiber,
  // because the fiber tag is more specific. An exception is any flag related
  // to reconciliation, because those can be set on all fiber types.

  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case MemoComponent:
    case SimpleMemoComponent:
      {
        recursivelyTraverseMutationEffects(root, finishedWork);
        commitReconciliationEffects(finishedWork);

        if (flags & Update) {
          try {
            commitHookEffectListUnmount(Insertion | HasEffect, finishedWork, finishedWork.return);
            commitHookEffectListMount(Insertion | HasEffect, finishedWork);
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          } // Layout effects are destroyed during the mutation phase so that all
          // destroy functions for all fibers are called before any create functions.
          // This prevents sibling component effects from interfering with each other,
          // e.g. a destroy function in one component should never override a ref set
          // by a create function in another component during the same commit.


          if (shouldProfile(finishedWork)) {
            try {
              startLayoutEffectTimer();
              commitHookEffectListUnmount(Layout | HasEffect, finishedWork, finishedWork.return);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }

            recordLayoutEffectDuration(finishedWork);
          } else {
            try {
              commitHookEffectListUnmount(Layout | HasEffect, finishedWork, finishedWork.return);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
        }

        return;
      }

    case ClassComponent:
      {
        recursivelyTraverseMutationEffects(root, finishedWork);
        commitReconciliationEffects(finishedWork);

        if (flags & Ref) {
          if (current !== null) {
            safelyDetachRef(current, current.return);
          }
        }

        if (flags & Callback && offscreenSubtreeIsHidden) {
          const updateQueue = finishedWork.updateQueue;

          if (updateQueue !== null) {
            deferHiddenCallbacks(updateQueue);
          }
        }

        return;
      }

    case HostHoistable:
      {
        {
          // We cast because we always set the root at the React root and so it cannot be
          // null while we are processing mutation effects
          const hoistableRoot = currentHoistableRoot;
          recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);

          if (flags & Ref) {
            if (current !== null) {
              safelyDetachRef(current, current.return);
            }
          }

          if (flags & Update) {
            const currentResource = current !== null ? current.memoizedState : null;
            const newResource = finishedWork.memoizedState;

            if (current === null) {
              // We are mounting a new HostHoistable Fiber. We fork the mount
              // behavior based on whether this instance is a Hoistable Instance
              // or a Hoistable Resource
              if (newResource === null) {
                if (finishedWork.stateNode === null) {
                  finishedWork.stateNode = hydrateHoistable(hoistableRoot, finishedWork.type, finishedWork.memoizedProps, finishedWork);
                } else {
                  mountHoistable(hoistableRoot, finishedWork.type, finishedWork.stateNode);
                }
              } else {
                finishedWork.stateNode = acquireResource(hoistableRoot, newResource, finishedWork.memoizedProps);
              }
            } else if (currentResource !== newResource) {
              // We are moving to or from Hoistable Resource, or between different Hoistable Resources
              if (currentResource === null) {
                if (current.stateNode !== null) {
                  unmountHoistable(current.stateNode);
                }
              } else {
                releaseResource(currentResource);
              }

              if (newResource === null) {
                mountHoistable(hoistableRoot, finishedWork.type, finishedWork.stateNode);
              } else {
                acquireResource(hoistableRoot, newResource, finishedWork.memoizedProps);
              }
            } else if (newResource === null && finishedWork.stateNode !== null) {
              // We may have an update on a Hoistable element
              const updatePayload = finishedWork.updateQueue;
              finishedWork.updateQueue = null;

              try {
                commitUpdate(finishedWork.stateNode, updatePayload, finishedWork.type, current.memoizedProps, finishedWork.memoizedProps, finishedWork);
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            }
          }

          return;
        } // Fall through

      }

    case HostSingleton:
      {
        {
          if (flags & Update) {
            const previousWork = finishedWork.alternate;

            if (previousWork === null) {
              const singleton = finishedWork.stateNode;
              const props = finishedWork.memoizedProps; // This was a new mount, we need to clear and set initial properties

              clearSingleton(singleton);
              acquireSingletonInstance(finishedWork.type, props, singleton, finishedWork);
            }
          }
        } // Fall through

      }

    case HostComponent:
      {
        recursivelyTraverseMutationEffects(root, finishedWork);
        commitReconciliationEffects(finishedWork);

        if (flags & Ref) {
          if (current !== null) {
            safelyDetachRef(current, current.return);
          }
        }

        {
          // TODO: ContentReset gets cleared by the children during the commit
          // phase. This is a refactor hazard because it means we must read
          // flags the flags after `commitReconciliationEffects` has already run;
          // the order matters. We should refactor so that ContentReset does not
          // rely on mutating the flag during commit. Like by setting a flag
          // during the render phase instead.
          if (finishedWork.flags & ContentReset) {
            const instance = finishedWork.stateNode;

            try {
              resetTextContent(instance);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }

          if (flags & Update) {
            const instance = finishedWork.stateNode;

            if (instance != null) {
              // Commit the work prepared earlier.
              const newProps = finishedWork.memoizedProps; // For hydration we reuse the update path but we treat the oldProps
              // as the newProps. The updatePayload will contain the real change in
              // this case.

              const oldProps = current !== null ? current.memoizedProps : newProps;
              const type = finishedWork.type; // TODO: Type the updateQueue to be specific to host components.

              const updatePayload = finishedWork.updateQueue;
              finishedWork.updateQueue = null;

              try {
                commitUpdate(instance, updatePayload, type, oldProps, newProps, finishedWork);
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            }
          }
        }

        return;
      }

    case HostText:
      {
        recursivelyTraverseMutationEffects(root, finishedWork);
        commitReconciliationEffects(finishedWork);

        if (flags & Update) {
          {
            if (finishedWork.stateNode === null) {
              throw Error(formatProdErrorMessage(162));
            }

            const textInstance = finishedWork.stateNode;
            const newText = finishedWork.memoizedProps; // For hydration we reuse the update path but we treat the oldProps
            // as the newProps. The updatePayload will contain the real change in
            // this case.

            const oldText = current !== null ? current.memoizedProps : newText;

            try {
              commitTextUpdate(textInstance, oldText, newText);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
        }

        return;
      }

    case HostRoot:
      {
        {
          prepareToCommitHoistables();
          const previousHoistableRoot = currentHoistableRoot;
          currentHoistableRoot = getHoistableRoot(root.containerInfo);
          recursivelyTraverseMutationEffects(root, finishedWork);
          currentHoistableRoot = previousHoistableRoot;
          commitReconciliationEffects(finishedWork);
        }

        if (flags & Update) {
          {
            if (current !== null) {
              const prevRootState = current.memoizedState;

              if (prevRootState.isDehydrated) {
                try {
                  commitHydratedContainer(root.containerInfo);
                } catch (error) {
                  captureCommitPhaseError(finishedWork, finishedWork.return, error);
                }
              }
            }
          }
        }

        return;
      }

    case HostPortal:
      {
        {
          const previousHoistableRoot = currentHoistableRoot;
          currentHoistableRoot = getHoistableRoot(finishedWork.stateNode.containerInfo);
          recursivelyTraverseMutationEffects(root, finishedWork);
          commitReconciliationEffects(finishedWork);
          currentHoistableRoot = previousHoistableRoot;
        }

        return;
      }

    case SuspenseComponent:
      {
        recursivelyTraverseMutationEffects(root, finishedWork);
        commitReconciliationEffects(finishedWork); // TODO: We should mark a flag on the Suspense fiber itself, rather than
        // relying on the Offscreen fiber having a flag also being marked. The
        // reason is that this offscreen fiber might not be part of the work-in-
        // progress tree! It could have been reused from a previous render. This
        // doesn't lead to incorrect behavior because we don't rely on the flag
        // check alone; we also compare the states explicitly below. But for
        // modeling purposes, we _should_ be able to rely on the flag check alone.
        // So this is a bit fragile.
        //
        // Also, all this logic could/should move to the passive phase so it
        // doesn't block paint.

        const offscreenFiber = finishedWork.child;

        if (offscreenFiber.flags & Visibility) {
          // Throttle the appearance and disappearance of Suspense fallbacks.
          const isShowingFallback = finishedWork.memoizedState !== null;
          const wasShowingFallback = current !== null && current.memoizedState !== null;

          {
            if (isShowingFallback !== wasShowingFallback) {
              // A fallback is either appearing or disappearing.
              markCommitTimeOfFallback();
            }
          }
        }

        if (flags & Update) {
          try {
            commitSuspenseCallback(finishedWork);
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }

          const retryQueue = finishedWork.updateQueue;

          if (retryQueue !== null) {
            finishedWork.updateQueue = null;
            attachSuspenseRetryListeners(finishedWork, retryQueue);
          }
        }

        return;
      }

    case OffscreenComponent:
      {
        if (flags & Ref) {
          if (current !== null) {
            safelyDetachRef(current, current.return);
          }
        }

        const newState = finishedWork.memoizedState;
        const isHidden = newState !== null;
        const wasHidden = current !== null && current.memoizedState !== null;

        if (finishedWork.mode & ConcurrentMode) {
          // Before committing the children, track on the stack whether this
          // offscreen subtree was already hidden, so that we don't unmount the
          // effects again.
          const prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden;
          const prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden || isHidden;
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || wasHidden;
          recursivelyTraverseMutationEffects(root, finishedWork);
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
        } else {
          recursivelyTraverseMutationEffects(root, finishedWork);
        }

        commitReconciliationEffects(finishedWork);
        const offscreenInstance = finishedWork.stateNode; // TODO: Add explicit effect flag to set _current.

        offscreenInstance._current = finishedWork; // Offscreen stores pending changes to visibility in `_pendingVisibility`. This is
        // to support batching of `attach` and `detach` calls.

        offscreenInstance._visibility &= ~OffscreenDetached;
        offscreenInstance._visibility |= offscreenInstance._pendingVisibility & OffscreenDetached;

        if (flags & Visibility) {
          // Track the current state on the Offscreen instance so we can
          // read it during an event
          if (isHidden) {
            offscreenInstance._visibility &= ~OffscreenVisible;
          } else {
            offscreenInstance._visibility |= OffscreenVisible;
          }

          if (isHidden) {
            const isUpdate = current !== null;
            const wasHiddenByAncestorOffscreen = offscreenSubtreeIsHidden || offscreenSubtreeWasHidden; // Only trigger disapper layout effects if:
            //   - This is an update, not first mount.
            //   - This Offscreen was not hidden before.
            //   - Ancestor Offscreen was not hidden in previous commit.

            if (isUpdate && !wasHidden && !wasHiddenByAncestorOffscreen) {
              if ((finishedWork.mode & ConcurrentMode) !== NoMode) {
                // Disappear the layout effects of all the children
                recursivelyTraverseDisappearLayoutEffects(finishedWork);
              }
            }
          } // Offscreen with manual mode manages visibility manually.


          if (!isOffscreenManual(finishedWork)) {
            // TODO: This needs to run whenever there's an insertion or update
            // inside a hidden Offscreen tree.
            hideOrUnhideAllChildren(finishedWork, isHidden);
          }
        } // TODO: Move to passive phase


        if (flags & Update) {
          const offscreenQueue = finishedWork.updateQueue;

          if (offscreenQueue !== null) {
            const retryQueue = offscreenQueue.retryQueue;

            if (retryQueue !== null) {
              offscreenQueue.retryQueue = null;
              attachSuspenseRetryListeners(finishedWork, retryQueue);
            }
          }
        }

        return;
      }

    case SuspenseListComponent:
      {
        recursivelyTraverseMutationEffects(root, finishedWork);
        commitReconciliationEffects(finishedWork);

        if (flags & Update) {
          const retryQueue = finishedWork.updateQueue;

          if (retryQueue !== null) {
            finishedWork.updateQueue = null;
            attachSuspenseRetryListeners(finishedWork, retryQueue);
          }
        }

        return;
      }

    case ScopeComponent:
      {

        return;
      }

    default:
      {
        recursivelyTraverseMutationEffects(root, finishedWork);
        commitReconciliationEffects(finishedWork);
        return;
      }
  }
}

function commitReconciliationEffects(finishedWork) {
  // Placement effects (insertions, reorders) can be scheduled on any fiber
  // type. They needs to happen after the children effects have fired, but
  // before the effects on this fiber have fired.
  const flags = finishedWork.flags;

  if (flags & Placement) {
    try {
      commitPlacement(finishedWork);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    } // Clear the "placement" from effect tag so that we know that this is
    // inserted, before any life-cycles like componentDidMount gets called.
    // TODO: findDOMNode doesn't rely on this any more but isMounted does
    // and isMounted is deprecated anyway so we should be able to kill this.


    finishedWork.flags &= ~Placement;
  }

  if (flags & Hydrating) {
    finishedWork.flags &= ~Hydrating;
  }
}

function commitLayoutEffects(finishedWork, root, committedLanes) {
  inProgressLanes = committedLanes;
  inProgressRoot = root;
  const current = finishedWork.alternate;
  commitLayoutEffectOnFiber(root, current, finishedWork);
  inProgressLanes = null;
  inProgressRoot = null;
}

function recursivelyTraverseLayoutEffects(root, parentFiber, lanes) {

  if (parentFiber.subtreeFlags & LayoutMask) {
    let child = parentFiber.child;

    while (child !== null) {
      const current = child.alternate;
      commitLayoutEffectOnFiber(root, current, child);
      child = child.sibling;
    }
  }
}

function disappearLayoutEffects(finishedWork) {
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case MemoComponent:
    case SimpleMemoComponent:
      {
        // TODO (Offscreen) Check: flags & LayoutStatic
        if (shouldProfile(finishedWork)) {
          try {
            startLayoutEffectTimer();
            commitHookEffectListUnmount(Layout, finishedWork, finishedWork.return);
          } finally {
            recordLayoutEffectDuration(finishedWork);
          }
        } else {
          commitHookEffectListUnmount(Layout, finishedWork, finishedWork.return);
        }

        recursivelyTraverseDisappearLayoutEffects(finishedWork);
        break;
      }

    case ClassComponent:
      {
        // TODO (Offscreen) Check: flags & RefStatic
        safelyDetachRef(finishedWork, finishedWork.return);
        const instance = finishedWork.stateNode;

        if (typeof instance.componentWillUnmount === 'function') {
          safelyCallComponentWillUnmount(finishedWork, finishedWork.return, instance);
        }

        recursivelyTraverseDisappearLayoutEffects(finishedWork);
        break;
      }

    case HostHoistable:
    case HostSingleton:
    case HostComponent:
      {
        // TODO (Offscreen) Check: flags & RefStatic
        safelyDetachRef(finishedWork, finishedWork.return);
        recursivelyTraverseDisappearLayoutEffects(finishedWork);
        break;
      }

    case OffscreenComponent:
      {
        // TODO (Offscreen) Check: flags & RefStatic
        safelyDetachRef(finishedWork, finishedWork.return);
        const isHidden = finishedWork.memoizedState !== null;

        if (isHidden) ; else {
          recursivelyTraverseDisappearLayoutEffects(finishedWork);
        }

        break;
      }

    default:
      {
        recursivelyTraverseDisappearLayoutEffects(finishedWork);
        break;
      }
  }
}

function recursivelyTraverseDisappearLayoutEffects(parentFiber) {
  // TODO (Offscreen) Check: flags & (RefStatic | LayoutStatic)
  let child = parentFiber.child;

  while (child !== null) {
    disappearLayoutEffects(child);
    child = child.sibling;
  }
}

function reappearLayoutEffects(finishedRoot, current, finishedWork, // This function visits both newly finished work and nodes that were re-used
// from a previously committed tree. We cannot check non-static flags if the
// node was reused.
includeWorkInProgressEffects) {
  // Turn on layout effects in a tree that previously disappeared.
  const flags = finishedWork.flags;

  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
      {
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects); // TODO: Check flags & LayoutStatic

        commitHookLayoutEffects(finishedWork, Layout);
        break;
      }

    case ClassComponent:
      {
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects); // TODO: Check for LayoutStatic flag

        const instance = finishedWork.stateNode;

        if (typeof instance.componentDidMount === 'function') {
          try {
            instance.componentDidMount();
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        } // Commit any callbacks that would have fired while the component
        // was hidden.


        const updateQueue = finishedWork.updateQueue;

        if (updateQueue !== null) {
          commitHiddenCallbacks(updateQueue, instance);
        } // If this is newly finished work, check for setState callbacks


        if (includeWorkInProgressEffects && flags & Callback) {
          commitClassCallbacks(finishedWork);
        } // TODO: Check flags & RefStatic


        safelyAttachRef(finishedWork, finishedWork.return);
        break;
      }
    // Unlike commitLayoutEffectsOnFiber, we don't need to handle HostRoot
    // because this function only visits nodes that are inside an
    // Offscreen fiber.
    // case HostRoot: {
    //  ...
    // }

    case HostHoistable:
    case HostSingleton:
    case HostComponent:
      {
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects); // Renderers may schedule work to be done after host components are mounted
        // (eg DOM renderer may schedule auto-focus for inputs and form controls).
        // These effects should only be committed when components are first mounted,
        // aka when there is no current/alternate.

        if (includeWorkInProgressEffects && current === null && flags & Update) {
          commitHostComponentMount(finishedWork);
        } // TODO: Check flags & Ref


        safelyAttachRef(finishedWork, finishedWork.return);
        break;
      }

    case Profiler:
      {
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects); // TODO: Figure out how Profiler updates should work with Offscreen

        if (includeWorkInProgressEffects && flags & Update) {
          commitProfilerUpdate(finishedWork, current);
        }

        break;
      }

    case SuspenseComponent:
      {
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects); // TODO: Figure out how Suspense hydration callbacks should work
        // with Offscreen.

        if (includeWorkInProgressEffects && flags & Update) {
          commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
        }

        break;
      }

    case OffscreenComponent:
      {
        const offscreenState = finishedWork.memoizedState;
        const isHidden = offscreenState !== null;

        if (isHidden) ; else {
          recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
        } // TODO: Check flags & Ref


        safelyAttachRef(finishedWork, finishedWork.return);
        break;
      }

    default:
      {
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
        break;
      }
  }
}

function recursivelyTraverseReappearLayoutEffects(finishedRoot, parentFiber, includeWorkInProgressEffects) {
  // This function visits both newly finished work and nodes that were re-used
  // from a previously committed tree. We cannot check non-static flags if the
  // node was reused.
  const childShouldIncludeWorkInProgressEffects = includeWorkInProgressEffects && (parentFiber.subtreeFlags & LayoutMask) !== NoFlags$1; // TODO (Offscreen) Check: flags & (RefStatic | LayoutStatic)
  let child = parentFiber.child;

  while (child !== null) {
    const current = child.alternate;
    reappearLayoutEffects(finishedRoot, current, child, childShouldIncludeWorkInProgressEffects);
    child = child.sibling;
  }
}

function commitHookPassiveMountEffects(finishedWork, hookFlags) {
  if (shouldProfile(finishedWork)) {
    startPassiveEffectTimer();

    try {
      commitHookEffectListMount(hookFlags, finishedWork);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }

    recordPassiveEffectDuration(finishedWork);
  } else {
    try {
      commitHookEffectListMount(hookFlags, finishedWork);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }
  }
}

function commitOffscreenPassiveMountEffects(current, finishedWork, instance) {
  {
    let previousCache = null;

    if (current !== null && current.memoizedState !== null && current.memoizedState.cachePool !== null) {
      previousCache = current.memoizedState.cachePool.pool;
    }

    let nextCache = null;

    if (finishedWork.memoizedState !== null && finishedWork.memoizedState.cachePool !== null) {
      nextCache = finishedWork.memoizedState.cachePool.pool;
    } // Retain/release the cache used for pending (suspended) nodes.
    // Note that this is only reached in the non-suspended/visible case:
    // when the content is suspended/hidden, the retain/release occurs
    // via the parent Suspense component (see case above).


    if (nextCache !== previousCache) {
      if (nextCache != null) {
        retainCache(nextCache);
      }

      if (previousCache != null) {
        releaseCache(previousCache);
      }
    }
  }
}

function commitCachePassiveMountEffect(current, finishedWork) {
  {
    let previousCache = null;

    if (finishedWork.alternate !== null) {
      previousCache = finishedWork.alternate.memoizedState.cache;
    }

    const nextCache = finishedWork.memoizedState.cache; // Retain/release the cache. In theory the cache component
    // could be "borrowing" a cache instance owned by some parent,
    // in which case we could avoid retaining/releasing. But it
    // is non-trivial to determine when that is the case, so we
    // always retain/release.

    if (nextCache !== previousCache) {
      retainCache(nextCache);

      if (previousCache != null) {
        releaseCache(previousCache);
      }
    }
  }
}

function commitPassiveMountEffects(root, finishedWork, committedLanes, committedTransitions) {
  commitPassiveMountOnFiber(root, finishedWork, committedLanes, committedTransitions);
}

function recursivelyTraversePassiveMountEffects(root, parentFiber, committedLanes, committedTransitions) {

  if (parentFiber.subtreeFlags & PassiveMask) {
    let child = parentFiber.child;

    while (child !== null) {
      commitPassiveMountOnFiber(root, child, committedLanes, committedTransitions);
      child = child.sibling;
    }
  }
}

function commitPassiveMountOnFiber(finishedRoot, finishedWork, committedLanes, committedTransitions) {
  // When updating this function, also update reconnectPassiveEffects, which does
  // most of the same things when an offscreen tree goes from hidden -> visible,
  // or when toggling effects inside a hidden tree.
  const flags = finishedWork.flags;

  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
      {
        recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);

        if (flags & Passive$1) {
          commitHookPassiveMountEffects(finishedWork, Passive | HasEffect);
        }

        break;
      }

    case HostRoot:
      {
        recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);

        if (flags & Passive$1) {
          {
            let previousCache = null;

            if (finishedWork.alternate !== null) {
              previousCache = finishedWork.alternate.memoizedState.cache;
            }

            const nextCache = finishedWork.memoizedState.cache; // Retain/release the root cache.
            // Note that on initial mount, previousCache and nextCache will be the same
            // and this retain won't occur. To counter this, we instead retain the HostRoot's
            // initial cache when creating the root itself (see createFiberRoot() in
            // ReactFiberRoot.js). Subsequent updates that change the cache are reflected
            // here, such that previous/next caches are retained correctly.

            if (nextCache !== previousCache) {
              retainCache(nextCache);

              if (previousCache != null) {
                releaseCache(previousCache);
              }
            }
          }
        }

        break;
      }

    case LegacyHiddenComponent:
      {

        break;
      }

    case OffscreenComponent:
      {
        // TODO: Pass `current` as argument to this function
        const instance = finishedWork.stateNode;
        const nextState = finishedWork.memoizedState;
        const isHidden = nextState !== null;

        if (isHidden) {
          if (instance._visibility & OffscreenPassiveEffectsConnected) {
            // The effects are currently connected. Update them.
            recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
          } else {
            if (finishedWork.mode & ConcurrentMode) {
              // The effects are currently disconnected. Since the tree is hidden,
              // don't connect them. This also applies to the initial render.
              {
                // "Atomic" effects are ones that need to fire on every commit,
                // even during pre-rendering. An example is updating the reference
                // count on cache instances.
                recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
              }
            } else {
              // Legacy Mode: Fire the effects even if the tree is hidden.
              instance._visibility |= OffscreenPassiveEffectsConnected;
              recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
            }
          }
        } else {
          // Tree is visible
          if (instance._visibility & OffscreenPassiveEffectsConnected) {
            // The effects are currently connected. Update them.
            recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
          } else {
            // The effects are currently disconnected. Reconnect them, while also
            // firing effects inside newly mounted trees. This also applies to
            // the initial render.
            instance._visibility |= OffscreenPassiveEffectsConnected;
            const includeWorkInProgressEffects = (finishedWork.subtreeFlags & PassiveMask) !== NoFlags$1;
            recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
          }
        }

        if (flags & Passive$1) {
          const current = finishedWork.alternate;
          commitOffscreenPassiveMountEffects(current, finishedWork);
        }

        break;
      }

    case CacheComponent:
      {
        recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);

        if (flags & Passive$1) {
          // TODO: Pass `current` as argument to this function
          const current = finishedWork.alternate;
          commitCachePassiveMountEffect(current, finishedWork);
        }

        break;
      }

    case TracingMarkerComponent:

    default:
      {
        recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
        break;
      }
  }
}

function recursivelyTraverseReconnectPassiveEffects(finishedRoot, parentFiber, committedLanes, committedTransitions, includeWorkInProgressEffects) {
  // This function visits both newly finished work and nodes that were re-used
  // from a previously committed tree. We cannot check non-static flags if the
  // node was reused.
  const childShouldIncludeWorkInProgressEffects = includeWorkInProgressEffects && (parentFiber.subtreeFlags & PassiveMask) !== NoFlags$1; // TODO (Offscreen) Check: flags & (RefStatic | LayoutStatic)
  let child = parentFiber.child;

  while (child !== null) {
    reconnectPassiveEffects(finishedRoot, child, committedLanes, committedTransitions, childShouldIncludeWorkInProgressEffects);
    child = child.sibling;
  }
}

function reconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, // This function visits both newly finished work and nodes that were re-used
// from a previously committed tree. We cannot check non-static flags if the
// node was reused.
includeWorkInProgressEffects) {
  const flags = finishedWork.flags;

  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
      {
        recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects); // TODO: Check for PassiveStatic flag

        commitHookPassiveMountEffects(finishedWork, Passive);
        break;
      }
    // Unlike commitPassiveMountOnFiber, we don't need to handle HostRoot
    // because this function only visits nodes that are inside an
    // Offscreen fiber.
    // case HostRoot: {
    //  ...
    // }

    case LegacyHiddenComponent:
      {

        break;
      }

    case OffscreenComponent:
      {
        const instance = finishedWork.stateNode;
        const nextState = finishedWork.memoizedState;
        const isHidden = nextState !== null;

        if (isHidden) {
          if (instance._visibility & OffscreenPassiveEffectsConnected) {
            // The effects are currently connected. Update them.
            recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
          } else {
            if (finishedWork.mode & ConcurrentMode) {
              // The effects are currently disconnected. Since the tree is hidden,
              // don't connect them. This also applies to the initial render.
              {
                // "Atomic" effects are ones that need to fire on every commit,
                // even during pre-rendering. An example is updating the reference
                // count on cache instances.
                recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
              }
            } else {
              // Legacy Mode: Fire the effects even if the tree is hidden.
              instance._visibility |= OffscreenPassiveEffectsConnected;
              recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
            }
          }
        } else {
          // Tree is visible
          // Since we're already inside a reconnecting tree, it doesn't matter
          // whether the effects are currently connected. In either case, we'll
          // continue traversing the tree and firing all the effects.
          //
          // We do need to set the "connected" flag on the instance, though.
          instance._visibility |= OffscreenPassiveEffectsConnected;
          recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
        }

        if (includeWorkInProgressEffects && flags & Passive$1) {
          // TODO: Pass `current` as argument to this function
          const current = finishedWork.alternate;
          commitOffscreenPassiveMountEffects(current, finishedWork);
        }

        break;
      }

    case CacheComponent:
      {
        recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);

        if (includeWorkInProgressEffects && flags & Passive$1) {
          // TODO: Pass `current` as argument to this function
          const current = finishedWork.alternate;
          commitCachePassiveMountEffect(current, finishedWork);
        }

        break;
      }

    case TracingMarkerComponent:

    default:
      {
        recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
        break;
      }
  }
}

function recursivelyTraverseAtomicPassiveEffects(finishedRoot, parentFiber, committedLanes, committedTransitions) {

  if (parentFiber.subtreeFlags & PassiveMask) {
    let child = parentFiber.child;

    while (child !== null) {
      commitAtomicPassiveEffects(finishedRoot, child);
      child = child.sibling;
    }
  }
}

function commitAtomicPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions) {
  // "Atomic" effects are ones that need to fire on every commit, even during
  // pre-rendering. We call this function when traversing a hidden tree whose
  // regular effects are currently disconnected.
  const flags = finishedWork.flags;

  switch (finishedWork.tag) {
    case OffscreenComponent:
      {
        recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);

        if (flags & Passive$1) {
          // TODO: Pass `current` as argument to this function
          const current = finishedWork.alternate;
          commitOffscreenPassiveMountEffects(current, finishedWork);
        }

        break;
      }

    case CacheComponent:
      {
        recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);

        if (flags & Passive$1) {
          // TODO: Pass `current` as argument to this function
          const current = finishedWork.alternate;
          commitCachePassiveMountEffect(current, finishedWork);
        }

        break;
      }

    default:
      {
        recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
        break;
      }
  }
}

function commitPassiveUnmountEffects(finishedWork) {
  commitPassiveUnmountOnFiber(finishedWork);
} // If we're inside a brand new tree, or a tree that was already visible, then we
// should only suspend host components that have a ShouldSuspendCommit flag.
// Components without it haven't changed since the last commit, so we can skip
// over those.
//
// When we enter a tree that is being revealed (going from hidden -> visible),
// we need to suspend _any_ component that _may_ suspend. Even if they're
// already in the "current" tree. Because their visibility has changed, the
// browser may not have prerendered them yet. So we check the MaySuspendCommit
// flag instead.

let suspenseyCommitFlag = ShouldSuspendCommit;
function accumulateSuspenseyCommit(finishedWork) {
  accumulateSuspenseyCommitOnFiber(finishedWork);
}

function recursivelyAccumulateSuspenseyCommit(parentFiber) {
  if (parentFiber.subtreeFlags & suspenseyCommitFlag) {
    let child = parentFiber.child;

    while (child !== null) {
      accumulateSuspenseyCommitOnFiber(child);
      child = child.sibling;
    }
  }
}

function accumulateSuspenseyCommitOnFiber(fiber) {
  switch (fiber.tag) {
    case HostHoistable:
      {
        recursivelyAccumulateSuspenseyCommit(fiber);

        if (fiber.flags & suspenseyCommitFlag) {
          if (fiber.memoizedState !== null) {
            suspendResource( // This should always be set by visiting HostRoot first
            currentHoistableRoot, fiber.memoizedState, fiber.memoizedProps);
          }
        }

        break;
      }

    case HostComponent:
      {
        recursivelyAccumulateSuspenseyCommit(fiber);

        break;
      }

    case HostRoot:
    case HostPortal:
      {
        {
          const previousHoistableRoot = currentHoistableRoot;
          const container = fiber.stateNode.containerInfo;
          currentHoistableRoot = getHoistableRoot(container);
          recursivelyAccumulateSuspenseyCommit(fiber);
          currentHoistableRoot = previousHoistableRoot;
        }

        break;
      }

    case OffscreenComponent:
      {
        const isHidden = fiber.memoizedState !== null;

        if (isHidden) ; else {
          const current = fiber.alternate;
          const wasHidden = current !== null && current.memoizedState !== null;

          if (wasHidden) {
            // This tree is being revealed. Visit all newly visible suspensey
            // instances, even if they're in the current tree.
            const prevFlags = suspenseyCommitFlag;
            suspenseyCommitFlag = MaySuspendCommit;
            recursivelyAccumulateSuspenseyCommit(fiber);
            suspenseyCommitFlag = prevFlags;
          } else {
            recursivelyAccumulateSuspenseyCommit(fiber);
          }
        }

        break;
      }

    default:
      {
        recursivelyAccumulateSuspenseyCommit(fiber);
      }
  }
}

function detachAlternateSiblings(parentFiber) {
  // A fiber was deleted from this parent fiber, but it's still part of the
  // previous (alternate) parent fiber's list of children. Because children
  // are a linked list, an earlier sibling that's still alive will be
  // connected to the deleted fiber via its `alternate`:
  //
  //   live fiber --alternate--> previous live fiber --sibling--> deleted
  //   fiber
  //
  // We can't disconnect `alternate` on nodes that haven't been deleted yet,
  // but we can disconnect the `sibling` and `child` pointers.
  const previousFiber = parentFiber.alternate;

  if (previousFiber !== null) {
    let detachedChild = previousFiber.child;

    if (detachedChild !== null) {
      previousFiber.child = null;

      do {
        // $FlowFixMe[incompatible-use] found when upgrading Flow
        const detachedSibling = detachedChild.sibling; // $FlowFixMe[incompatible-use] found when upgrading Flow

        detachedChild.sibling = null;
        detachedChild = detachedSibling;
      } while (detachedChild !== null);
    }
  }
}

function commitHookPassiveUnmountEffects(finishedWork, nearestMountedAncestor, hookFlags) {
  if (shouldProfile(finishedWork)) {
    startPassiveEffectTimer();
    commitHookEffectListUnmount(hookFlags, finishedWork, nearestMountedAncestor);
    recordPassiveEffectDuration(finishedWork);
  } else {
    commitHookEffectListUnmount(hookFlags, finishedWork, nearestMountedAncestor);
  }
}

function recursivelyTraversePassiveUnmountEffects(parentFiber) {
  // Deletions effects can be scheduled on any fiber type. They need to happen
  // before the children effects have fired.
  const deletions = parentFiber.deletions;

  if ((parentFiber.flags & ChildDeletion) !== NoFlags$1) {
    if (deletions !== null) {
      for (let i = 0; i < deletions.length; i++) {
        const childToDelete = deletions[i]; // TODO: Convert this to use recursion

        nextEffect = childToDelete;
        commitPassiveUnmountEffectsInsideOfDeletedTree_begin(childToDelete, parentFiber);
      }
    }

    detachAlternateSiblings(parentFiber);
  }

  if (parentFiber.subtreeFlags & PassiveMask) {
    let child = parentFiber.child;

    while (child !== null) {
      commitPassiveUnmountOnFiber(child);
      child = child.sibling;
    }
  }
}

function commitPassiveUnmountOnFiber(finishedWork) {
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
      {
        recursivelyTraversePassiveUnmountEffects(finishedWork);

        if (finishedWork.flags & Passive$1) {
          commitHookPassiveUnmountEffects(finishedWork, finishedWork.return, Passive | HasEffect);
        }

        break;
      }

    case OffscreenComponent:
      {
        const instance = finishedWork.stateNode;
        const nextState = finishedWork.memoizedState;
        const isHidden = nextState !== null;

        if (isHidden && instance._visibility & OffscreenPassiveEffectsConnected && ( // For backwards compatibility, don't unmount when a tree suspends. In
        // the future we may change this to unmount after a delay.
        finishedWork.return === null || finishedWork.return.tag !== SuspenseComponent)) {
          // The effects are currently connected. Disconnect them.
          // TODO: Add option or heuristic to delay before disconnecting the
          // effects. Then if the tree reappears before the delay has elapsed, we
          // can skip toggling the effects entirely.
          instance._visibility &= ~OffscreenPassiveEffectsConnected;
          recursivelyTraverseDisconnectPassiveEffects(finishedWork);
        } else {
          recursivelyTraversePassiveUnmountEffects(finishedWork);
        }

        break;
      }

    default:
      {
        recursivelyTraversePassiveUnmountEffects(finishedWork);
        break;
      }
  }
}

function recursivelyTraverseDisconnectPassiveEffects(parentFiber) {
  // Deletions effects can be scheduled on any fiber type. They need to happen
  // before the children effects have fired.
  const deletions = parentFiber.deletions;

  if ((parentFiber.flags & ChildDeletion) !== NoFlags$1) {
    if (deletions !== null) {
      for (let i = 0; i < deletions.length; i++) {
        const childToDelete = deletions[i]; // TODO: Convert this to use recursion

        nextEffect = childToDelete;
        commitPassiveUnmountEffectsInsideOfDeletedTree_begin(childToDelete, parentFiber);
      }
    }

    detachAlternateSiblings(parentFiber);
  }

  let child = parentFiber.child;

  while (child !== null) {
    disconnectPassiveEffect(child);
    child = child.sibling;
  }
}

function disconnectPassiveEffect(finishedWork) {
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
      {
        // TODO: Check PassiveStatic flag
        commitHookPassiveUnmountEffects(finishedWork, finishedWork.return, Passive); // When disconnecting passive effects, we fire the effects in the same
        // order as during a deletiong: parent before child

        recursivelyTraverseDisconnectPassiveEffects(finishedWork);
        break;
      }

    case OffscreenComponent:
      {
        const instance = finishedWork.stateNode;

        if (instance._visibility & OffscreenPassiveEffectsConnected) {
          instance._visibility &= ~OffscreenPassiveEffectsConnected;
          recursivelyTraverseDisconnectPassiveEffects(finishedWork);
        }

        break;
      }

    default:
      {
        recursivelyTraverseDisconnectPassiveEffects(finishedWork);
        break;
      }
  }
}

function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(deletedSubtreeRoot, nearestMountedAncestor) {
  while (nextEffect !== null) {
    const fiber = nextEffect; // Deletion effects fire in parent -> child order
    commitPassiveUnmountInsideDeletedTreeOnFiber(fiber, nearestMountedAncestor);
    const child = fiber.child; // TODO: Only traverse subtree if it has a PassiveStatic flag.

    if (child !== null) {
      child.return = fiber;
      nextEffect = child;
    } else {
      commitPassiveUnmountEffectsInsideOfDeletedTree_complete(deletedSubtreeRoot);
    }
  }
}

function commitPassiveUnmountEffectsInsideOfDeletedTree_complete(deletedSubtreeRoot) {
  while (nextEffect !== null) {
    const fiber = nextEffect;
    const sibling = fiber.sibling;
    const returnFiber = fiber.return; // Recursively traverse the entire deleted tree and clean up fiber fields.
    // This is more aggressive than ideal, and the long term goal is to only
    // have to detach the deleted tree at the root.

    detachFiberAfterEffects(fiber);

    if (fiber === deletedSubtreeRoot) {
      nextEffect = null;
      return;
    }

    if (sibling !== null) {
      sibling.return = returnFiber;
      nextEffect = sibling;
      return;
    }

    nextEffect = returnFiber;
  }
}

function commitPassiveUnmountInsideDeletedTreeOnFiber(current, nearestMountedAncestor) {
  switch (current.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
      {
        commitHookPassiveUnmountEffects(current, nearestMountedAncestor, Passive);
        break;
      }
    // TODO: run passive unmount effects when unmounting a root.
    // Because passive unmount effects are not currently run,
    // the cache instance owned by the root will never be freed.
    // When effects are run, the cache should be freed here:
    // case HostRoot: {
    //   if (enableCache) {
    //     const cache = current.memoizedState.cache;
    //     releaseCache(cache);
    //   }
    //   break;
    // }

    case LegacyHiddenComponent:
    case OffscreenComponent:
      {
        {
          if (current.memoizedState !== null && current.memoizedState.cachePool !== null) {
            const cache = current.memoizedState.cachePool.pool; // Retain/release the cache used for pending (suspended) nodes.
            // Note that this is only reached in the non-suspended/visible case:
            // when the content is suspended/hidden, the retain/release occurs
            // via the parent Suspense component (see case above).

            if (cache != null) {
              retainCache(cache);
            }
          }
        }

        break;
      }

    case SuspenseComponent:
      {

        break;
      }

    case CacheComponent:
      {
        {
          const cache = current.memoizedState.cache;
          releaseCache(cache);
        }

        break;
      }
  }
}

function getCacheSignal() {

  const cache = readContext(CacheContext);
  return cache.controller.signal;
}

function getCacheForType(resourceType) {

  const cache = readContext(CacheContext);
  let cacheForType = cache.data.get(resourceType);

  if (cacheForType === undefined) {
    cacheForType = resourceType();
    cache.data.set(resourceType, cacheForType);
  }

  return cacheForType;
}

const DefaultCacheDispatcher = {
  getCacheSignal,
  getCacheForType
};

const PossiblyWeakMap = typeof WeakMap === 'function' ? WeakMap : Map;
const ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher,
      ReactCurrentCache = ReactSharedInternals.ReactCurrentCache,
      ReactCurrentOwner = ReactSharedInternals.ReactCurrentOwner,
      ReactCurrentBatchConfig$1 = ReactSharedInternals.ReactCurrentBatchConfig,
      ReactCurrentActQueue = ReactSharedInternals.ReactCurrentActQueue;
const NoContext =
/*             */
0b000;
const BatchedContext =
/*               */
0b001;
const RenderContext =
/*         */
0b010;
const CommitContext =
/*         */
0b100;
const RootInProgress = 0;
const RootFatalErrored = 1;
const RootErrored = 2;
const RootSuspended = 3;
const RootSuspendedWithDelay = 4;
const RootCompleted = 5;
const RootDidNotComplete = 6; // Describes where we are in the React execution stack

let executionContext = NoContext; // The root we're working on

let workInProgressRoot = null; // The fiber we're working on

let workInProgress = null; // The lanes we're rendering

let workInProgressRootRenderLanes = NoLanes;
const NotSuspended = 0;
const SuspendedOnError = 1;
const SuspendedOnData = 2;
const SuspendedOnImmediate = 3;
const SuspendedOnInstance = 4;
const SuspendedOnInstanceAndReadyToContinue = 5;
const SuspendedOnDeprecatedThrowPromise = 6;
const SuspendedAndReadyToContinue = 7;
const SuspendedOnHydration = 8; // When this is true, the work-in-progress fiber just suspended (or errored) and
// we've yet to unwind the stack. In some cases, we may yield to the main thread
// after this happens. If the fiber is pinged before we resume, we can retry
// immediately instead of unwinding the stack.

let workInProgressSuspendedReason = NotSuspended;
let workInProgressThrownValue = null; // Whether a ping listener was attached during this render. This is slightly
// different that whether something suspended, because we don't add multiple
// listeners to a promise we've already seen (per root and lane).

let workInProgressRootDidAttachPingListener = false; // A contextual version of workInProgressRootRenderLanes. It is a superset of
// the lanes that we started working on at the root. When we enter a subtree
// that is currently hidden, we add the lanes that would have committed if
// the hidden tree hadn't been deferred. This is modified by the
// HiddenContext module.
//
// Most things in the work loop should deal with workInProgressRootRenderLanes.
// Most things in begin/complete phases should deal with entangledRenderLanes.

let entangledRenderLanes = NoLanes; // Whether to root completed, errored, suspended, etc.

let workInProgressRootExitStatus = RootInProgress; // A fatal error, if one is thrown

let workInProgressRootFatalError = null; // The work left over by components that were visited during this render. Only
// includes unprocessed updates, not work in bailed out children.

let workInProgressRootSkippedLanes = NoLanes; // Lanes that were updated (in an interleaved event) during this render.

let workInProgressRootInterleavedUpdatedLanes = NoLanes; // Lanes that were updated during the render phase (*not* an interleaved event).

let workInProgressRootPingedLanes = NoLanes; // If this lane scheduled deferred work, this is the lane of the deferred task.

let workInProgressDeferredLane = NoLane; // Errors that are thrown during the render phase.

let workInProgressRootConcurrentErrors = null; // These are errors that we recovered from without surfacing them to the UI.
// We will log them once the tree commits.

let workInProgressRootRecoverableErrors = null; // The most recent time we either committed a fallback, or when a fallback was
// filled in with the resolved UI. This lets us throttle the appearance of new
// content as it streams in, to minimize jank.
// TODO: Think of a better name for this variable?

let globalMostRecentFallbackTime = 0;
const FALLBACK_THROTTLE_MS = 300; // The absolute time for when we should start giving up on rendering
// more and prefer CPU suspense heuristics instead.

let workInProgressRootRenderTargetTime = Infinity; // How long a render is supposed to take before we start following CPU
// suspense heuristics and opt out of rendering more content.

const RENDER_TIMEOUT_MS = 500;
let workInProgressTransitions = null;

function resetRenderTimer() {
  workInProgressRootRenderTargetTime = now$1() + RENDER_TIMEOUT_MS;
}

function getRenderTargetTime() {
  return workInProgressRootRenderTargetTime;
}
let hasUncaughtError = false;
let firstUncaughtError = null;
let legacyErrorBoundariesThatAlreadyFailed = null; // Only used when enableProfilerNestedUpdateScheduledHook is true;
let rootDoesHavePassiveEffects = false;
let rootWithPendingPassiveEffects = null;
let pendingPassiveEffectsLanes = NoLanes;
let pendingPassiveProfilerEffects = [];
let pendingPassiveEffectsRemainingLanes = NoLanes;
let pendingPassiveTransitions = null; // Use these to prevent an infinite loop of nested updates

const NESTED_UPDATE_LIMIT = 50;
let nestedUpdateCount = 0;
let rootWithNestedUpdates = null;
function getWorkInProgressRoot() {
  return workInProgressRoot;
}
function getWorkInProgressRootRenderLanes() {
  return workInProgressRootRenderLanes;
}
function isWorkLoopSuspendedOnData() {
  return workInProgressSuspendedReason === SuspendedOnData;
}
function requestUpdateLane(fiber) {
  // Special cases
  const mode = fiber.mode;

  if ((mode & ConcurrentMode) === NoMode) {
    return SyncLane;
  } else if ((executionContext & RenderContext) !== NoContext && workInProgressRootRenderLanes !== NoLanes) {
    // This is a render phase update. These are not officially supported. The
    // old behavior is to give this the same "thread" (lanes) as
    // whatever is currently rendering. So if you call `setState` on a component
    // that happens later in the same render, it will flush. Ideally, we want to
    // remove the special case and treat them as if they came from an
    // interleaved event. Regardless, this pattern is not officially supported.
    // This behavior is only a fallback. The flag only exists until we can roll
    // out the setState warning, since existing code might accidentally rely on
    // the current behavior.
    return pickArbitraryLane(workInProgressRootRenderLanes);
  }

  const isTransition = requestCurrentTransition() !== NoTransition;

  if (isTransition) {

    const actionScopeLane = peekEntangledActionLane();
    return actionScopeLane !== NoLane ? // We're inside an async action scope. Reuse the same lane.
    actionScopeLane : // We may or may not be inside an async action scope. If we are, this
    // is the first update in that scope. Either way, we need to get a
    // fresh transition lane.
    requestTransitionLane();
  } // Updates originating inside certain React methods, like flushSync, have
  // their priority set by tracking it with a context variable.
  //
  // The opaque type returned by the host config is internally a lane, so we can
  // use that directly.
  // TODO: Move this type conversion to the event priority module.


  const updateLane = getCurrentUpdatePriority();

  if (updateLane !== NoLane) {
    return updateLane;
  } // This update originated outside React. Ask the host environment for an
  // appropriate priority, based on the type of event.
  //
  // The opaque type returned by the host config is internally a lane, so we can
  // use that directly.
  // TODO: Move this type conversion to the event priority module.


  const eventLane = getCurrentEventPriority();
  return eventLane;
}

function requestRetryLane(fiber) {
  // This is a fork of `requestUpdateLane` designed specifically for Suspense
  // "retries" — a special update that attempts to flip a Suspense boundary
  // from its placeholder state to its primary/resolved state.
  // Special cases
  const mode = fiber.mode;

  if ((mode & ConcurrentMode) === NoMode) {
    return SyncLane;
  }

  return claimNextRetryLane();
}

function requestDeferredLane() {
  if (workInProgressDeferredLane === NoLane) {
    // If there are multiple useDeferredValue hooks in the same render, the
    // tasks that they spawn should all be batched together, so they should all
    // receive the same lane.
    // Check the priority of the current render to decide the priority of the
    // deferred task.
    // OffscreenLane is used for prerendering, but we also use OffscreenLane
    // for incremental hydration. It's given the lowest priority because the
    // initial HTML is the same as the final UI. But useDeferredValue during
    // hydration is an exception — we need to upgrade the UI to the final
    // value. So if we're currently hydrating, we treat it like a transition.
    const isPrerendering = includesSomeLane(workInProgressRootRenderLanes, OffscreenLane) && !getIsHydrating();

    if (isPrerendering) {
      // There's only one OffscreenLane, so if it contains deferred work, we
      // should just reschedule using the same lane.
      workInProgressDeferredLane = OffscreenLane;
    } else {
      // Everything else is spawned as a transition.
      workInProgressDeferredLane = requestTransitionLane();
    }
  }

  return workInProgressDeferredLane;
}
function scheduleUpdateOnFiber(root, fiber, lane) {
  // finish loading.


  if ( // Suspended render phase
  root === workInProgressRoot && workInProgressSuspendedReason === SuspendedOnData || // Suspended commit phase
  root.cancelPendingCommit !== null) {
    // The incoming update might unblock the current render. Interrupt the
    // current attempt and restart from the top.
    prepareFreshStack(root, NoLanes);
    markRootSuspended(root, workInProgressRootRenderLanes, workInProgressDeferredLane);
  } // Mark that the root has a pending update.


  markRootUpdated(root, lane);

  if ((executionContext & RenderContext) !== NoLanes && root === workInProgressRoot) ; else {
    // This is a normal update, scheduled from outside the render phase. For
    // example, during an input event.
    {
      if (isDevToolsPresent) {
        addFiberToLanesMap(root, fiber, lane);
      }
    }

    if (root === workInProgressRoot) {
      // Received an update to a tree that's in the middle of rendering. Mark
      // that there was an interleaved update work on this root.
      if ((executionContext & RenderContext) === NoContext) {
        workInProgressRootInterleavedUpdatedLanes = mergeLanes(workInProgressRootInterleavedUpdatedLanes, lane);
      }

      if (workInProgressRootExitStatus === RootSuspendedWithDelay) {
        // The root already suspended with a delay, which means this render
        // definitely won't finish. Since we have a new update, let's mark it as
        // suspended now, right before marking the incoming update. This has the
        // effect of interrupting the current render and switching to the update.
        // TODO: Make sure this doesn't override pings that happen while we've
        // already started rendering.
        markRootSuspended(root, workInProgressRootRenderLanes, workInProgressDeferredLane);
      }
    }

    ensureRootIsScheduled(root);

    if (lane === SyncLane && executionContext === NoContext && (fiber.mode & ConcurrentMode) === NoMode) {
      {
        // Flush the synchronous work now, unless we're already working or inside
        // a batch. This is intentionally inside scheduleUpdateOnFiber instead of
        // scheduleCallbackForFiber to preserve the ability to schedule a callback
        // without immediately flushing it. We only do this for user-initiated
        // updates, to preserve historical behavior of legacy mode.
        resetRenderTimer();
        flushSyncWorkOnLegacyRootsOnly();
      }
    }
  }
}
function scheduleInitialHydrationOnRoot(root, lane) {
  // This is a special fork of scheduleUpdateOnFiber that is only used to
  // schedule the initial hydration of a root that has just been created. Most
  // of the stuff in scheduleUpdateOnFiber can be skipped.
  //
  // The main reason for this separate path, though, is to distinguish the
  // initial children from subsequent updates. In fully client-rendered roots
  // (createRoot instead of hydrateRoot), all top-level renders are modeled as
  // updates, but hydration roots are special because the initial render must
  // match what was rendered on the server.
  const current = root.current;
  current.lanes = lane;
  markRootUpdated(root, lane);
  ensureRootIsScheduled(root);
}
function isUnsafeClassRenderPhaseUpdate(fiber) {
  // Check if this is a render phase update. Only called by class components,
  // which special (deprecated) behavior for UNSAFE_componentWillReceive props.
  return (executionContext & RenderContext) !== NoContext;
} // This is the entry point for every concurrent task, i.e. anything that
// goes through Scheduler.

function performConcurrentWorkOnRoot(root, didTimeout) {
  {
    resetNestedUpdateFlag();
  }

  if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
    throw Error(formatProdErrorMessage(327));
  } // Flush any pending passive effects before deciding which lanes to work on,
  // in case they schedule additional work.


  const originalCallbackNode = root.callbackNode;
  const didFlushPassiveEffects = flushPassiveEffects();

  if (didFlushPassiveEffects) {
    // Something in the passive effect phase may have canceled the current task.
    // Check if the task node for this root was changed.
    if (root.callbackNode !== originalCallbackNode) {
      // The current task was canceled. Exit. We don't need to call
      // `ensureRootIsScheduled` because the check above implies either that
      // there's a new task, or that there's no remaining work on this root.
      return null;
    }
  } // Determine the next lanes to work on, using the fields stored
  // on the root.
  // TODO: This was already computed in the caller. Pass it as an argument.


  let lanes = getNextLanes(root, root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes);

  if (lanes === NoLanes) {
    // Defensive coding. This is never expected to happen.
    return null;
  } // We disable time-slicing in some cases: if the work has been CPU-bound
  // for too long ("expired" work, to prevent starvation), or we're in
  // sync-updates-by-default mode.
  // TODO: We only check `didTimeout` defensively, to account for a Scheduler
  // bug we're still investigating. Once the bug in Scheduler is fixed,
  // we can remove this, since we track expiration ourselves.


  const shouldTimeSlice = !includesBlockingLane(root, lanes) && !includesExpiredLane(root, lanes) && (!didTimeout);
  let exitStatus = shouldTimeSlice ? renderRootConcurrent(root, lanes) : renderRootSync(root, lanes);

  if (exitStatus !== RootInProgress) {
    let renderWasConcurrent = shouldTimeSlice;

    do {
      if (exitStatus === RootDidNotComplete) {
        // The render unwound without completing the tree. This happens in special
        // cases where need to exit the current render without producing a
        // consistent tree or committing.
        markRootSuspended(root, lanes, NoLane);
      } else {
        // The render completed.
        // Check if this render may have yielded to a concurrent event, and if so,
        // confirm that any newly rendered stores are consistent.
        // TODO: It's possible that even a concurrent render may never have yielded
        // to the main thread, if it was fast enough, or if it expired. We could
        // skip the consistency check in that case, too.
        const finishedWork = root.current.alternate;

        if (renderWasConcurrent && !isRenderConsistentWithExternalStores(finishedWork)) {
          // A store was mutated in an interleaved event. Render again,
          // synchronously, to block further mutations.
          exitStatus = renderRootSync(root, lanes); // We assume the tree is now consistent because we didn't yield to any
          // concurrent events.

          renderWasConcurrent = false; // Need to check the exit status again.

          continue;
        } // Check if something threw


        if (exitStatus === RootErrored) {
          const originallyAttemptedLanes = lanes;
          const errorRetryLanes = getLanesToRetrySynchronouslyOnError(root, originallyAttemptedLanes);

          if (errorRetryLanes !== NoLanes) {
            lanes = errorRetryLanes;
            exitStatus = recoverFromConcurrentError(root, originallyAttemptedLanes, errorRetryLanes);
            renderWasConcurrent = false;
          }
        }

        if (exitStatus === RootFatalErrored) {
          const fatalError = workInProgressRootFatalError;
          prepareFreshStack(root, NoLanes);
          markRootSuspended(root, lanes, NoLane);
          ensureRootIsScheduled(root);
          throw fatalError;
        } // We now have a consistent tree. The next step is either to commit it,
        // or, if something suspended, wait to commit it after a timeout.


        root.finishedWork = finishedWork;
        root.finishedLanes = lanes;
        finishConcurrentRender(root, exitStatus, finishedWork, lanes);
      }

      break;
    } while (true);
  }

  ensureRootIsScheduled(root);
  return getContinuationForRoot(root, originalCallbackNode);
}

function recoverFromConcurrentError(root, originallyAttemptedLanes, errorRetryLanes) {
  // If an error occurred during hydration, discard server response and fall
  // back to client side render.
  // Before rendering again, save the errors from the previous attempt.
  const errorsFromFirstAttempt = workInProgressRootConcurrentErrors;
  const wasRootDehydrated = isRootDehydrated(root);

  if (wasRootDehydrated) {
    // The shell failed to hydrate. Set a flag to force a client rendering
    // during the next attempt. To do this, we call prepareFreshStack now
    // to create the root work-in-progress fiber. This is a bit weird in terms
    // of factoring, because it relies on renderRootSync not calling
    // prepareFreshStack again in the call below, which happens because the
    // root and lanes haven't changed.
    //
    // TODO: I think what we should do is set ForceClientRender inside
    // throwException, like we do for nested Suspense boundaries. The reason
    // it's here instead is so we can switch to the synchronous work loop, too.
    // Something to consider for a future refactor.
    const rootWorkInProgress = prepareFreshStack(root, errorRetryLanes);
    rootWorkInProgress.flags |= ForceClientRender;
  }

  const exitStatus = renderRootSync(root, errorRetryLanes);

  if (exitStatus !== RootErrored) {
    // Successfully finished rendering on retry
    if (workInProgressRootDidAttachPingListener && !wasRootDehydrated) {
      // During the synchronous render, we attached additional ping listeners.
      // This is highly suggestive of an uncached promise (though it's not the
      // only reason this would happen). If it was an uncached promise, then
      // it may have masked a downstream error from ocurring without actually
      // fixing it. Example:
      //
      //    use(Promise.resolve('uncached'))
      //    throw new Error('Oops!')
      //
      // When this happens, there's a conflict between blocking potential
      // concurrent data races and unwrapping uncached promise values. We
      // have to choose one or the other. Because the data race recovery is
      // a last ditch effort, we'll disable it.
      root.errorRecoveryDisabledLanes = mergeLanes(root.errorRecoveryDisabledLanes, originallyAttemptedLanes); // Mark the current render as suspended and force it to restart. Once
      // these lanes finish successfully, we'll re-enable the error recovery
      // mechanism for subsequent updates.

      workInProgressRootInterleavedUpdatedLanes |= originallyAttemptedLanes;
      return RootSuspendedWithDelay;
    } // The errors from the failed first attempt have been recovered. Add
    // them to the collection of recoverable errors. We'll log them in the
    // commit phase.


    const errorsFromSecondAttempt = workInProgressRootRecoverableErrors;
    workInProgressRootRecoverableErrors = errorsFromFirstAttempt; // The errors from the second attempt should be queued after the errors
    // from the first attempt, to preserve the causal sequence.

    if (errorsFromSecondAttempt !== null) {
      queueRecoverableErrors(errorsFromSecondAttempt);
    }
  }

  return exitStatus;
}

function queueRecoverableErrors(errors) {
  if (workInProgressRootRecoverableErrors === null) {
    workInProgressRootRecoverableErrors = errors;
  } else {
    // $FlowFixMe[method-unbinding]
    workInProgressRootRecoverableErrors.push.apply(workInProgressRootRecoverableErrors, errors);
  }
}

function finishConcurrentRender(root, exitStatus, finishedWork, lanes) {
  // TODO: The fact that most of these branches are identical suggests that some
  // of the exit statuses are not best modeled as exit statuses and should be
  // tracked orthogonally.
  switch (exitStatus) {
    case RootInProgress:
    case RootFatalErrored:
      {
        throw Error(formatProdErrorMessage(345));
      }

    case RootSuspendedWithDelay:
      {
        if (includesOnlyTransitions(lanes)) {
          // This is a transition, so we should exit without committing a
          // placeholder and without scheduling a timeout. Delay indefinitely
          // until we receive more data.
          markRootSuspended(root, lanes, workInProgressDeferredLane);
          return;
        } // Commit the placeholder.


        break;
      }

    case RootErrored:
    case RootSuspended:
    case RootCompleted:
      {
        break;
      }

    default:
      {
        throw Error(formatProdErrorMessage(329));
      }
  }

  {
    if (includesOnlyRetries(lanes) && (alwaysThrottleRetries )) {
      // This render only included retries, no updates. Throttle committing
      // retries so that we don't show too many loading states too quickly.
      const msUntilTimeout = globalMostRecentFallbackTime + FALLBACK_THROTTLE_MS - now$1(); // Don't bother with a very short suspense time.

      if (msUntilTimeout > 10) {
        markRootSuspended(root, lanes, workInProgressDeferredLane);
        const nextLanes = getNextLanes(root, NoLanes);

        if (nextLanes !== NoLanes) {
          // There's additional work we can do on this root. We might as well
          // attempt to work on that while we're suspended.
          return;
        } // The render is suspended, it hasn't timed out, and there's no
        // lower priority work to do. Instead of committing the fallback
        // immediately, wait for more data to arrive.
        // TODO: Combine retry throttling with Suspensey commits. Right now they
        // run one after the other.


        root.timeoutHandle = scheduleTimeout(commitRootWhenReady.bind(null, root, finishedWork, workInProgressRootRecoverableErrors, workInProgressTransitions, lanes, workInProgressDeferredLane), msUntilTimeout);
        return;
      }
    }

    commitRootWhenReady(root, finishedWork, workInProgressRootRecoverableErrors, workInProgressTransitions, lanes, workInProgressDeferredLane);
  }
}

function commitRootWhenReady(root, finishedWork, recoverableErrors, transitions, lanes, spawnedLane) {
  // TODO: Combine retry throttling with Suspensey commits. Right now they run
  // one after the other.
  if (includesOnlyNonUrgentLanes(lanes)) {
    // Before committing, ask the renderer whether the host tree is ready.
    // If it's not, we'll wait until it notifies us.
    startSuspendingCommit(); // This will walk the completed fiber tree and attach listeners to all
    // the suspensey resources. The renderer is responsible for accumulating
    // all the load events. This all happens in a single synchronous
    // transaction, so it track state in its own module scope.

    accumulateSuspenseyCommit(finishedWork); // At the end, ask the renderer if it's ready to commit, or if we should
    // suspend. If it's not ready, it will return a callback to subscribe to
    // a ready event.

    const schedulePendingCommit = waitForCommitToBeReady();

    if (schedulePendingCommit !== null) {
      // NOTE: waitForCommitToBeReady returns a subscribe function so that we
      // only allocate a function if the commit isn't ready yet. The other
      // pattern would be to always pass a callback to waitForCommitToBeReady.
      // Not yet ready to commit. Delay the commit until the renderer notifies
      // us that it's ready. This will be canceled if we start work on the
      // root again.
      root.cancelPendingCommit = schedulePendingCommit(commitRoot.bind(null, root, recoverableErrors, transitions));
      markRootSuspended(root, lanes, spawnedLane);
      return;
    }
  } // Otherwise, commit immediately.


  commitRoot(root, recoverableErrors, transitions, spawnedLane);
}

function isRenderConsistentWithExternalStores(finishedWork) {
  // Search the rendered tree for external store reads, and check whether the
  // stores were mutated in a concurrent event. Intentionally using an iterative
  // loop instead of recursion so we can exit early.
  let node = finishedWork;

  while (true) {
    if (node.flags & StoreConsistency) {
      const updateQueue = node.updateQueue;

      if (updateQueue !== null) {
        const checks = updateQueue.stores;

        if (checks !== null) {
          for (let i = 0; i < checks.length; i++) {
            const check = checks[i];
            const getSnapshot = check.getSnapshot;
            const renderedValue = check.value;

            try {
              if (!objectIs(getSnapshot(), renderedValue)) {
                // Found an inconsistent store.
                return false;
              }
            } catch (error) {
              // If `getSnapshot` throws, return `false`. This will schedule
              // a re-render, and the error will be rethrown during render.
              return false;
            }
          }
        }
      }
    }

    const child = node.child;

    if (node.subtreeFlags & StoreConsistency && child !== null) {
      child.return = node;
      node = child;
      continue;
    }

    if (node === finishedWork) {
      return true;
    }

    while (node.sibling === null) {
      if (node.return === null || node.return === finishedWork) {
        return true;
      }

      node = node.return;
    }

    node.sibling.return = node.return;
    node = node.sibling;
  } // Flow doesn't know this is unreachable, but eslint does
  // eslint-disable-next-line no-unreachable


  return true;
}

function markRootSuspended(root, suspendedLanes, spawnedLane) {
  // When suspending, we should always exclude lanes that were pinged or (more
  // rarely, since we try to avoid it) updated during the render phase.
  // TODO: Lol maybe there's a better way to factor this besides this
  // obnoxiously named function :)
  suspendedLanes = removeLanes(suspendedLanes, workInProgressRootPingedLanes);
  suspendedLanes = removeLanes(suspendedLanes, workInProgressRootInterleavedUpdatedLanes);
  markRootSuspended$1(root, suspendedLanes, spawnedLane);
} // This is the entry point for synchronous tasks that don't go
// through Scheduler


function performSyncWorkOnRoot(root, lanes) {
  if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
    throw Error(formatProdErrorMessage(327));
  }

  const didFlushPassiveEffects = flushPassiveEffects();

  if (didFlushPassiveEffects) {
    // If passive effects were flushed, exit to the outer work loop in the root
    // scheduler, so we can recompute the priority.
    // TODO: We don't actually need this `ensureRootIsScheduled` call because
    // this path is only reachable if the root is already part of the schedule.
    // I'm including it only for consistency with the other exit points from
    // this function. Can address in a subsequent refactor.
    ensureRootIsScheduled(root);
    return null;
  }

  {
    syncNestedUpdateFlag();
  }

  let exitStatus = renderRootSync(root, lanes);

  if (root.tag !== LegacyRoot && exitStatus === RootErrored) {
    // If something threw an error, try rendering one more time. We'll render
    // synchronously to block concurrent data mutations, and we'll includes
    // all pending updates are included. If it still fails after the second
    // attempt, we'll give up and commit the resulting tree.
    const originallyAttemptedLanes = lanes;
    const errorRetryLanes = getLanesToRetrySynchronouslyOnError(root, originallyAttemptedLanes);

    if (errorRetryLanes !== NoLanes) {
      lanes = errorRetryLanes;
      exitStatus = recoverFromConcurrentError(root, originallyAttemptedLanes, errorRetryLanes);
    }
  }

  if (exitStatus === RootFatalErrored) {
    const fatalError = workInProgressRootFatalError;
    prepareFreshStack(root, NoLanes);
    markRootSuspended(root, lanes, NoLane);
    ensureRootIsScheduled(root);
    throw fatalError;
  }

  if (exitStatus === RootDidNotComplete) {
    // The render unwound without completing the tree. This happens in special
    // cases where need to exit the current render without producing a
    // consistent tree or committing.
    markRootSuspended(root, lanes, NoLane);
    ensureRootIsScheduled(root);
    return null;
  } // We now have a consistent tree. Because this is a sync render, we
  // will commit it even if something suspended.


  const finishedWork = root.current.alternate;
  root.finishedWork = finishedWork;
  root.finishedLanes = lanes;
  commitRoot(root, workInProgressRootRecoverableErrors, workInProgressTransitions, workInProgressDeferredLane); // Before exiting, make sure there's a callback scheduled for the next
  // pending level.

  ensureRootIsScheduled(root);
  return null;
}
function flushRoot(root, lanes) {
  if (lanes !== NoLanes) {
    upgradePendingLanesToSync(root, lanes);
    ensureRootIsScheduled(root);

    if ((executionContext & (RenderContext | CommitContext)) === NoContext) {
      resetRenderTimer(); // TODO: For historical reasons this flushes all sync work across all
      // roots. It shouldn't really matter either way, but we could change this
      // to only flush the given root.

      flushSyncWorkOnAllRoots();
    }
  }
}
function getExecutionContext() {
  return executionContext;
}
function batchedUpdates$1(fn, a) {
  const prevExecutionContext = executionContext;
  executionContext |= BatchedContext;

  try {
    return fn(a);
  } finally {
    executionContext = prevExecutionContext; // If there were legacy sync updates, flush them at the end of the outer
    // most batchedUpdates-like method.

    if (executionContext === NoContext && // Treat `act` as if it's inside `batchedUpdates`, even in legacy mode.
    !(false )) {
      resetRenderTimer();
      flushSyncWorkOnLegacyRootsOnly();
    }
  }
}
// Warning, this opts-out of checking the function body.
// eslint-disable-next-line no-unused-vars
// eslint-disable-next-line no-redeclare
// eslint-disable-next-line no-redeclare

function flushSync$1(fn) {
  // In legacy mode, we flush pending passive effects at the beginning of the
  // next event, not at the end of the previous one.
  if (rootWithPendingPassiveEffects !== null && rootWithPendingPassiveEffects.tag === LegacyRoot && (executionContext & (RenderContext | CommitContext)) === NoContext) {
    flushPassiveEffects();
  }

  const prevExecutionContext = executionContext;
  executionContext |= BatchedContext;
  const prevTransition = ReactCurrentBatchConfig$1.transition;
  const previousPriority = getCurrentUpdatePriority();

  try {
    ReactCurrentBatchConfig$1.transition = null;
    setCurrentUpdatePriority(DiscreteEventPriority);

    if (fn) {
      return fn();
    } else {
      return undefined;
    }
  } finally {
    setCurrentUpdatePriority(previousPriority);
    ReactCurrentBatchConfig$1.transition = prevTransition;
    executionContext = prevExecutionContext; // Flush the immediate callbacks that were scheduled during this batch.
    // Note that this will happen even if batchedUpdates is higher up
    // the stack.

    if ((executionContext & (RenderContext | CommitContext)) === NoContext) {
      flushSyncWorkOnAllRoots();
    }
  }
}
function isInvalidExecutionContextForEventFunction() {
  // Used to throw if certain APIs are called from the wrong context.
  return (executionContext & RenderContext) !== NoContext;
} // This is called by the HiddenContext module when we enter or leave a
// hidden subtree. The stack logic is managed there because that's the only
// place that ever modifies it. Which module it lives in doesn't matter for
// performance because this function will get inlined regardless

function setEntangledRenderLanes(newEntangledRenderLanes) {
  entangledRenderLanes = newEntangledRenderLanes;
}
function getEntangledRenderLanes() {
  return entangledRenderLanes;
}

function resetWorkInProgressStack() {
  if (workInProgress === null) return;
  let interruptedWork;

  if (workInProgressSuspendedReason === NotSuspended) {
    // Normal case. Work-in-progress hasn't started yet. Unwind all
    // its parents.
    interruptedWork = workInProgress.return;
  } else {
    // Work-in-progress is in suspended state. Reset the work loop and unwind
    // both the suspended fiber and all its parents.
    resetSuspendedWorkLoopOnUnwind(workInProgress);
    interruptedWork = workInProgress;
  }

  while (interruptedWork !== null) {
    const current = interruptedWork.alternate;
    unwindInterruptedWork(current, interruptedWork);
    interruptedWork = interruptedWork.return;
  }

  workInProgress = null;
}

function prepareFreshStack(root, lanes) {
  root.finishedWork = null;
  root.finishedLanes = NoLanes;
  const timeoutHandle = root.timeoutHandle;

  if (timeoutHandle !== noTimeout) {
    // The root previous suspended and scheduled a timeout to commit a fallback
    // state. Now that we have additional work, cancel the timeout.
    root.timeoutHandle = noTimeout; // $FlowFixMe[incompatible-call] Complains noTimeout is not a TimeoutID, despite the check above

    cancelTimeout(timeoutHandle);
  }

  const cancelPendingCommit = root.cancelPendingCommit;

  if (cancelPendingCommit !== null) {
    root.cancelPendingCommit = null;
    cancelPendingCommit();
  }

  resetWorkInProgressStack();
  workInProgressRoot = root;
  const rootWorkInProgress = createWorkInProgress(root.current, null);
  workInProgress = rootWorkInProgress;
  workInProgressRootRenderLanes = lanes;
  workInProgressSuspendedReason = NotSuspended;
  workInProgressThrownValue = null;
  workInProgressRootDidAttachPingListener = false;
  workInProgressRootExitStatus = RootInProgress;
  workInProgressRootFatalError = null;
  workInProgressRootSkippedLanes = NoLanes;
  workInProgressRootInterleavedUpdatedLanes = NoLanes;
  workInProgressRootPingedLanes = NoLanes;
  workInProgressDeferredLane = NoLane;
  workInProgressRootConcurrentErrors = null;
  workInProgressRootRecoverableErrors = null; // Get the lanes that are entangled with whatever we're about to render. We
  // track these separately so we can distinguish the priority of the render
  // task from the priority of the lanes it is entangled with. For example, a
  // transition may not be allowed to finish unless it includes the Sync lane,
  // which is currently suspended. We should be able to render the Transition
  // and Sync lane in the same batch, but at Transition priority, because the
  // Sync lane already suspended.

  entangledRenderLanes = getEntangledLanes(root, lanes);
  finishQueueingConcurrentUpdates();

  return rootWorkInProgress;
}

function resetSuspendedWorkLoopOnUnwind(fiber) {
  // Reset module-level state that was set during the render phase.
  resetContextDependencies();
  resetHooksOnUnwind(fiber);
  resetChildReconcilerOnUnwind();
}

function handleThrow(root, thrownValue) {
  // A component threw an exception. Usually this is because it suspended, but
  // it also includes regular program errors.
  //
  // We're either going to unwind the stack to show a Suspense or error
  // boundary, or we're going to replay the component again. Like after a
  // promise resolves.
  //
  // Until we decide whether we're going to unwind or replay, we should preserve
  // the current state of the work loop without resetting anything.
  //
  // If we do decide to unwind the stack, module-level variables will be reset
  // in resetSuspendedWorkLoopOnUnwind.
  // These should be reset immediately because they're only supposed to be set
  // when React is executing user code.
  resetHooksAfterThrow();
  ReactCurrentOwner.current = null;

  if (thrownValue === SuspenseException) {
    // This is a special type of exception used for Suspense. For historical
    // reasons, the rest of the Suspense implementation expects the thrown value
    // to be a thenable, because before `use` existed that was the (unstable)
    // API for suspending. This implementation detail can change later, once we
    // deprecate the old API in favor of `use`.
    thrownValue = getSuspendedThenable();
    workInProgressSuspendedReason = shouldRemainOnPreviousScreen() && // Check if there are other pending updates that might possibly unblock this
    // component from suspending. This mirrors the check in
    // renderDidSuspendDelayIfPossible. We should attempt to unify them somehow.
    // TODO: Consider unwinding immediately, using the
    // SuspendedOnHydration mechanism.
    !includesNonIdleWork(workInProgressRootSkippedLanes) && !includesNonIdleWork(workInProgressRootInterleavedUpdatedLanes) ? // Suspend work loop until data resolves
    SuspendedOnData : // Don't suspend work loop, except to check if the data has
    // immediately resolved (i.e. in a microtask). Otherwise, trigger the
    // nearest Suspense fallback.
    SuspendedOnImmediate;
  } else if (thrownValue === SuspenseyCommitException) {
    thrownValue = getSuspendedThenable();
    workInProgressSuspendedReason = SuspendedOnInstance;
  } else if (thrownValue === SelectiveHydrationException) {
    // An update flowed into a dehydrated boundary. Before we can apply the
    // update, we need to finish hydrating. Interrupt the work-in-progress
    // render so we can restart at the hydration lane.
    //
    // The ideal implementation would be able to switch contexts without
    // unwinding the current stack.
    //
    // We could name this something more general but as of now it's the only
    // case where we think this should happen.
    workInProgressSuspendedReason = SuspendedOnHydration;
  } else {
    // This is a regular error.
    const isWakeable = thrownValue !== null && typeof thrownValue === 'object' && typeof thrownValue.then === 'function';
    workInProgressSuspendedReason = isWakeable ? // A wakeable object was thrown by a legacy Suspense implementation.
    // This has slightly different behavior than suspending with `use`.
    SuspendedOnDeprecatedThrowPromise : // This is a regular error. If something earlier in the component already
    // suspended, we must clear the thenable state to unblock the work loop.
    SuspendedOnError;
  }

  workInProgressThrownValue = thrownValue;
  const erroredWork = workInProgress;

  if (erroredWork === null) {
    // This is a fatal error
    workInProgressRootExitStatus = RootFatalErrored;
    workInProgressRootFatalError = thrownValue;
    return;
  }

  if (erroredWork.mode & ProfileMode) {
    // Record the time spent rendering before an error was thrown. This
    // avoids inaccurate Profiler durations in the case of a
    // suspended render.
    stopProfilerTimerIfRunningAndRecordDelta(erroredWork, true);
  }

  {
    markComponentRenderStopped();

    switch (workInProgressSuspendedReason) {
      case SuspendedOnError:
        {
          markComponentErrored(erroredWork, thrownValue, workInProgressRootRenderLanes);
          break;
        }

      case SuspendedOnData:
      case SuspendedOnImmediate:
      case SuspendedOnDeprecatedThrowPromise:
      case SuspendedAndReadyToContinue:
        {
          const wakeable = thrownValue;
          markComponentSuspended(erroredWork, wakeable, workInProgressRootRenderLanes);
          break;
        }
    }
  }
}

function shouldRemainOnPreviousScreen() {
  // This is asking whether it's better to suspend the transition and remain
  // on the previous screen, versus showing a fallback as soon as possible. It
  // takes into account both the priority of render and also whether showing a
  // fallback would produce a desirable user experience.
  const handler = getSuspenseHandler();

  if (handler === null) {
    // There's no Suspense boundary that can provide a fallback. We have no
    // choice but to remain on the previous screen.
    // NOTE: We do this even for sync updates, for lack of any better option. In
    // the future, we may change how we handle this, like by putting the whole
    // root into a "detached" mode.
    return true;
  } // TODO: Once `use` has fully replaced the `throw promise` pattern, we should
  // be able to remove the equivalent check in finishConcurrentRender, and rely
  // just on this one.


  if (includesOnlyTransitions(workInProgressRootRenderLanes)) {
    if (getShellBoundary() === null) {
      // We're rendering inside the "shell" of the app. Activating the nearest
      // fallback would cause visible content to disappear. It's better to
      // suspend the transition and remain on the previous screen.
      return true;
    } else {
      // We're rendering content that wasn't part of the previous screen.
      // Rather than block the transition, it's better to show a fallback as
      // soon as possible. The appearance of any nested fallbacks will be
      // throttled to avoid jank.
      return false;
    }
  }

  if (includesOnlyRetries(workInProgressRootRenderLanes) || // In this context, an OffscreenLane counts as a Retry
  // TODO: It's become increasingly clear that Retries and Offscreen are
  // deeply connected. They probably can be unified further.
  includesSomeLane(workInProgressRootRenderLanes, OffscreenLane)) {
    // During a retry, we can suspend rendering if the nearest Suspense boundary
    // is the boundary of the "shell", because we're guaranteed not to block
    // any new content from appearing.
    //
    // The reason we must check if this is a retry is because it guarantees
    // that suspending the work loop won't block an actual update, because
    // retries don't "update" anything; they fill in fallbacks that were left
    // behind by a previous transition.
    return handler === getShellBoundary();
  } // For all other Lanes besides Transitions and Retries, we should not wait
  // for the data to load.


  return false;
}

function pushDispatcher(container) {
  const prevDispatcher = ReactCurrentDispatcher.current;
  ReactCurrentDispatcher.current = ContextOnlyDispatcher;

  if (prevDispatcher === null) {
    // The React isomorphic package does not include a default dispatcher.
    // Instead the first renderer will lazily attach one, in order to give
    // nicer error messages.
    return ContextOnlyDispatcher;
  } else {
    return prevDispatcher;
  }
}

function popDispatcher(prevDispatcher) {
  ReactCurrentDispatcher.current = prevDispatcher;
}

function pushCacheDispatcher() {
  {
    const prevCacheDispatcher = ReactCurrentCache.current;
    ReactCurrentCache.current = DefaultCacheDispatcher;
    return prevCacheDispatcher;
  }
}

function popCacheDispatcher(prevCacheDispatcher) {
  {
    ReactCurrentCache.current = prevCacheDispatcher;
  }
}

function markCommitTimeOfFallback() {
  globalMostRecentFallbackTime = now$1();
}
function markSkippedUpdateLanes(lane) {
  workInProgressRootSkippedLanes = mergeLanes(lane, workInProgressRootSkippedLanes);
}
function renderDidSuspend() {
  if (workInProgressRootExitStatus === RootInProgress) {
    workInProgressRootExitStatus = RootSuspended;
  }
}
function renderDidSuspendDelayIfPossible() {
  workInProgressRootExitStatus = RootSuspendedWithDelay; // Check if there are updates that we skipped tree that might have unblocked
  // this render.

  if ((includesNonIdleWork(workInProgressRootSkippedLanes) || includesNonIdleWork(workInProgressRootInterleavedUpdatedLanes)) && workInProgressRoot !== null) {
    // Mark the current render as suspended so that we switch to working on
    // the updates that were skipped. Usually we only suspend at the end of
    // the render phase.
    // TODO: We should probably always mark the root as suspended immediately
    // (inside this function), since by suspending at the end of the render
    // phase introduces a potential mistake where we suspend lanes that were
    // pinged or updated while we were rendering.
    // TODO: Consider unwinding immediately, using the
    // SuspendedOnHydration mechanism.
    markRootSuspended(workInProgressRoot, workInProgressRootRenderLanes, workInProgressDeferredLane);
  }
}
function renderDidError(error) {
  if (workInProgressRootExitStatus !== RootSuspendedWithDelay) {
    workInProgressRootExitStatus = RootErrored;
  }

  if (workInProgressRootConcurrentErrors === null) {
    workInProgressRootConcurrentErrors = [error];
  } else {
    workInProgressRootConcurrentErrors.push(error);
  }
} // Called during render to determine if anything has suspended.
// Returns false if we're not sure.

function renderHasNotSuspendedYet() {
  // If something errored or completed, we can't really be sure,
  // so those are false.
  return workInProgressRootExitStatus === RootInProgress;
} // TODO: Over time, this function and renderRootConcurrent have become more
// and more similar. Not sure it makes sense to maintain forked paths. Consider
// unifying them again.

function renderRootSync(root, lanes) {
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;
  const prevDispatcher = pushDispatcher();
  const prevCacheDispatcher = pushCacheDispatcher(); // If the root or lanes have changed, throw out the existing stack
  // and prepare a fresh one. Otherwise we'll continue where we left off.

  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    {
      if (isDevToolsPresent) {
        const memoizedUpdaters = root.memoizedUpdaters;

        if (memoizedUpdaters.size > 0) {
          restorePendingUpdaters(root, workInProgressRootRenderLanes);
          memoizedUpdaters.clear();
        } // At this point, move Fibers that scheduled the upcoming work from the Map to the Set.
        // If we bailout on this work, we'll move them back (like above).
        // It's important to move them now in case the work spawns more work at the same priority with different updaters.
        // That way we can keep the current update and future updates separate.


        movePendingFibersToMemoized(root, lanes);
      }
    }

    workInProgressTransitions = getTransitionsForLanes();
    prepareFreshStack(root, lanes);
  }

  {
    markRenderStarted(lanes);
  }

  let didSuspendInShell = false;

  outer: do {
    try {
      if (workInProgressSuspendedReason !== NotSuspended && workInProgress !== null) {
        // The work loop is suspended. During a synchronous render, we don't
        // yield to the main thread. Immediately unwind the stack. This will
        // trigger either a fallback or an error boundary.
        // TODO: For discrete and "default" updates (anything that's not
        // flushSync), we want to wait for the microtasks the flush before
        // unwinding. Will probably implement this using renderRootConcurrent,
        // or merge renderRootSync and renderRootConcurrent into the same
        // function and fork the behavior some other way.
        const unitOfWork = workInProgress;
        const thrownValue = workInProgressThrownValue;

        switch (workInProgressSuspendedReason) {
          case SuspendedOnHydration:
            {
              // Selective hydration. An update flowed into a dehydrated tree.
              // Interrupt the current render so the work loop can switch to the
              // hydration lane.
              resetWorkInProgressStack();
              workInProgressRootExitStatus = RootDidNotComplete;
              break outer;
            }

          case SuspendedOnImmediate:
          case SuspendedOnData:
            {
              if (!didSuspendInShell && getSuspenseHandler() === null) {
                didSuspendInShell = true;
              } // Intentional fallthrough

            }

          default:
            {
              // Unwind then continue with the normal work loop.
              workInProgressSuspendedReason = NotSuspended;
              workInProgressThrownValue = null;
              throwAndUnwindWorkLoop(unitOfWork, thrownValue);
              break;
            }
        }
      }

      workLoopSync();
      break;
    } catch (thrownValue) {
      handleThrow(root, thrownValue);
    }
  } while (true); // Check if something suspended in the shell. We use this to detect an
  // infinite ping loop caused by an uncached promise.
  //
  // Only increment this counter once per synchronous render attempt across the
  // whole tree. Even if there are many sibling components that suspend, this
  // counter only gets incremented once.


  if (didSuspendInShell) {
    root.shellSuspendCounter++;
  }

  resetContextDependencies();
  executionContext = prevExecutionContext;
  popDispatcher(prevDispatcher);
  popCacheDispatcher(prevCacheDispatcher);

  if (workInProgress !== null) {
    // This is a sync render, so we should have finished the whole tree.
    throw Error(formatProdErrorMessage(261));
  }

  {
    markRenderStopped();
  } // Set this to null to indicate there's no in-progress render.


  workInProgressRoot = null;
  workInProgressRootRenderLanes = NoLanes; // It's safe to process the queue now that the render phase is complete.

  finishQueueingConcurrentUpdates();
  return workInProgressRootExitStatus;
} // The work loop is an extremely hot path. Tell Closure not to inline it.

/** @noinline */


function workLoopSync() {
  // Perform work without checking if we need to yield between fiber.
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

function renderRootConcurrent(root, lanes) {
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;
  const prevDispatcher = pushDispatcher();
  const prevCacheDispatcher = pushCacheDispatcher(); // If the root or lanes have changed, throw out the existing stack
  // and prepare a fresh one. Otherwise we'll continue where we left off.

  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    {
      if (isDevToolsPresent) {
        const memoizedUpdaters = root.memoizedUpdaters;

        if (memoizedUpdaters.size > 0) {
          restorePendingUpdaters(root, workInProgressRootRenderLanes);
          memoizedUpdaters.clear();
        } // At this point, move Fibers that scheduled the upcoming work from the Map to the Set.
        // If we bailout on this work, we'll move them back (like above).
        // It's important to move them now in case the work spawns more work at the same priority with different updaters.
        // That way we can keep the current update and future updates separate.


        movePendingFibersToMemoized(root, lanes);
      }
    }

    workInProgressTransitions = getTransitionsForLanes();
    resetRenderTimer();
    prepareFreshStack(root, lanes);
  }

  {
    markRenderStarted(lanes);
  }

  outer: do {
    try {
      if (workInProgressSuspendedReason !== NotSuspended && workInProgress !== null) {
        // The work loop is suspended. We need to either unwind the stack or
        // replay the suspended component.
        const unitOfWork = workInProgress;
        const thrownValue = workInProgressThrownValue;

        resumeOrUnwind: switch (workInProgressSuspendedReason) {
          case SuspendedOnError:
            {
              // Unwind then continue with the normal work loop.
              workInProgressSuspendedReason = NotSuspended;
              workInProgressThrownValue = null;
              throwAndUnwindWorkLoop(unitOfWork, thrownValue);
              break;
            }

          case SuspendedOnData:
            {
              const thenable = thrownValue;

              if (isThenableResolved(thenable)) {
                // The data resolved. Try rendering the component again.
                workInProgressSuspendedReason = NotSuspended;
                workInProgressThrownValue = null;
                replaySuspendedUnitOfWork(unitOfWork);
                break;
              } // The work loop is suspended on data. We should wait for it to
              // resolve before continuing to render.
              // TODO: Handle the case where the promise resolves synchronously.
              // Usually this is handled when we instrument the promise to add a
              // `status` field, but if the promise already has a status, we won't
              // have added a listener until right here.


              const onResolution = () => {
                // Check if the root is still suspended on this promise.
                if (workInProgressSuspendedReason === SuspendedOnData && workInProgressRoot === root) {
                  // Mark the root as ready to continue rendering.
                  workInProgressSuspendedReason = SuspendedAndReadyToContinue;
                } // Ensure the root is scheduled. We should do this even if we're
                // currently working on a different root, so that we resume
                // rendering later.


                ensureRootIsScheduled(root);
              };

              thenable.then(onResolution, onResolution);
              break outer;
            }

          case SuspendedOnImmediate:
            {
              // If this fiber just suspended, it's possible the data is already
              // cached. Yield to the main thread to give it a chance to ping. If
              // it does, we can retry immediately without unwinding the stack.
              workInProgressSuspendedReason = SuspendedAndReadyToContinue;
              break outer;
            }

          case SuspendedOnInstance:
            {
              workInProgressSuspendedReason = SuspendedOnInstanceAndReadyToContinue;
              break outer;
            }

          case SuspendedAndReadyToContinue:
            {
              const thenable = thrownValue;

              if (isThenableResolved(thenable)) {
                // The data resolved. Try rendering the component again.
                workInProgressSuspendedReason = NotSuspended;
                workInProgressThrownValue = null;
                replaySuspendedUnitOfWork(unitOfWork);
              } else {
                // Otherwise, unwind then continue with the normal work loop.
                workInProgressSuspendedReason = NotSuspended;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(unitOfWork, thrownValue);
              }

              break;
            }

          case SuspendedOnInstanceAndReadyToContinue:
            {
              switch (workInProgress.tag) {
                case HostComponent:
                case HostHoistable:
                case HostSingleton:
                  {
                    // Before unwinding the stack, check one more time if the
                    // instance is ready. It may have loaded when React yielded to
                    // the main thread.
                    // Assigning this to a constant so Flow knows the binding won't
                    // be mutated by `preloadInstance`.
                    const hostFiber = workInProgress;
                    const type = hostFiber.type;
                    const props = hostFiber.pendingProps;
                    const isReady = preloadInstance(type, props);

                    if (isReady) {
                      // The data resolved. Resume the work loop as if nothing
                      // suspended. Unlike when a user component suspends, we don't
                      // have to replay anything because the host fiber
                      // already completed.
                      workInProgressSuspendedReason = NotSuspended;
                      workInProgressThrownValue = null;
                      const sibling = hostFiber.sibling;

                      if (sibling !== null) {
                        workInProgress = sibling;
                      } else {
                        const returnFiber = hostFiber.return;

                        if (returnFiber !== null) {
                          workInProgress = returnFiber;
                          completeUnitOfWork(returnFiber);
                        } else {
                          workInProgress = null;
                        }
                      }

                      break resumeOrUnwind;
                    }

                    break;
                  }

                default:
                  {
                    // This will fail gracefully but it's not correct, so log a
                    // warning in dev.
                    if (false) ;

                    break;
                  }
              } // Otherwise, unwind then continue with the normal work loop.


              workInProgressSuspendedReason = NotSuspended;
              workInProgressThrownValue = null;
              throwAndUnwindWorkLoop(unitOfWork, thrownValue);
              break;
            }

          case SuspendedOnDeprecatedThrowPromise:
            {
              // Suspended by an old implementation that uses the `throw promise`
              // pattern. The newer replaying behavior can cause subtle issues
              // like infinite ping loops. So we maintain the old behavior and
              // always unwind.
              workInProgressSuspendedReason = NotSuspended;
              workInProgressThrownValue = null;
              throwAndUnwindWorkLoop(unitOfWork, thrownValue);
              break;
            }

          case SuspendedOnHydration:
            {
              // Selective hydration. An update flowed into a dehydrated tree.
              // Interrupt the current render so the work loop can switch to the
              // hydration lane.
              resetWorkInProgressStack();
              workInProgressRootExitStatus = RootDidNotComplete;
              break outer;
            }

          default:
            {
              throw Error(formatProdErrorMessage(462));
            }
        }
      }

      if (false && ReactCurrentActQueue.current !== null) ; else {
        workLoopConcurrent();
      }

      break;
    } catch (thrownValue) {
      handleThrow(root, thrownValue);
    }
  } while (true);

  resetContextDependencies();
  popDispatcher(prevDispatcher);
  popCacheDispatcher(prevCacheDispatcher);
  executionContext = prevExecutionContext;


  if (workInProgress !== null) {
    // Still work remaining.
    {
      markRenderYielded();
    }

    return RootInProgress;
  } else {
    // Completed the tree.
    {
      markRenderStopped();
    } // Set this to null to indicate there's no in-progress render.


    workInProgressRoot = null;
    workInProgressRootRenderLanes = NoLanes; // It's safe to process the queue now that the render phase is complete.

    finishQueueingConcurrentUpdates(); // Return the final exit status.

    return workInProgressRootExitStatus;
  }
}
/** @noinline */


function workLoopConcurrent() {
  // Perform work until Scheduler asks us to yield
  while (workInProgress !== null && !shouldYield()) {
    // $FlowFixMe[incompatible-call] found when upgrading Flow
    performUnitOfWork(workInProgress);
  }
}

function performUnitOfWork(unitOfWork) {
  // The current, flushed, state of this fiber is the alternate. Ideally
  // nothing should rely on this, but relying on it here means that we don't
  // need an additional field on the work in progress.
  const current = unitOfWork.alternate;
  let next;

  if ((unitOfWork.mode & ProfileMode) !== NoMode) {
    startProfilerTimer(unitOfWork);
    next = beginWork(current, unitOfWork, entangledRenderLanes);
    stopProfilerTimerIfRunningAndRecordDelta(unitOfWork, true);
  } else {
    next = beginWork(current, unitOfWork, entangledRenderLanes);
  }
  unitOfWork.memoizedProps = unitOfWork.pendingProps;

  if (next === null) {
    // If this doesn't spawn new work, complete the current work.
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }

  ReactCurrentOwner.current = null;
}

function replaySuspendedUnitOfWork(unitOfWork) {
  // This is a fork of performUnitOfWork specifcally for replaying a fiber that
  // just suspended.
  //
  const current = unitOfWork.alternate;
  let next;
  const isProfilingMode = (unitOfWork.mode & ProfileMode) !== NoMode;

  if (isProfilingMode) {
    startProfilerTimer(unitOfWork);
  }

  switch (unitOfWork.tag) {
    case IndeterminateComponent:
      {
        // Because it suspended with `use`, we can assume it's a
        // function component.
        unitOfWork.tag = FunctionComponent; // Fallthrough to the next branch.
      }

    case SimpleMemoComponent:
    case FunctionComponent:
      {
        // Resolve `defaultProps`. This logic is copied from `beginWork`.
        // TODO: Consider moving this switch statement into that module. Also,
        // could maybe use this as an opportunity to say `use` doesn't work with
        // `defaultProps` :)
        const Component = unitOfWork.type;
        const unresolvedProps = unitOfWork.pendingProps;
        const resolvedProps = unitOfWork.elementType === Component ? unresolvedProps : resolveDefaultProps(Component, unresolvedProps);
        let context;

        {
          const unmaskedContext = getUnmaskedContext(unitOfWork, Component, true);
          context = getMaskedContext(unitOfWork, unmaskedContext);
        }

        next = replayFunctionComponent(current, unitOfWork, resolvedProps, Component, context, workInProgressRootRenderLanes);
        break;
      }

    case ForwardRef:
      {
        // Resolve `defaultProps`. This logic is copied from `beginWork`.
        // TODO: Consider moving this switch statement into that module. Also,
        // could maybe use this as an opportunity to say `use` doesn't work with
        // `defaultProps` :)
        const Component = unitOfWork.type.render;
        const unresolvedProps = unitOfWork.pendingProps;
        const resolvedProps = unitOfWork.elementType === Component ? unresolvedProps : resolveDefaultProps(Component, unresolvedProps);
        next = replayFunctionComponent(current, unitOfWork, resolvedProps, Component, unitOfWork.ref, workInProgressRootRenderLanes);
        break;
      }

    case HostComponent:
      {
        // Some host components are stateful (that's how we implement form
        // actions) but we don't bother to reuse the memoized state because it's
        // not worth the extra code. The main reason to reuse the previous hooks
        // is to reuse uncached promises, but we happen to know that the only
        // promises that a host component might suspend on are definitely cached
        // because they are controlled by us. So don't bother.
        resetHooksOnUnwind(unitOfWork); // Fallthrough to the next branch.
      }

    default:
      {
        // Other types besides function components are reset completely before
        // being replayed. Currently this only happens when a Usable type is
        // reconciled — the reconciler will suspend.
        //
        // We reset the fiber back to its original state; however, this isn't
        // a full "unwind" because we're going to reuse the promises that were
        // reconciled previously. So it's intentional that we don't call
        // resetSuspendedWorkLoopOnUnwind here.
        unwindInterruptedWork(current, unitOfWork);
        unitOfWork = workInProgress = resetWorkInProgress(unitOfWork, entangledRenderLanes);
        next = beginWork(current, unitOfWork, entangledRenderLanes);
        break;
      }
  }

  if (isProfilingMode) {
    stopProfilerTimerIfRunningAndRecordDelta(unitOfWork, true);
  } // The begin phase finished successfully without suspending. Return to the
  unitOfWork.memoizedProps = unitOfWork.pendingProps;

  if (next === null) {
    // If this doesn't spawn new work, complete the current work.
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }

  ReactCurrentOwner.current = null;
}

function throwAndUnwindWorkLoop(unitOfWork, thrownValue) {
  // This is a fork of performUnitOfWork specifcally for unwinding a fiber
  // that threw an exception.
  //
  // Return to the normal work loop. This will unwind the stack, and potentially
  // result in showing a fallback.
  resetSuspendedWorkLoopOnUnwind(unitOfWork);
  const returnFiber = unitOfWork.return;

  if (returnFiber === null || workInProgressRoot === null) {
    // Expected to be working on a non-root fiber. This is a fatal error
    // because there's no ancestor that can handle it; the root is
    // supposed to capture all errors that weren't caught by an error
    // boundary.
    workInProgressRootExitStatus = RootFatalErrored;
    workInProgressRootFatalError = thrownValue; // Set `workInProgress` to null. This represents advancing to the next
    // sibling, or the parent if there are no siblings. But since the root
    // has no siblings nor a parent, we set it to null. Usually this is
    // handled by `completeUnitOfWork` or `unwindWork`, but since we're
    // intentionally not calling those, we need set it here.
    // TODO: Consider calling `unwindWork` to pop the contexts.

    workInProgress = null;
    return;
  }

  try {
    // Find and mark the nearest Suspense or error boundary that can handle
    // this "exception".
    throwException(workInProgressRoot, returnFiber, unitOfWork, thrownValue, workInProgressRootRenderLanes);
  } catch (error) {
    // We had trouble processing the error. An example of this happening is
    // when accessing the `componentDidCatch` property of an error boundary
    // throws an error. A weird edge case. There's a regression test for this.
    // To prevent an infinite loop, bubble the error up to the next parent.
    workInProgress = returnFiber;
    throw error;
  }

  if (unitOfWork.flags & Incomplete) {
    // Unwind the stack until we reach the nearest boundary.
    unwindUnitOfWork(unitOfWork);
  } else {
    // Although the fiber suspended, we're intentionally going to commit it in
    // an inconsistent state. We can do this safely in cases where we know the
    // inconsistent tree will be hidden.
    //
    // This currently only applies to Legacy Suspense implementation, but we may
    // port a version of this to concurrent roots, too, when performing a
    // synchronous render. Because that will allow us to mutate the tree as we
    // go instead of buffering mutations until the end. Though it's unclear if
    // this particular path is how that would be implemented.
    completeUnitOfWork(unitOfWork);
  }
}

function completeUnitOfWork(unitOfWork) {
  // Attempt to complete the current unit of work, then move to the next
  // sibling. If there are no more siblings, return to the parent fiber.
  let completedWork = unitOfWork;

  do {
    // nothing should rely on this, but relying on it here means that we don't
    // need an additional field on the work in progress.


    const current = completedWork.alternate;
    const returnFiber = completedWork.return;
    let next;

    if ((completedWork.mode & ProfileMode) === NoMode) {
      next = completeWork(current, completedWork, entangledRenderLanes);
    } else {
      startProfilerTimer(completedWork);
      next = completeWork(current, completedWork, entangledRenderLanes); // Update render duration assuming we didn't error.

      stopProfilerTimerIfRunningAndRecordDelta(completedWork, false);
    }

    if (next !== null) {
      // Completing this fiber spawned new work. Work on that next.
      workInProgress = next;
      return;
    }

    const siblingFiber = completedWork.sibling;

    if (siblingFiber !== null) {
      // If there is more work to do in this returnFiber, do that next.
      workInProgress = siblingFiber;
      return;
    } // Otherwise, return to the parent
    // $FlowFixMe[incompatible-type] we bail out when we get a null


    completedWork = returnFiber; // Update the next thing we're working on in case something throws.

    workInProgress = completedWork;
  } while (completedWork !== null); // We've reached the root.


  if (workInProgressRootExitStatus === RootInProgress) {
    workInProgressRootExitStatus = RootCompleted;
  }
}

function unwindUnitOfWork(unitOfWork) {
  let incompleteWork = unitOfWork;

  do {
    // The current, flushed, state of this fiber is the alternate. Ideally
    // nothing should rely on this, but relying on it here means that we don't
    // need an additional field on the work in progress.
    const current = incompleteWork.alternate; // This fiber did not complete because something threw. Pop values off
    // the stack without entering the complete phase. If this is a boundary,
    // capture values if possible.

    const next = unwindWork(current, incompleteWork); // Because this fiber did not complete, don't reset its lanes.

    if (next !== null) {
      // Found a boundary that can handle this exception. Re-renter the
      // begin phase. This branch will return us to the normal work loop.
      //
      // Since we're restarting, remove anything that is not a host effect
      // from the effect tag.
      next.flags &= HostEffectMask;
      workInProgress = next;
      return;
    } // Keep unwinding until we reach either a boundary or the root.


    if ((incompleteWork.mode & ProfileMode) !== NoMode) {
      // Record the render duration for the fiber that errored.
      stopProfilerTimerIfRunningAndRecordDelta(incompleteWork, false); // Include the time spent working on failed children before continuing.

      let actualDuration = incompleteWork.actualDuration;
      let child = incompleteWork.child;

      while (child !== null) {
        // $FlowFixMe[unsafe-addition] addition with possible null/undefined value
        actualDuration += child.actualDuration;
        child = child.sibling;
      }

      incompleteWork.actualDuration = actualDuration;
    } // TODO: Once we stop prerendering siblings, instead of resetting the parent
    // of the node being unwound, we should be able to reset node itself as we
    // unwind the stack. Saves an additional null check.


    const returnFiber = incompleteWork.return;

    if (returnFiber !== null) {
      // Mark the parent fiber as incomplete and clear its subtree flags.
      // TODO: Once we stop prerendering siblings, we may be able to get rid of
      // the Incomplete flag because unwinding to the nearest boundary will
      // happen synchronously.
      returnFiber.flags |= Incomplete;
      returnFiber.subtreeFlags = NoFlags$1;
      returnFiber.deletions = null;
    } // NOTE: If we re-enable sibling prerendering in some cases, here we
    // would switch to the normal completion path: check if a sibling
    // exists, and if so, begin work on it.
    // Otherwise, return to the parent
    // $FlowFixMe[incompatible-type] we bail out when we get a null


    incompleteWork = returnFiber; // Update the next thing we're working on in case something throws.

    workInProgress = incompleteWork;
  } while (incompleteWork !== null); // We've unwound all the way to the root.


  workInProgressRootExitStatus = RootDidNotComplete;
  workInProgress = null;
}

function commitRoot(root, recoverableErrors, transitions, spawnedLane) {
  // TODO: This no longer makes any sense. We already wrap the mutation and
  // layout phases. Should be able to remove.
  const previousUpdateLanePriority = getCurrentUpdatePriority();
  const prevTransition = ReactCurrentBatchConfig$1.transition;

  try {
    ReactCurrentBatchConfig$1.transition = null;
    setCurrentUpdatePriority(DiscreteEventPriority);
    commitRootImpl(root, recoverableErrors, transitions, previousUpdateLanePriority, spawnedLane);
  } finally {
    ReactCurrentBatchConfig$1.transition = prevTransition;
    setCurrentUpdatePriority(previousUpdateLanePriority);
  }

  return null;
}

function commitRootImpl(root, recoverableErrors, transitions, renderPriorityLevel, spawnedLane) {
  do {
    // `flushPassiveEffects` will call `flushSyncUpdateQueue` at the end, which
    // means `flushPassiveEffects` will sometimes result in additional
    // passive effects. So we need to keep flushing in a loop until there are
    // no more pending effects.
    // TODO: Might be better if `flushPassiveEffects` did not automatically
    // flush synchronous work at the end, to avoid factoring hazards like this.
    flushPassiveEffects();
  } while (rootWithPendingPassiveEffects !== null);

  if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
    throw Error(formatProdErrorMessage(327));
  }

  const finishedWork = root.finishedWork;
  const lanes = root.finishedLanes;

  {
    markCommitStarted(lanes);
  }

  if (finishedWork === null) {

    {
      markCommitStopped();
    }

    return null;
  }

  root.finishedWork = null;
  root.finishedLanes = NoLanes;

  if (finishedWork === root.current) {
    throw Error(formatProdErrorMessage(177));
  } // commitRoot never returns a continuation; it always finishes synchronously.
  // So we can clear these now to allow a new callback to be scheduled.


  root.callbackNode = null;
  root.callbackPriority = NoLane;
  root.cancelPendingCommit = null; // Check which lanes no longer have any work scheduled on them, and mark
  // those as finished.

  let remainingLanes = mergeLanes(finishedWork.lanes, finishedWork.childLanes); // Make sure to account for lanes that were updated by a concurrent event
  // during the render phase; don't mark them as finished.

  const concurrentlyUpdatedLanes = getConcurrentlyUpdatedLanes();
  remainingLanes = mergeLanes(remainingLanes, concurrentlyUpdatedLanes);
  markRootFinished(root, remainingLanes, spawnedLane);

  if (root === workInProgressRoot) {
    // We can reset these now that they are finished.
    workInProgressRoot = null;
    workInProgress = null;
    workInProgressRootRenderLanes = NoLanes;
  } // If there are pending passive effects, schedule a callback to process them.
  // Do this as early as possible, so it is queued before anything else that
  // might get scheduled in the commit phase. (See #16714.)
  // TODO: Delete all other places that schedule the passive effect callback
  // They're redundant.


  if ((finishedWork.subtreeFlags & PassiveMask) !== NoFlags$1 || (finishedWork.flags & PassiveMask) !== NoFlags$1) {
    if (!rootDoesHavePassiveEffects) {
      rootDoesHavePassiveEffects = true;
      pendingPassiveEffectsRemainingLanes = remainingLanes; // workInProgressTransitions might be overwritten, so we want
      // to store it in pendingPassiveTransitions until they get processed
      // We need to pass this through as an argument to commitRoot
      // because workInProgressTransitions might have changed between
      // the previous render and commit if we throttle the commit
      // with setTimeout

      pendingPassiveTransitions = transitions;
      scheduleCallback(NormalPriority$1, () => {
        flushPassiveEffects(); // This render triggered passive effects: release the root cache pool
        // *after* passive effects fire to avoid freeing a cache pool that may
        // be referenced by a node in the tree (HostRoot, Cache boundary etc)

        return null;
      });
    }
  } // Check if there are any effects in the whole tree.
  // TODO: This is left over from the effect list implementation, where we had
  // to check for the existence of `firstEffect` to satisfy Flow. I think the
  // only other reason this optimization exists is because it affects profiling.
  // Reconsider whether this is necessary.


  const subtreeHasEffects = (finishedWork.subtreeFlags & (BeforeMutationMask | MutationMask | LayoutMask | PassiveMask)) !== NoFlags$1;
  const rootHasEffect = (finishedWork.flags & (BeforeMutationMask | MutationMask | LayoutMask | PassiveMask)) !== NoFlags$1;

  if (subtreeHasEffects || rootHasEffect) {
    const prevTransition = ReactCurrentBatchConfig$1.transition;
    ReactCurrentBatchConfig$1.transition = null;
    const previousPriority = getCurrentUpdatePriority();
    setCurrentUpdatePriority(DiscreteEventPriority);
    const prevExecutionContext = executionContext;
    executionContext |= CommitContext; // Reset this to null before calling lifecycles

    ReactCurrentOwner.current = null; // The commit phase is broken into several sub-phases. We do a separate pass
    // of the effect list for each phase: all mutation effects come before all
    // layout effects, and so on.
    // The first phase a "before mutation" phase. We use this phase to read the
    // state of the host tree right before we mutate it. This is where
    // getSnapshotBeforeUpdate is called.

    commitBeforeMutationEffects(root, finishedWork);

    {
      // Mark the current commit time to be shared by all Profilers in this
      // batch. This enables them to be grouped later.
      recordCommitTime();
    }


    commitMutationEffects(root, finishedWork, lanes);

    resetAfterCommit(); // The work-in-progress tree is now the current tree. This must come after
    // the mutation phase, so that the previous tree is still current during
    // componentWillUnmount, but before the layout phase, so that the finished
    // work is current during componentDidMount/Update.

    root.current = finishedWork; // The next phase is the layout phase, where we call effects that read

    {
      markLayoutEffectsStarted(lanes);
    }

    commitLayoutEffects(finishedWork, root, lanes);

    {
      markLayoutEffectsStopped();
    }
    // opportunity to paint.


    requestPaint();
    executionContext = prevExecutionContext; // Reset the priority to the previous non-sync value.

    setCurrentUpdatePriority(previousPriority);
    ReactCurrentBatchConfig$1.transition = prevTransition;
  } else {
    // No effects.
    root.current = finishedWork; // Measure these anyway so the flamegraph explicitly shows that there were
    // no effects.
    // TODO: Maybe there's a better way to report this.

    {
      recordCommitTime();
    }
  }

  if (rootDoesHavePassiveEffects) {
    // This commit has passive effects. Stash a reference to them. But don't
    // schedule a callback until after flushing layout work.
    rootDoesHavePassiveEffects = false;
    rootWithPendingPassiveEffects = root;
    pendingPassiveEffectsLanes = lanes;
  } else {
    // There were no passive effects, so we can immediately release the cache
    // pool for this render.
    releaseRootPooledCache(root, remainingLanes);
  } // Read this again, since an effect might have updated it


  remainingLanes = root.pendingLanes; // Check if there's remaining work on this root
  // TODO: This is part of the `componentDidCatch` implementation. Its purpose
  // is to detect whether something might have called setState inside
  // `componentDidCatch`. The mechanism is known to be flawed because `setState`
  // inside `componentDidCatch` is itself flawed — that's why we recommend
  // `getDerivedStateFromError` instead. However, it could be improved by
  // checking if remainingLanes includes Sync work, instead of whether there's
  // any work remaining at all (which would also include stuff like Suspense
  // retries or transitions). It's been like this for a while, though, so fixing
  // it probably isn't that urgent.

  if (remainingLanes === NoLanes) {
    // If there's no remaining work, we can clear the set of already failed
    // error boundaries.
    legacyErrorBoundariesThatAlreadyFailed = null;
  }

  onCommitRoot(finishedWork.stateNode, renderPriorityLevel);

  {
    if (isDevToolsPresent) {
      root.memoizedUpdaters.clear();
    }
  }
  // additional work on this root is scheduled.


  ensureRootIsScheduled(root);

  if (recoverableErrors !== null) {
    // There were errors during this render, but recovered from them without
    // needing to surface it to the UI. We log them here.
    const onRecoverableError = root.onRecoverableError;

    for (let i = 0; i < recoverableErrors.length; i++) {
      const recoverableError = recoverableErrors[i];
      const errorInfo = makeErrorInfo(recoverableError.digest, recoverableError.stack);
      onRecoverableError(recoverableError.value, errorInfo);
    }
  }

  if (hasUncaughtError) {
    hasUncaughtError = false;
    const error = firstUncaughtError;
    firstUncaughtError = null;
    throw error;
  } // If the passive effects are the result of a discrete render, flush them
  // synchronously at the end of the current task so that the result is
  // immediately observable. Otherwise, we assume that they are not
  // order-dependent and do not need to be observed by external systems, so we
  // can wait until after paint.
  // TODO: We can optimize this by not scheduling the callback earlier. Since we
  // currently schedule the callback in multiple places, will wait until those
  // are consolidated.


  if (includesSyncLane(pendingPassiveEffectsLanes) && root.tag !== LegacyRoot) {
    flushPassiveEffects();
  } // Read this again, since a passive effect might have updated it


  remainingLanes = root.pendingLanes; // Check if this render scheduled a cascading synchronous update. This is a
  // heurstic to detect infinite update loops. We are intentionally excluding
  // hydration lanes in this check, because render triggered by selective
  // hydration is conceptually not an update.

  if ( // Was the finished render the result of an update (not hydration)?
  includesSomeLane(lanes, UpdateLanes) && // Did it schedule a sync update?
  includesSomeLane(remainingLanes, SyncUpdateLanes)) {
    {
      markNestedUpdateScheduled();
    } // Count the number of times the root synchronously re-renders without
    // finishing. If there are too many, it indicates an infinite update loop.


    if (root === rootWithNestedUpdates) {
      nestedUpdateCount++;
    } else {
      nestedUpdateCount = 0;
      rootWithNestedUpdates = root;
    }
  } else {
    nestedUpdateCount = 0;
  } // If layout work was scheduled, flush it now.


  flushSyncWorkOnAllRoots();

  {
    markCommitStopped();
  }

  return null;
}

function makeErrorInfo(digest, componentStack) {
  {
    return {
      digest,
      componentStack
    };
  }
}

function releaseRootPooledCache(root, remainingLanes) {
  {
    const pooledCacheLanes = root.pooledCacheLanes &= remainingLanes;

    if (pooledCacheLanes === NoLanes) {
      // None of the remaining work relies on the cache pool. Clear it so
      // subsequent requests get a new cache
      const pooledCache = root.pooledCache;

      if (pooledCache != null) {
        root.pooledCache = null;
        releaseCache(pooledCache);
      }
    }
  }
}

function flushPassiveEffects() {
  // Returns whether passive effects were flushed.
  // TODO: Combine this check with the one in flushPassiveEFfectsImpl. We should
  // probably just combine the two functions. I believe they were only separate
  // in the first place because we used to wrap it with
  // `Scheduler.runWithPriority`, which accepts a function. But now we track the
  // priority within React itself, so we can mutate the variable directly.
  if (rootWithPendingPassiveEffects !== null) {
    // Cache the root since rootWithPendingPassiveEffects is cleared in
    // flushPassiveEffectsImpl
    const root = rootWithPendingPassiveEffects; // Cache and clear the remaining lanes flag; it must be reset since this
    // method can be called from various places, not always from commitRoot
    // where the remaining lanes are known

    const remainingLanes = pendingPassiveEffectsRemainingLanes;
    pendingPassiveEffectsRemainingLanes = NoLanes;
    const renderPriority = lanesToEventPriority(pendingPassiveEffectsLanes);
    const priority = lowerEventPriority(DefaultEventPriority, renderPriority);
    const prevTransition = ReactCurrentBatchConfig$1.transition;
    const previousPriority = getCurrentUpdatePriority();

    try {
      ReactCurrentBatchConfig$1.transition = null;
      setCurrentUpdatePriority(priority);
      return flushPassiveEffectsImpl();
    } finally {
      setCurrentUpdatePriority(previousPriority);
      ReactCurrentBatchConfig$1.transition = prevTransition; // Once passive effects have run for the tree - giving components a
      // chance to retain cache instances they use - release the pooled
      // cache at the root (if there is one)

      releaseRootPooledCache(root, remainingLanes);
    }
  }

  return false;
}
function enqueuePendingPassiveProfilerEffect(fiber) {
  {
    pendingPassiveProfilerEffects.push(fiber);

    if (!rootDoesHavePassiveEffects) {
      rootDoesHavePassiveEffects = true;
      scheduleCallback(NormalPriority$1, () => {
        flushPassiveEffects();
        return null;
      });
    }
  }
}

function flushPassiveEffectsImpl() {
  if (rootWithPendingPassiveEffects === null) {
    return false;
  } // Cache and clear the transitions flag


  const transitions = pendingPassiveTransitions;
  pendingPassiveTransitions = null;
  const root = rootWithPendingPassiveEffects;
  const lanes = pendingPassiveEffectsLanes;
  rootWithPendingPassiveEffects = null; // TODO: This is sometimes out of sync with rootWithPendingPassiveEffects.
  // Figure out why and fix it. It's not causing any known issues (probably
  // because it's only used for profiling), but it's a refactor hazard.

  pendingPassiveEffectsLanes = NoLanes;

  if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
    throw Error(formatProdErrorMessage(331));
  }

  {
    markPassiveEffectsStarted(lanes);
  }

  const prevExecutionContext = executionContext;
  executionContext |= CommitContext;
  commitPassiveUnmountEffects(root.current);
  commitPassiveMountEffects(root, root.current, lanes, transitions); // TODO: Move to commitPassiveMountEffects

  {
    const profilerEffects = pendingPassiveProfilerEffects;
    pendingPassiveProfilerEffects = [];

    for (let i = 0; i < profilerEffects.length; i++) {
      const fiber = profilerEffects[i];
      commitPassiveEffectDurations(root, fiber);
    }
  }

  {
    markPassiveEffectsStopped();
  }

  executionContext = prevExecutionContext;
  flushSyncWorkOnAllRoots();


  onPostCommitRoot(root);

  {
    const stateNode = root.current.stateNode;
    stateNode.effectDuration = 0;
    stateNode.passiveEffectDuration = 0;
  }

  return true;
}

function isAlreadyFailedLegacyErrorBoundary(instance) {
  return legacyErrorBoundariesThatAlreadyFailed !== null && legacyErrorBoundariesThatAlreadyFailed.has(instance);
}
function markLegacyErrorBoundaryAsFailed(instance) {
  if (legacyErrorBoundariesThatAlreadyFailed === null) {
    legacyErrorBoundariesThatAlreadyFailed = new Set([instance]);
  } else {
    legacyErrorBoundariesThatAlreadyFailed.add(instance);
  }
}

function prepareToThrowUncaughtError(error) {
  if (!hasUncaughtError) {
    hasUncaughtError = true;
    firstUncaughtError = error;
  }
}

const onUncaughtError = prepareToThrowUncaughtError;

function captureCommitPhaseErrorOnRoot(rootFiber, sourceFiber, error) {
  const errorInfo = createCapturedValueAtFiber(error, sourceFiber);
  const update = createRootErrorUpdate(rootFiber, errorInfo, SyncLane);
  const root = enqueueUpdate(rootFiber, update, SyncLane);

  if (root !== null) {
    markRootUpdated(root, SyncLane);
    ensureRootIsScheduled(root);
  }
}

function captureCommitPhaseError(sourceFiber, nearestMountedAncestor, error) {

  if (sourceFiber.tag === HostRoot) {
    // Error was thrown at the root. There is no parent, so the root
    // itself should capture it.
    captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
    return;
  }

  let fiber = nearestMountedAncestor;

  while (fiber !== null) {
    if (fiber.tag === HostRoot) {
      captureCommitPhaseErrorOnRoot(fiber, sourceFiber, error);
      return;
    } else if (fiber.tag === ClassComponent) {
      const ctor = fiber.type;
      const instance = fiber.stateNode;

      if (typeof ctor.getDerivedStateFromError === 'function' || typeof instance.componentDidCatch === 'function' && !isAlreadyFailedLegacyErrorBoundary(instance)) {
        const errorInfo = createCapturedValueAtFiber(error, sourceFiber);
        const update = createClassErrorUpdate(fiber, errorInfo, SyncLane);
        const root = enqueueUpdate(fiber, update, SyncLane);

        if (root !== null) {
          markRootUpdated(root, SyncLane);
          ensureRootIsScheduled(root);
        }

        return;
      }
    }

    fiber = fiber.return;
  }
}
function attachPingListener(root, wakeable, lanes) {
  // Attach a ping listener
  //
  // The data might resolve before we have a chance to commit the fallback. Or,
  // in the case of a refresh, we'll never commit a fallback. So we need to
  // attach a listener now. When it resolves ("pings"), we can decide whether to
  // try rendering the tree again.
  //
  // Only attach a listener if one does not already exist for the lanes
  // we're currently rendering (which acts like a "thread ID" here).
  //
  // We only need to do this in concurrent mode. Legacy Suspense always
  // commits fallbacks synchronously, so there are no pings.
  let pingCache = root.pingCache;
  let threadIDs;

  if (pingCache === null) {
    pingCache = root.pingCache = new PossiblyWeakMap();
    threadIDs = new Set();
    pingCache.set(wakeable, threadIDs);
  } else {
    threadIDs = pingCache.get(wakeable);

    if (threadIDs === undefined) {
      threadIDs = new Set();
      pingCache.set(wakeable, threadIDs);
    }
  }

  if (!threadIDs.has(lanes)) {
    workInProgressRootDidAttachPingListener = true; // Memoize using the thread ID to prevent redundant listeners.

    threadIDs.add(lanes);
    const ping = pingSuspendedRoot.bind(null, root, wakeable, lanes);

    {
      if (isDevToolsPresent) {
        // If we have pending work still, restore the original updaters
        restorePendingUpdaters(root, lanes);
      }
    }

    wakeable.then(ping, ping);
  }
}

function pingSuspendedRoot(root, wakeable, pingedLanes) {
  const pingCache = root.pingCache;

  if (pingCache !== null) {
    // The wakeable resolved, so we no longer need to memoize, because it will
    // never be thrown again.
    pingCache.delete(wakeable);
  }

  markRootPinged(root, pingedLanes);

  if (workInProgressRoot === root && isSubsetOfLanes(workInProgressRootRenderLanes, pingedLanes)) {
    // Received a ping at the same priority level at which we're currently
    // rendering. We might want to restart this render. This should mirror
    // the logic of whether or not a root suspends once it completes.
    // TODO: If we're rendering sync either due to Sync, Batched or expired,
    // we should probably never restart.
    // If we're suspended with delay, or if it's a retry, we'll always suspend
    // so we can always restart.
    if (workInProgressRootExitStatus === RootSuspendedWithDelay || workInProgressRootExitStatus === RootSuspended && includesOnlyRetries(workInProgressRootRenderLanes) && now$1() - globalMostRecentFallbackTime < FALLBACK_THROTTLE_MS) {
      // Force a restart from the root by unwinding the stack. Unless this is
      // being called from the render phase, because that would cause a crash.
      if ((executionContext & RenderContext) === NoContext) {
        prepareFreshStack(root, NoLanes);
      }
    } else {
      // Even though we can't restart right now, we might get an
      // opportunity later. So we mark this render as having a ping.
      workInProgressRootPingedLanes = mergeLanes(workInProgressRootPingedLanes, pingedLanes);
    }
  }

  ensureRootIsScheduled(root);
}

function retryTimedOutBoundary(boundaryFiber, retryLane) {
  // The boundary fiber (a Suspense component or SuspenseList component)
  // previously was rendered in its fallback state. One of the promises that
  // suspended it has resolved, which means at least part of the tree was
  // likely unblocked. Try rendering again, at a new lanes.
  if (retryLane === NoLane) {
    // TODO: Assign this to `suspenseState.retryLane`? to avoid
    // unnecessary entanglement?
    retryLane = requestRetryLane(boundaryFiber);
  } // TODO: Special case idle priority?


  const root = enqueueConcurrentRenderForLane(boundaryFiber, retryLane);

  if (root !== null) {
    markRootUpdated(root, retryLane);
    ensureRootIsScheduled(root);
  }
}

function retryDehydratedSuspenseBoundary(boundaryFiber) {
  const suspenseState = boundaryFiber.memoizedState;
  let retryLane = NoLane;

  if (suspenseState !== null) {
    retryLane = suspenseState.retryLane;
  }

  retryTimedOutBoundary(boundaryFiber, retryLane);
}
function resolveRetryWakeable(boundaryFiber, wakeable) {
  let retryLane = NoLane; // Default

  let retryCache;

  switch (boundaryFiber.tag) {
    case SuspenseComponent:
      retryCache = boundaryFiber.stateNode;
      const suspenseState = boundaryFiber.memoizedState;

      if (suspenseState !== null) {
        retryLane = suspenseState.retryLane;
      }

      break;

    case SuspenseListComponent:
      retryCache = boundaryFiber.stateNode;
      break;

    case OffscreenComponent:
      {
        const instance = boundaryFiber.stateNode;
        retryCache = instance._retryCache;
        break;
      }

    default:
      throw Error(formatProdErrorMessage(314));
  }

  if (retryCache !== null) {
    // The wakeable resolved, so we no longer need to memoize, because it will
    // never be thrown again.
    retryCache.delete(wakeable);
  }

  retryTimedOutBoundary(boundaryFiber, retryLane);
}
function throwIfInfiniteUpdateLoopDetected() {
  if (nestedUpdateCount > NESTED_UPDATE_LIMIT) {
    nestedUpdateCount = 0;
    rootWithNestedUpdates = null;
    throw Error(formatProdErrorMessage(185));
  }
}
let beginWork;

{
  beginWork = beginWork$1;
}

function restorePendingUpdaters(root, lanes) {
  {
    if (isDevToolsPresent) {
      const memoizedUpdaters = root.memoizedUpdaters;
      memoizedUpdaters.forEach(schedulingFiber => {
        addFiberToLanesMap(root, schedulingFiber, lanes);
      }); // This function intentionally does not clear memoized updaters.
      // Those may still be relevant to the current commit
      // and a future one (e.g. Suspense).
    }
  }
}

function scheduleCallback(priorityLevel, callback) {
  {
    // In production, always call Scheduler. This function will be stripped out.
    return scheduleCallback$3(priorityLevel, callback);
  }
}

function FiberNode(tag, pendingProps, key, mode) {
  // Instance
  this.tag = tag;
  this.key = key;
  this.elementType = null;
  this.type = null;
  this.stateNode = null; // Fiber

  this.return = null;
  this.child = null;
  this.sibling = null;
  this.index = 0;
  this.ref = null;
  this.refCleanup = null;
  this.pendingProps = pendingProps;
  this.memoizedProps = null;
  this.updateQueue = null;
  this.memoizedState = null;
  this.dependencies = null;
  this.mode = mode; // Effects

  this.flags = NoFlags$1;
  this.subtreeFlags = NoFlags$1;
  this.deletions = null;
  this.lanes = NoLanes;
  this.childLanes = NoLanes;
  this.alternate = null;

  {
    // Note: The following is done to avoid a v8 performance cliff.
    //
    // Initializing the fields below to smis and later updating them with
    // double values will cause Fibers to end up having separate shapes.
    // This behavior/bug has something to do with Object.preventExtension().
    // Fortunately this only impacts DEV builds.
    // Unfortunately it makes React unusably slow for some applications.
    // To work around this, initialize the fields below with doubles.
    //
    // Learn more about this here:
    // https://github.com/facebook/react/issues/14365
    // https://bugs.chromium.org/p/v8/issues/detail?id=8538
    this.actualDuration = Number.NaN;
    this.actualStartTime = Number.NaN;
    this.selfBaseDuration = Number.NaN;
    this.treeBaseDuration = Number.NaN; // It's okay to replace the initial doubles with smis after initialization.
    // This won't trigger the performance cliff mentioned above,
    // and it simplifies other profiler code (including DevTools).

    this.actualDuration = 0;
    this.actualStartTime = -1;
    this.selfBaseDuration = 0;
    this.treeBaseDuration = 0;
  }
} // This is a constructor function, rather than a POJO constructor, still
// please ensure we do the following:
// 1) Nobody should add any instance methods on this. Instance methods can be
//    more difficult to predict when they get optimized and they are almost
//    never inlined properly in static compilers.
// 2) Nobody should rely on `instanceof Fiber` for type testing. We should
//    always know when it is a fiber.
// 3) We might want to experiment with using numeric keys since they are easier
//    to optimize in a non-JIT environment.
// 4) We can easily go from a constructor to a createFiber object literal if that
//    is faster.
// 5) It should be easy to port this to a C struct and keep a C implementation
//    compatible.


function createFiber(tag, pendingProps, key, mode) {
  // $FlowFixMe[invalid-constructor]: the shapes are exact here but Flow doesn't like constructors
  return new FiberNode(tag, pendingProps, key, mode);
}

function shouldConstruct(Component) {
  const prototype = Component.prototype;
  return !!(prototype && prototype.isReactComponent);
}

function isSimpleFunctionComponent(type) {
  return typeof type === 'function' && !shouldConstruct(type) && type.defaultProps === undefined;
}
function resolveLazyComponentTag(Component) {
  if (typeof Component === 'function') {
    return shouldConstruct(Component) ? ClassComponent : FunctionComponent;
  } else if (Component !== undefined && Component !== null) {
    const $$typeof = Component.$$typeof;

    if ($$typeof === REACT_FORWARD_REF_TYPE) {
      return ForwardRef;
    }

    if ($$typeof === REACT_MEMO_TYPE) {
      return MemoComponent;
    }
  }

  return IndeterminateComponent;
} // This is used to create an alternate fiber to do work on.

function createWorkInProgress(current, pendingProps) {
  let workInProgress = current.alternate;

  if (workInProgress === null) {
    // We use a double buffering pooling technique because we know that we'll
    // only ever need at most two versions of a tree. We pool the "other" unused
    // node that we're free to reuse. This is lazily created to avoid allocating
    // extra objects for things that are never updated. It also allow us to
    // reclaim the extra memory if needed.
    workInProgress = createFiber(current.tag, pendingProps, current.key, current.mode);
    workInProgress.elementType = current.elementType;
    workInProgress.type = current.type;
    workInProgress.stateNode = current.stateNode;

    workInProgress.alternate = current;
    current.alternate = workInProgress;
  } else {
    workInProgress.pendingProps = pendingProps; // Needed because Blocks store data on type.

    workInProgress.type = current.type; // We already have an alternate.
    // Reset the effect tag.

    workInProgress.flags = NoFlags$1; // The effects are no longer valid.

    workInProgress.subtreeFlags = NoFlags$1;
    workInProgress.deletions = null;

    {
      // We intentionally reset, rather than copy, actualDuration & actualStartTime.
      // This prevents time from endlessly accumulating in new commits.
      // This has the downside of resetting values for different priority renders,
      // But works for yielding (the common case) and should support resuming.
      workInProgress.actualDuration = 0;
      workInProgress.actualStartTime = -1;
    }
  } // Reset all effects except static ones.
  // Static effects are not specific to a render.


  workInProgress.flags = current.flags & StaticMask;
  workInProgress.childLanes = current.childLanes;
  workInProgress.lanes = current.lanes;
  workInProgress.child = current.child;
  workInProgress.memoizedProps = current.memoizedProps;
  workInProgress.memoizedState = current.memoizedState;
  workInProgress.updateQueue = current.updateQueue; // Clone the dependencies object. This is mutated during the render phase, so
  // it cannot be shared with the current fiber.

  const currentDependencies = current.dependencies;
  workInProgress.dependencies = currentDependencies === null ? null : {
    lanes: currentDependencies.lanes,
    firstContext: currentDependencies.firstContext
  }; // These will be overridden during the parent's reconciliation

  workInProgress.sibling = current.sibling;
  workInProgress.index = current.index;
  workInProgress.ref = current.ref;
  workInProgress.refCleanup = current.refCleanup;

  {
    workInProgress.selfBaseDuration = current.selfBaseDuration;
    workInProgress.treeBaseDuration = current.treeBaseDuration;
  }

  return workInProgress;
} // Used to reuse a Fiber for a second pass.

function resetWorkInProgress(workInProgress, renderLanes) {
  // This resets the Fiber to what createFiber or createWorkInProgress would
  // have set the values to before during the first pass. Ideally this wouldn't
  // be necessary but unfortunately many code paths reads from the workInProgress
  // when they should be reading from current and writing to workInProgress.
  // We assume pendingProps, index, key, ref, return are still untouched to
  // avoid doing another reconciliation.
  // Reset the effect flags but keep any Placement tags, since that's something
  // that child fiber is setting, not the reconciliation.
  workInProgress.flags &= StaticMask | Placement; // The effects are no longer valid.

  const current = workInProgress.alternate;

  if (current === null) {
    // Reset to createFiber's initial values.
    workInProgress.childLanes = NoLanes;
    workInProgress.lanes = renderLanes;
    workInProgress.child = null;
    workInProgress.subtreeFlags = NoFlags$1;
    workInProgress.memoizedProps = null;
    workInProgress.memoizedState = null;
    workInProgress.updateQueue = null;
    workInProgress.dependencies = null;
    workInProgress.stateNode = null;

    {
      // Note: We don't reset the actualTime counts. It's useful to accumulate
      // actual time across multiple render passes.
      workInProgress.selfBaseDuration = 0;
      workInProgress.treeBaseDuration = 0;
    }
  } else {
    // Reset to the cloned values that createWorkInProgress would've.
    workInProgress.childLanes = current.childLanes;
    workInProgress.lanes = current.lanes;
    workInProgress.child = current.child;
    workInProgress.subtreeFlags = NoFlags$1;
    workInProgress.deletions = null;
    workInProgress.memoizedProps = current.memoizedProps;
    workInProgress.memoizedState = current.memoizedState;
    workInProgress.updateQueue = current.updateQueue; // Needed because Blocks store data on type.

    workInProgress.type = current.type; // Clone the dependencies object. This is mutated during the render phase, so
    // it cannot be shared with the current fiber.

    const currentDependencies = current.dependencies;
    workInProgress.dependencies = currentDependencies === null ? null : {
      lanes: currentDependencies.lanes,
      firstContext: currentDependencies.firstContext
    };

    {
      // Note: We don't reset the actualTime counts. It's useful to accumulate
      // actual time across multiple render passes.
      workInProgress.selfBaseDuration = current.selfBaseDuration;
      workInProgress.treeBaseDuration = current.treeBaseDuration;
    }
  }

  return workInProgress;
}
function createHostRootFiber(tag, isStrictMode, concurrentUpdatesByDefaultOverride) {
  let mode;

  if (tag === ConcurrentRoot) {
    mode = ConcurrentMode;

    if (isStrictMode === true || createRootStrictEffectsByDefault) {
      mode |= StrictLegacyMode | StrictEffectsMode;
    }
  } else {
    mode = NoMode;
  }

  if (isDevToolsPresent) {
    // Always collect profile timings when DevTools are present.
    // This enables DevTools to start capturing timing at any point–
    // Without some nodes in the tree having empty base times.
    mode |= ProfileMode;
  }

  return createFiber(HostRoot, null, null, mode);
}
function createFiberFromTypeAndProps(type, // React$ElementType
key, pendingProps, source, owner, mode, lanes) {
  let fiberTag = IndeterminateComponent; // The resolved type is set if we know what the final type will be. I.e. it's not lazy.

  let resolvedType = type;

  if (typeof type === 'function') {
    if (shouldConstruct(type)) {
      fiberTag = ClassComponent;
    }
  } else if (typeof type === 'string') {
    {
      const hostContext = getHostContext();
      fiberTag = isHostHoistableType(type, pendingProps, hostContext) ? HostHoistable : isHostSingletonType(type) ? HostSingleton : HostComponent;
    }
  } else {
    getTag: switch (type) {
      case REACT_FRAGMENT_TYPE:
        return createFiberFromFragment(pendingProps.children, mode, lanes, key);

      case REACT_STRICT_MODE_TYPE:
        fiberTag = Mode;
        mode |= StrictLegacyMode;

        if ((mode & ConcurrentMode) !== NoMode) {
          // Strict effects should never run on legacy roots
          mode |= StrictEffectsMode;
        }

        break;

      case REACT_PROFILER_TYPE:
        return createFiberFromProfiler(pendingProps, mode, lanes, key);

      case REACT_SUSPENSE_TYPE:
        return createFiberFromSuspense(pendingProps, mode, lanes, key);

      case REACT_SUSPENSE_LIST_TYPE:
        return createFiberFromSuspenseList(pendingProps, mode, lanes, key);

      case REACT_OFFSCREEN_TYPE:
        return createFiberFromOffscreen(pendingProps, mode, lanes, key);

      case REACT_LEGACY_HIDDEN_TYPE:

      // Fall through

      case REACT_SCOPE_TYPE:

      // Fall through

      case REACT_CACHE_TYPE:
        {
          return createFiberFromCache(pendingProps, mode, lanes, key);
        }

      // Fall through

      case REACT_TRACING_MARKER_TYPE:

      // Fall through

      case REACT_DEBUG_TRACING_MODE_TYPE:

      // Fall through

      default:
        {
          if (typeof type === 'object' && type !== null) {
            switch (type.$$typeof) {
              case REACT_PROVIDER_TYPE:
                fiberTag = ContextProvider;
                break getTag;

              case REACT_CONTEXT_TYPE:
                // This is a consumer
                fiberTag = ContextConsumer;
                break getTag;

              case REACT_FORWARD_REF_TYPE:
                fiberTag = ForwardRef;

                break getTag;

              case REACT_MEMO_TYPE:
                fiberTag = MemoComponent;
                break getTag;

              case REACT_LAZY_TYPE:
                fiberTag = LazyComponent;
                resolvedType = null;
                break getTag;
            }
          }

          let info = '';

          throw Error(formatProdErrorMessage(130, type == null ? type : typeof type, info));
        }
    }
  }

  const fiber = createFiber(fiberTag, pendingProps, key, mode);
  fiber.elementType = type;
  fiber.type = resolvedType;
  fiber.lanes = lanes;

  return fiber;
}
function createFiberFromElement(element, mode, lanes) {
  let source = null;
  let owner = null;

  const type = element.type;
  const key = element.key;
  const pendingProps = element.props;
  const fiber = createFiberFromTypeAndProps(type, key, pendingProps, source, owner, mode, lanes);

  return fiber;
}
function createFiberFromFragment(elements, mode, lanes, key) {
  const fiber = createFiber(Fragment, elements, key, mode);
  fiber.lanes = lanes;
  return fiber;
}

function createFiberFromProfiler(pendingProps, mode, lanes, key) {

  const fiber = createFiber(Profiler, pendingProps, key, mode | ProfileMode);
  fiber.elementType = REACT_PROFILER_TYPE;
  fiber.lanes = lanes;

  {
    fiber.stateNode = {
      effectDuration: 0,
      passiveEffectDuration: 0
    };
  }

  return fiber;
}

function createFiberFromSuspense(pendingProps, mode, lanes, key) {
  const fiber = createFiber(SuspenseComponent, pendingProps, key, mode);
  fiber.elementType = REACT_SUSPENSE_TYPE;
  fiber.lanes = lanes;
  return fiber;
}
function createFiberFromSuspenseList(pendingProps, mode, lanes, key) {
  const fiber = createFiber(SuspenseListComponent, pendingProps, key, mode);
  fiber.elementType = REACT_SUSPENSE_LIST_TYPE;
  fiber.lanes = lanes;
  return fiber;
}
function createFiberFromOffscreen(pendingProps, mode, lanes, key) {
  const fiber = createFiber(OffscreenComponent, pendingProps, key, mode);
  fiber.elementType = REACT_OFFSCREEN_TYPE;
  fiber.lanes = lanes;
  const primaryChildInstance = {
    _visibility: OffscreenVisible,
    _pendingVisibility: OffscreenVisible,
    _pendingMarkers: null,
    _retryCache: null,
    _transitions: null,
    _current: null,
    detach: () => detachOffscreenInstance(primaryChildInstance),
    attach: () => attachOffscreenInstance(primaryChildInstance)
  };
  fiber.stateNode = primaryChildInstance;
  return fiber;
}
function createFiberFromCache(pendingProps, mode, lanes, key) {
  const fiber = createFiber(CacheComponent, pendingProps, key, mode);
  fiber.elementType = REACT_CACHE_TYPE;
  fiber.lanes = lanes;
  return fiber;
}
function createFiberFromText(content, mode, lanes) {
  const fiber = createFiber(HostText, content, null, mode);
  fiber.lanes = lanes;
  return fiber;
}
function createFiberFromHostInstanceForDeletion() {
  const fiber = createFiber(HostComponent, null, null, NoMode);
  fiber.elementType = 'DELETED';
  return fiber;
}
function createFiberFromDehydratedFragment(dehydratedNode) {
  const fiber = createFiber(DehydratedFragment, null, null, NoMode);
  fiber.stateNode = dehydratedNode;
  return fiber;
}
function createFiberFromPortal(portal, mode, lanes) {
  const pendingProps = portal.children !== null ? portal.children : [];
  const fiber = createFiber(HostPortal, pendingProps, portal.key, mode);
  fiber.lanes = lanes;
  fiber.stateNode = {
    containerInfo: portal.containerInfo,
    pendingChildren: null,
    // Used by persistent updates
    implementation: portal.implementation
  };
  return fiber;
} // Used for stashing WIP properties to replay failed work in DEV.

function FiberRootNode(containerInfo, // $FlowFixMe[missing-local-annot]
tag, hydrate, identifierPrefix, onRecoverableError, formState) {
  this.tag = tag;
  this.containerInfo = containerInfo;
  this.pendingChildren = null;
  this.current = null;
  this.pingCache = null;
  this.finishedWork = null;
  this.timeoutHandle = noTimeout;
  this.cancelPendingCommit = null;
  this.context = null;
  this.pendingContext = null;
  this.next = null;
  this.callbackNode = null;
  this.callbackPriority = NoLane;
  this.expirationTimes = createLaneMap(NoTimestamp);
  this.pendingLanes = NoLanes;
  this.suspendedLanes = NoLanes;
  this.pingedLanes = NoLanes;
  this.expiredLanes = NoLanes;
  this.finishedLanes = NoLanes;
  this.errorRecoveryDisabledLanes = NoLanes;
  this.shellSuspendCounter = 0;
  this.entangledLanes = NoLanes;
  this.entanglements = createLaneMap(NoLanes);
  this.hiddenUpdates = createLaneMap(null);
  this.identifierPrefix = identifierPrefix;
  this.onRecoverableError = onRecoverableError;

  {
    this.pooledCache = null;
    this.pooledCacheLanes = NoLanes;
  }

  this.formState = formState;
  this.incompleteTransitions = new Map();

  {
    this.effectDuration = 0;
    this.passiveEffectDuration = 0;
  }

  {
    this.memoizedUpdaters = new Set();
    const pendingUpdatersLaneMap = this.pendingUpdatersLaneMap = [];

    for (let i = 0; i < TotalLanes; i++) {
      pendingUpdatersLaneMap.push(new Set());
    }
  }
}

function createFiberRoot(containerInfo, tag, hydrate, initialChildren, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, // TODO: We have several of these arguments that are conceptually part of the
// host config, but because they are passed in at runtime, we have to thread
// them through the root constructor. Perhaps we should put them all into a
// single type, like a DynamicHostConfig that is defined by the renderer.
identifierPrefix, onRecoverableError, transitionCallbacks, formState) {
  // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions
  const root = new FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onRecoverableError, formState);
  // stateNode is any.


  const uninitializedFiber = createHostRootFiber(tag, isStrictMode);
  root.current = uninitializedFiber;
  uninitializedFiber.stateNode = root;

  {
    const initialCache = createCache();
    retainCache(initialCache); // The pooledCache is a fresh cache instance that is used temporarily
    // for newly mounted boundaries during a render. In general, the
    // pooledCache is always cleared from the root at the end of a render:
    // it is either released when render commits, or moved to an Offscreen
    // component if rendering suspends. Because the lifetime of the pooled
    // cache is distinct from the main memoizedState.cache, it must be
    // retained separately.

    root.pooledCache = initialCache;
    retainCache(initialCache);
    const initialState = {
      element: initialChildren,
      isDehydrated: hydrate,
      cache: initialCache
    };
    uninitializedFiber.memoizedState = initialState;
  }

  initializeUpdateQueue(uninitializedFiber);
  return root;
}

var ReactVersion = '18.3.0-experimental-2c338b16f-20231116';

function createPortal$1(children, containerInfo, // TODO: figure out the API for cross-renderer implementation.
implementation) {
  let key = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;

  return {
    // This tag allow us to uniquely identify this as a React Portal
    $$typeof: REACT_PORTAL_TYPE,
    key: key == null ? null : '' + key,
    children,
    containerInfo,
    implementation
  };
}

function getContextForSubtree(parentComponent) {
  if (!parentComponent) {
    return emptyContextObject;
  }

  const fiber = get(parentComponent);
  const parentContext = findCurrentUnmaskedContext(fiber);

  if (fiber.tag === ClassComponent) {
    const Component = fiber.type;

    if (isContextProvider(Component)) {
      return processChildContext(fiber, Component, parentContext);
    }
  }

  return parentContext;
}

function findHostInstance(component) {
  const fiber = get(component);

  if (fiber === undefined) {
    if (typeof component.render === 'function') {
      throw Error(formatProdErrorMessage(188));
    } else {
      const keys = Object.keys(component).join(',');
      throw Error(formatProdErrorMessage(268, keys));
    }
  }

  const hostFiber = findCurrentHostFiber(fiber);

  if (hostFiber === null) {
    return null;
  }

  return getPublicInstance(hostFiber.stateNode);
}

function createContainer(containerInfo, tag, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onRecoverableError, transitionCallbacks) {
  const hydrate = false;
  const initialChildren = null;
  return createFiberRoot(containerInfo, tag, hydrate, initialChildren, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onRecoverableError, transitionCallbacks, null);
}
function createHydrationContainer(initialChildren, // TODO: Remove `callback` when we delete legacy mode.
callback, containerInfo, tag, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onRecoverableError, transitionCallbacks, formState) {
  const hydrate = true;
  const root = createFiberRoot(containerInfo, tag, hydrate, initialChildren, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onRecoverableError, transitionCallbacks, formState); // TODO: Move this to FiberRoot constructor

  root.context = getContextForSubtree(null); // Schedule the initial render. In a hydration root, this is different from
  // a regular update because the initial render must match was was rendered
  // on the server.
  // NOTE: This update intentionally doesn't have a payload. We're only using
  // the update to schedule work on the root fiber (and, for legacy roots, to
  // enqueue the callback if one is provided).

  const current = root.current;
  const lane = requestUpdateLane(current);
  const update = createUpdate(lane);
  update.callback = callback !== undefined && callback !== null ? callback : null;
  enqueueUpdate(current, update, lane);
  scheduleInitialHydrationOnRoot(root, lane);
  return root;
}
function updateContainer(element, container, parentComponent, callback) {

  const current = container.current;
  const lane = requestUpdateLane(current);

  {
    markRenderScheduled(lane);
  }

  const context = getContextForSubtree(parentComponent);

  if (container.context === null) {
    container.context = context;
  } else {
    container.pendingContext = context;
  }

  const update = createUpdate(lane); // Caution: React DevTools currently depends on this property
  // being called "element".

  update.payload = {
    element
  };
  callback = callback === undefined ? null : callback;

  if (callback !== null) {

    update.callback = callback;
  }

  const root = enqueueUpdate(current, update, lane);

  if (root !== null) {
    scheduleUpdateOnFiber(root, current, lane);
    entangleTransitions(root, current, lane);
  }

  return lane;
}
function getPublicRootInstance(container) {
  const containerFiber = container.current;

  if (!containerFiber.child) {
    return null;
  }

  switch (containerFiber.child.tag) {
    case HostSingleton:
    case HostComponent:
      return getPublicInstance(containerFiber.child.stateNode);

    default:
      return containerFiber.child.stateNode;
  }
}
function attemptSynchronousHydration(fiber) {
  switch (fiber.tag) {
    case HostRoot:
      {
        const root = fiber.stateNode;

        if (isRootDehydrated(root)) {
          // Flush the first scheduled "update".
          const lanes = getHighestPriorityPendingLanes(root);
          flushRoot(root, lanes);
        }

        break;
      }

    case SuspenseComponent:
      {
        flushSync$1(() => {
          const root = enqueueConcurrentRenderForLane(fiber, SyncLane);

          if (root !== null) {
            scheduleUpdateOnFiber(root, fiber, SyncLane);
          }
        }); // If we're still blocked after this, we need to increase
        // the priority of any promises resolving within this
        // boundary so that they next attempt also has higher pri.

        const retryLane = SyncLane;
        markRetryLaneIfNotHydrated(fiber, retryLane);
        break;
      }
  }
}

function markRetryLaneImpl(fiber, retryLane) {
  const suspenseState = fiber.memoizedState;

  if (suspenseState !== null && suspenseState.dehydrated !== null) {
    suspenseState.retryLane = higherPriorityLane(suspenseState.retryLane, retryLane);
  }
} // Increases the priority of thenables when they resolve within this boundary.


function markRetryLaneIfNotHydrated(fiber, retryLane) {
  markRetryLaneImpl(fiber, retryLane);
  const alternate = fiber.alternate;

  if (alternate) {
    markRetryLaneImpl(alternate, retryLane);
  }
}

function attemptContinuousHydration(fiber) {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority and they should not suspend on I/O,
    // since you have to wrap anything that might suspend in
    // Suspense.
    return;
  }

  const lane = SelectiveHydrationLane;
  const root = enqueueConcurrentRenderForLane(fiber, lane);

  if (root !== null) {
    scheduleUpdateOnFiber(root, fiber, lane);
  }

  markRetryLaneIfNotHydrated(fiber, lane);
}
function attemptHydrationAtCurrentPriority(fiber) {
  if (fiber.tag !== SuspenseComponent) {
    // We ignore HostRoots here because we can't increase
    // their priority other than synchronously flush it.
    return;
  }

  const lane = requestUpdateLane(fiber);
  const root = enqueueConcurrentRenderForLane(fiber, lane);

  if (root !== null) {
    scheduleUpdateOnFiber(root, fiber, lane);
  }

  markRetryLaneIfNotHydrated(fiber, lane);
}
let overrideHookState = null;
let overrideHookStateDeletePath = null;
let overrideHookStateRenamePath = null;
let overrideProps = null;
let overridePropsDeletePath = null;
let overridePropsRenamePath = null;
let scheduleUpdate = null;
let setErrorHandler = null;
let setSuspenseHandler = null;

function findHostInstanceByFiber(fiber) {
  const hostFiber = findCurrentHostFiber(fiber);

  if (hostFiber === null) {
    return null;
  }

  return hostFiber.stateNode;
}

function emptyFindFiberByHostInstance(instance) {
  return null;
}

function injectIntoDevTools(devToolsConfig) {
  const findFiberByHostInstance = devToolsConfig.findFiberByHostInstance;
  const ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher;
  return injectInternals({
    bundleType: devToolsConfig.bundleType,
    version: devToolsConfig.version,
    rendererPackageName: devToolsConfig.rendererPackageName,
    rendererConfig: devToolsConfig.rendererConfig,
    overrideHookState,
    overrideHookStateDeletePath,
    overrideHookStateRenamePath,
    overrideProps,
    overridePropsDeletePath,
    overridePropsRenamePath,
    setErrorHandler,
    setSuspenseHandler,
    scheduleUpdate,
    currentDispatcherRef: ReactCurrentDispatcher,
    findHostInstanceByFiber,
    findFiberByHostInstance: findFiberByHostInstance || emptyFindFiberByHostInstance,
    // React Refresh
    findHostInstancesForRefresh: null,
    scheduleRefresh: null,
    scheduleRoot: null,
    setRefreshHandler: null,
    // Enables DevTools to append owner stacks to error messages in DEV mode.
    getCurrentFiber: null,
    // Enables DevTools to detect reconciler version rather than renderer version
    // which may not match for third party renderers.
    reconcilerVersion: ReactVersion
  });
}

// the renderer. Such as when we're dispatching events or if third party
// libraries need to call batchedUpdates. Eventually, this API will go away when
// everything is batched by default. We'll then have a similar API to opt-out of
// scheduled work and instead do synchronous work.

let isInsideEventHandler = false;

function finishEventHandler() {
  // Here we wait until all updates have propagated, which is important
  // when using controlled components within layers:
  // https://github.com/facebook/react/issues/1698
  // Then we restore state of any controlled component.
  const controlledComponentsHavePendingUpdates = needsStateRestore();

  if (controlledComponentsHavePendingUpdates) {
    // If a controlled event was fired, we may need to restore the state of
    // the DOM node back to the controlled value. This is necessary when React
    // bails out of the update without touching the DOM.
    // TODO: Restore state in the microtask, after the discrete updates flush,
    // instead of early flushing them here.
    flushSync$1();
    restoreStateIfNeeded();
  }
}

function batchedUpdates(fn, a, b) {
  if (isInsideEventHandler) {
    // If we are currently inside another batch, we need to wait until it
    // fully completes before restoring state.
    return fn(a, b);
  }

  isInsideEventHandler = true;

  try {
    return batchedUpdates$1(fn, a, b);
  } finally {
    isInsideEventHandler = false;
    finishEventHandler();
  }
} // TODO: Replace with flushSync

function isInteractive(tag) {
  return tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea';
}

function shouldPreventMouseEvent(name, type, props) {
  switch (name) {
    case 'onClick':
    case 'onClickCapture':
    case 'onDoubleClick':
    case 'onDoubleClickCapture':
    case 'onMouseDown':
    case 'onMouseDownCapture':
    case 'onMouseMove':
    case 'onMouseMoveCapture':
    case 'onMouseUp':
    case 'onMouseUpCapture':
    case 'onMouseEnter':
      return !!(props.disabled && isInteractive(type));

    default:
      return false;
  }
}
/**
 * @param {object} inst The instance, which is the source of events.
 * @param {string} registrationName Name of listener (e.g. `onClick`).
 * @return {?function} The stored callback.
 */


function getListener(inst, registrationName) {
  const stateNode = inst.stateNode;

  if (stateNode === null) {
    // Work in progress (ex: onload events in incremental mode).
    return null;
  }

  const props = getFiberCurrentPropsFromNode(stateNode);

  if (props === null) {
    // Work in progress.
    return null;
  }

  const listener = props[registrationName];

  if (shouldPreventMouseEvent(registrationName, inst.type, props)) {
    return null;
  }

  if (listener && typeof listener !== 'function') {
    throw Error(formatProdErrorMessage(231, registrationName, typeof listener));
  }

  return listener;
}

let passiveBrowserEventsSupported = false; // Check if browser support events with passive listeners
// https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#Safely_detecting_option_support

if (canUseDOM) {
  try {
    const options = {};
    Object.defineProperty(options, 'passive', {
      get: function () {
        passiveBrowserEventsSupported = true;
      }
    });
    window.addEventListener('test', options, options);
    window.removeEventListener('test', options, options);
  } catch (e) {
    passiveBrowserEventsSupported = false;
  }
}

/**
 * `charCode` represents the actual "character code" and is safe to use with
 * `String.fromCharCode`. As such, only keys that correspond to printable
 * characters produce a valid `charCode`, the only exception to this is Enter.
 * The Tab-key is considered non-printable and does not have a `charCode`,
 * presumably because it does not produce a tab-character in browsers.
 *
 * @param {object} nativeEvent Native browser event.
 * @return {number} Normalized `charCode` property.
 */
function getEventCharCode(nativeEvent) {
  let charCode;
  const keyCode = nativeEvent.keyCode;

  if ('charCode' in nativeEvent) {
    charCode = nativeEvent.charCode; // FF does not set `charCode` for the Enter-key, check against `keyCode`.

    if (charCode === 0 && keyCode === 13) {
      charCode = 13;
    }
  } else {
    // IE8 does not implement `charCode`, but `keyCode` has the correct value.
    charCode = keyCode;
  } // IE and Edge (on Windows) and Chrome / Safari (on Windows and Linux)
  // report Enter as charCode 10 when ctrl is pressed.


  if (charCode === 10) {
    charCode = 13;
  } // Some non-printable keys are reported in `charCode`/`keyCode`, discard them.
  // Must not discard the (non-)printable Enter-key.


  if (charCode >= 32 || charCode === 13) {
    return charCode;
  }

  return 0;
}

function functionThatReturnsTrue() {
  return true;
}

function functionThatReturnsFalse() {
  return false;
} // This is intentionally a factory so that we have different returned constructors.
// If we had a single constructor, it would be megamorphic and engines would deopt.


function createSyntheticEvent(Interface) {
  /**
   * Synthetic events are dispatched by event plugins, typically in response to a
   * top-level event delegation handler.
   *
   * These systems should generally use pooling to reduce the frequency of garbage
   * collection. The system should check `isPersistent` to determine whether the
   * event should be released into the pool after being dispatched. Users that
   * need a persisted event should invoke `persist`.
   *
   * Synthetic events (and subclasses) implement the DOM Level 3 Events API by
   * normalizing browser quirks. Subclasses do not necessarily have to implement a
   * DOM interface; custom application-specific events can also subclass this.
   */
  // $FlowFixMe[missing-this-annot]
  function SyntheticBaseEvent(reactName, reactEventType, targetInst, nativeEvent, nativeEventTarget) {
    this._reactName = reactName;
    this._targetInst = targetInst;
    this.type = reactEventType;
    this.nativeEvent = nativeEvent;
    this.target = nativeEventTarget;
    this.currentTarget = null;

    for (const propName in Interface) {
      if (!Interface.hasOwnProperty(propName)) {
        continue;
      }

      const normalize = Interface[propName];

      if (normalize) {
        this[propName] = normalize(nativeEvent);
      } else {
        this[propName] = nativeEvent[propName];
      }
    }

    const defaultPrevented = nativeEvent.defaultPrevented != null ? nativeEvent.defaultPrevented : nativeEvent.returnValue === false;

    if (defaultPrevented) {
      this.isDefaultPrevented = functionThatReturnsTrue;
    } else {
      this.isDefaultPrevented = functionThatReturnsFalse;
    }

    this.isPropagationStopped = functionThatReturnsFalse;
    return this;
  } // $FlowFixMe[prop-missing] found when upgrading Flow


  assign(SyntheticBaseEvent.prototype, {
    // $FlowFixMe[missing-this-annot]
    preventDefault: function () {
      this.defaultPrevented = true;
      const event = this.nativeEvent;

      if (!event) {
        return;
      }

      if (event.preventDefault) {
        event.preventDefault(); // $FlowFixMe[illegal-typeof] - flow is not aware of `unknown` in IE
      } else if (typeof event.returnValue !== 'unknown') {
        event.returnValue = false;
      }

      this.isDefaultPrevented = functionThatReturnsTrue;
    },
    // $FlowFixMe[missing-this-annot]
    stopPropagation: function () {
      const event = this.nativeEvent;

      if (!event) {
        return;
      }

      if (event.stopPropagation) {
        event.stopPropagation(); // $FlowFixMe[illegal-typeof] - flow is not aware of `unknown` in IE
      } else if (typeof event.cancelBubble !== 'unknown') {
        // The ChangeEventPlugin registers a "propertychange" event for
        // IE. This event does not support bubbling or cancelling, and
        // any references to cancelBubble throw "Member not found".  A
        // typeof check of "unknown" circumvents this issue (and is also
        // IE specific).
        event.cancelBubble = true;
      }

      this.isPropagationStopped = functionThatReturnsTrue;
    },

    /**
     * We release all dispatched `SyntheticEvent`s after each event loop, adding
     * them back into the pool. This allows a way to hold onto a reference that
     * won't be added back into the pool.
     */
    persist: function () {// Modern event system doesn't use pooling.
    },

    /**
     * Checks if this event should be released back into the pool.
     *
     * @return {boolean} True if this should not be released, false otherwise.
     */
    isPersistent: functionThatReturnsTrue
  });
  return SyntheticBaseEvent;
}
/**
 * @interface Event
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */


const EventInterface = {
  eventPhase: 0,
  bubbles: 0,
  cancelable: 0,
  timeStamp: function (event) {
    return event.timeStamp || Date.now();
  },
  defaultPrevented: 0,
  isTrusted: 0
};
const SyntheticEvent = createSyntheticEvent(EventInterface);

const UIEventInterface = assign({}, EventInterface, {
  view: 0,
  detail: 0
});

const SyntheticUIEvent = createSyntheticEvent(UIEventInterface);
let lastMovementX;
let lastMovementY;
let lastMouseEvent;

function updateMouseMovementPolyfillState(event) {
  if (event !== lastMouseEvent) {
    if (lastMouseEvent && event.type === 'mousemove') {
      // $FlowFixMe[unsafe-arithmetic] assuming this is a number
      lastMovementX = event.screenX - lastMouseEvent.screenX; // $FlowFixMe[unsafe-arithmetic] assuming this is a number

      lastMovementY = event.screenY - lastMouseEvent.screenY;
    } else {
      lastMovementX = 0;
      lastMovementY = 0;
    }

    lastMouseEvent = event;
  }
}
/**
 * @interface MouseEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */


const MouseEventInterface = assign({}, UIEventInterface, {
  screenX: 0,
  screenY: 0,
  clientX: 0,
  clientY: 0,
  pageX: 0,
  pageY: 0,
  ctrlKey: 0,
  shiftKey: 0,
  altKey: 0,
  metaKey: 0,
  getModifierState: getEventModifierState,
  button: 0,
  buttons: 0,
  relatedTarget: function (event) {
    if (event.relatedTarget === undefined) return event.fromElement === event.srcElement ? event.toElement : event.fromElement;
    return event.relatedTarget;
  },
  movementX: function (event) {
    if ('movementX' in event) {
      return event.movementX;
    }

    updateMouseMovementPolyfillState(event);
    return lastMovementX;
  },
  movementY: function (event) {
    if ('movementY' in event) {
      return event.movementY;
    } // Don't need to call updateMouseMovementPolyfillState() here
    // because it's guaranteed to have already run when movementX
    // was copied.


    return lastMovementY;
  }
});

const SyntheticMouseEvent = createSyntheticEvent(MouseEventInterface);
/**
 * @interface DragEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */

const DragEventInterface = assign({}, MouseEventInterface, {
  dataTransfer: 0
});

const SyntheticDragEvent = createSyntheticEvent(DragEventInterface);
/**
 * @interface FocusEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */

const FocusEventInterface = assign({}, UIEventInterface, {
  relatedTarget: 0
});

const SyntheticFocusEvent = createSyntheticEvent(FocusEventInterface);
/**
 * @interface Event
 * @see http://www.w3.org/TR/css3-animations/#AnimationEvent-interface
 * @see https://developer.mozilla.org/en-US/docs/Web/API/AnimationEvent
 */

const AnimationEventInterface = assign({}, EventInterface, {
  animationName: 0,
  elapsedTime: 0,
  pseudoElement: 0
});

const SyntheticAnimationEvent = createSyntheticEvent(AnimationEventInterface);
/**
 * @interface Event
 * @see http://www.w3.org/TR/clipboard-apis/
 */

const ClipboardEventInterface = assign({}, EventInterface, {
  clipboardData: function (event) {
    return 'clipboardData' in event ? event.clipboardData : window.clipboardData;
  }
});

const SyntheticClipboardEvent = createSyntheticEvent(ClipboardEventInterface);
/**
 * @interface Event
 * @see http://www.w3.org/TR/DOM-Level-3-Events/#events-compositionevents
 */

const CompositionEventInterface = assign({}, EventInterface, {
  data: 0
});

const SyntheticCompositionEvent = createSyntheticEvent(CompositionEventInterface);
/**
 * @interface Event
 * @see http://www.w3.org/TR/2013/WD-DOM-Level-3-Events-20131105
 *      /#events-inputevents
 */
// Happens to share the same list for now.

const SyntheticInputEvent = SyntheticCompositionEvent;
/**
 * Normalization of deprecated HTML5 `key` values
 * @see https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent#Key_names
 */

const normalizeKey = {
  Esc: 'Escape',
  Spacebar: ' ',
  Left: 'ArrowLeft',
  Up: 'ArrowUp',
  Right: 'ArrowRight',
  Down: 'ArrowDown',
  Del: 'Delete',
  Win: 'OS',
  Menu: 'ContextMenu',
  Apps: 'ContextMenu',
  Scroll: 'ScrollLock',
  MozPrintableKey: 'Unidentified'
};
/**
 * Translation from legacy `keyCode` to HTML5 `key`
 * Only special keys supported, all others depend on keyboard layout or browser
 * @see https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent#Key_names
 */

const translateToKey = {
  '8': 'Backspace',
  '9': 'Tab',
  '12': 'Clear',
  '13': 'Enter',
  '16': 'Shift',
  '17': 'Control',
  '18': 'Alt',
  '19': 'Pause',
  '20': 'CapsLock',
  '27': 'Escape',
  '32': ' ',
  '33': 'PageUp',
  '34': 'PageDown',
  '35': 'End',
  '36': 'Home',
  '37': 'ArrowLeft',
  '38': 'ArrowUp',
  '39': 'ArrowRight',
  '40': 'ArrowDown',
  '45': 'Insert',
  '46': 'Delete',
  '112': 'F1',
  '113': 'F2',
  '114': 'F3',
  '115': 'F4',
  '116': 'F5',
  '117': 'F6',
  '118': 'F7',
  '119': 'F8',
  '120': 'F9',
  '121': 'F10',
  '122': 'F11',
  '123': 'F12',
  '144': 'NumLock',
  '145': 'ScrollLock',
  '224': 'Meta'
};
/**
 * @param {object} nativeEvent Native browser event.
 * @return {string} Normalized `key` property.
 */

function getEventKey(nativeEvent) {
  if (nativeEvent.key) {
    // Normalize inconsistent values reported by browsers due to
    // implementations of a working draft specification.
    // FireFox implements `key` but returns `MozPrintableKey` for all
    // printable characters (normalized to `Unidentified`), ignore it.
    const key = // $FlowFixMe[invalid-computed-prop] unable to index with a `mixed` value
    normalizeKey[nativeEvent.key] || nativeEvent.key;

    if (key !== 'Unidentified') {
      return key;
    }
  } // Browser does not implement `key`, polyfill as much of it as we can.


  if (nativeEvent.type === 'keypress') {
    const charCode = getEventCharCode( // $FlowFixMe[incompatible-call] unable to narrow to `KeyboardEvent`
    nativeEvent); // The enter-key is technically both printable and non-printable and can
    // thus be captured by `keypress`, no other non-printable key should.

    return charCode === 13 ? 'Enter' : String.fromCharCode(charCode);
  }

  if (nativeEvent.type === 'keydown' || nativeEvent.type === 'keyup') {
    // While user keyboard layout determines the actual meaning of each
    // `keyCode` value, almost all function keys have a universal value.
    // $FlowFixMe[invalid-computed-prop] unable to index with a `mixed` value
    return translateToKey[nativeEvent.keyCode] || 'Unidentified';
  }

  return '';
}
/**
 * Translation from modifier key to the associated property in the event.
 * @see http://www.w3.org/TR/DOM-Level-3-Events/#keys-Modifiers
 */


const modifierKeyToProp = {
  Alt: 'altKey',
  Control: 'ctrlKey',
  Meta: 'metaKey',
  Shift: 'shiftKey'
}; // Older browsers (Safari <= 10, iOS Safari <= 10.2) do not support
// getModifierState. If getModifierState is not supported, we map it to a set of
// modifier keys exposed by the event. In this case, Lock-keys are not supported.
// $FlowFixMe[missing-local-annot]
// $FlowFixMe[missing-this-annot]

function modifierStateGetter(keyArg) {
  const syntheticEvent = this;
  const nativeEvent = syntheticEvent.nativeEvent;

  if (nativeEvent.getModifierState) {
    return nativeEvent.getModifierState(keyArg);
  }

  const keyProp = modifierKeyToProp[keyArg];
  return keyProp ? !!nativeEvent[keyProp] : false;
}

function getEventModifierState(nativeEvent) {
  return modifierStateGetter;
}
/**
 * @interface KeyboardEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */


const KeyboardEventInterface = assign({}, UIEventInterface, {
  key: getEventKey,
  code: 0,
  location: 0,
  ctrlKey: 0,
  shiftKey: 0,
  altKey: 0,
  metaKey: 0,
  repeat: 0,
  locale: 0,
  getModifierState: getEventModifierState,
  // Legacy Interface
  charCode: function (event) {
    // `charCode` is the result of a KeyPress event and represents the value of
    // the actual printable character.
    // KeyPress is deprecated, but its replacement is not yet final and not
    // implemented in any major browser. Only KeyPress has charCode.
    if (event.type === 'keypress') {
      return getEventCharCode( // $FlowFixMe[incompatible-call] unable to narrow to `KeyboardEvent`
      event);
    }

    return 0;
  },
  keyCode: function (event) {
    // `keyCode` is the result of a KeyDown/Up event and represents the value of
    // physical keyboard key.
    // The actual meaning of the value depends on the users' keyboard layout
    // which cannot be detected. Assuming that it is a US keyboard layout
    // provides a surprisingly accurate mapping for US and European users.
    // Due to this, it is left to the user to implement at this time.
    if (event.type === 'keydown' || event.type === 'keyup') {
      return event.keyCode;
    }

    return 0;
  },
  which: function (event) {
    // `which` is an alias for either `keyCode` or `charCode` depending on the
    // type of the event.
    if (event.type === 'keypress') {
      return getEventCharCode( // $FlowFixMe[incompatible-call] unable to narrow to `KeyboardEvent`
      event);
    }

    if (event.type === 'keydown' || event.type === 'keyup') {
      return event.keyCode;
    }

    return 0;
  }
});

const SyntheticKeyboardEvent = createSyntheticEvent(KeyboardEventInterface);
/**
 * @interface PointerEvent
 * @see http://www.w3.org/TR/pointerevents/
 */

const PointerEventInterface = assign({}, MouseEventInterface, {
  pointerId: 0,
  width: 0,
  height: 0,
  pressure: 0,
  tangentialPressure: 0,
  tiltX: 0,
  tiltY: 0,
  twist: 0,
  pointerType: 0,
  isPrimary: 0
});

const SyntheticPointerEvent = createSyntheticEvent(PointerEventInterface);
/**
 * @interface TouchEvent
 * @see http://www.w3.org/TR/touch-events/
 */

const TouchEventInterface = assign({}, UIEventInterface, {
  touches: 0,
  targetTouches: 0,
  changedTouches: 0,
  altKey: 0,
  metaKey: 0,
  ctrlKey: 0,
  shiftKey: 0,
  getModifierState: getEventModifierState
});

const SyntheticTouchEvent = createSyntheticEvent(TouchEventInterface);
/**
 * @interface Event
 * @see http://www.w3.org/TR/2009/WD-css3-transitions-20090320/#transition-events-
 * @see https://developer.mozilla.org/en-US/docs/Web/API/TransitionEvent
 */

const TransitionEventInterface = assign({}, EventInterface, {
  propertyName: 0,
  elapsedTime: 0,
  pseudoElement: 0
});

const SyntheticTransitionEvent = createSyntheticEvent(TransitionEventInterface);
/**
 * @interface WheelEvent
 * @see http://www.w3.org/TR/DOM-Level-3-Events/
 */

const WheelEventInterface = assign({}, MouseEventInterface, {
  deltaX(event) {
    return 'deltaX' in event ? event.deltaX : // Fallback to `wheelDeltaX` for Webkit and normalize (right is positive).
    'wheelDeltaX' in event ? // $FlowFixMe[unsafe-arithmetic] assuming this is a number
    -event.wheelDeltaX : 0;
  },

  deltaY(event) {
    return 'deltaY' in event ? event.deltaY : // Fallback to `wheelDeltaY` for Webkit and normalize (down is positive).
    'wheelDeltaY' in event ? // $FlowFixMe[unsafe-arithmetic] assuming this is a number
    -event.wheelDeltaY : // Fallback to `wheelDelta` for IE<9 and normalize (down is positive).
    'wheelDelta' in event ? // $FlowFixMe[unsafe-arithmetic] assuming this is a number
    -event.wheelDelta : 0;
  },

  deltaZ: 0,
  // Browsers without "deltaMode" is reporting in raw wheel delta where one
  // notch on the scroll is always +/- 120, roughly equivalent to pixels.
  // A good approximation of DOM_DELTA_LINE (1) is 5% of viewport size or
  // ~40 pixels, for DOM_DELTA_SCREEN (2) it is 87.5% of viewport size.
  deltaMode: 0
});

const SyntheticWheelEvent = createSyntheticEvent(WheelEventInterface);

/**
 * This plugin invokes action functions on forms, inputs and buttons if
 * the form doesn't prevent default.
 */

function extractEvents$6(dispatchQueue, domEventName, maybeTargetInst, nativeEvent, nativeEventTarget, eventSystemFlags, targetContainer) {
  if (domEventName !== 'submit') {
    return;
  }

  if (!maybeTargetInst || maybeTargetInst.stateNode !== nativeEventTarget) {
    // If we're inside a parent root that itself is a parent of this root, then
    // its deepest target won't be the actual form that's being submitted.
    return;
  }

  const formInst = maybeTargetInst;
  const form = nativeEventTarget;
  let action = getFiberCurrentPropsFromNode(form).action;
  let submitter = nativeEvent.submitter;
  let submitterAction;

  if (submitter) {
    const submitterProps = getFiberCurrentPropsFromNode(submitter);
    submitterAction = submitterProps ? submitterProps.formAction : submitter.getAttribute('formAction');

    if (submitterAction != null) {
      // The submitter overrides the form action.
      action = submitterAction; // If the action is a function, we don't want to pass its name
      // value to the FormData since it's controlled by the server.

      submitter = null;
    }
  }

  if (typeof action !== 'function') {
    return;
  }

  const event = new SyntheticEvent('action', 'action', null, nativeEvent, nativeEventTarget);

  function submitForm() {
    if (nativeEvent.defaultPrevented) {
      // We let earlier events to prevent the action from submitting.
      return;
    } // Prevent native navigation.


    event.preventDefault();
    let formData;

    if (submitter) {
      // The submitter's value should be included in the FormData.
      // It should be in the document order in the form.
      // Since the FormData constructor invokes the formdata event it also
      // needs to be available before that happens so after construction it's too
      // late. We use a temporary fake node for the duration of this event.
      // TODO: FormData takes a second argument that it's the submitter but this
      // is fairly new so not all browsers support it yet. Switch to that technique
      // when available.
      const temp = submitter.ownerDocument.createElement('input');
      temp.name = submitter.name;
      temp.value = submitter.value;
      submitter.parentNode.insertBefore(temp, submitter);
      formData = new FormData(form);
      temp.parentNode.removeChild(temp);
    } else {
      formData = new FormData(form);
    }

    const pendingState = {
      pending: true,
      data: formData,
      method: form.method,
      action: action
    };

    startHostTransition(formInst, pendingState, action, formData);
  }

  dispatchQueue.push({
    event,
    listeners: [{
      instance: null,
      listener: submitForm,
      currentTarget: form
    }]
  });
}
function dispatchReplayedFormAction(formInst, form, action, formData) {
  const pendingState = {
    pending: true,
    data: formData,
    method: form.method,
    action: action
  };

  startHostTransition(formInst, pendingState, action, formData);
}

// has this definition built-in.

let hasScheduledReplayAttempt = false; // The last of each continuous event type. We only need to replay the last one
// if the last target was dehydrated.

let queuedFocus = null;
let queuedDrag = null;
let queuedMouse = null; // For pointer events there can be one latest event per pointerId.

const queuedPointers = new Map();
const queuedPointerCaptures = new Map(); // We could consider replaying selectionchange and touchmoves too.

const queuedExplicitHydrationTargets = [];
const discreteReplayableEvents = ['mousedown', 'mouseup', 'touchcancel', 'touchend', 'touchstart', 'auxclick', 'dblclick', 'pointercancel', 'pointerdown', 'pointerup', 'dragend', 'dragstart', 'drop', 'compositionend', 'compositionstart', 'keydown', 'keypress', 'keyup', 'input', 'textInput', // Intentionally camelCase
'copy', 'cut', 'paste', 'click', 'change', 'contextmenu', 'reset' // 'submit', // stopPropagation blocks the replay mechanism
];
function isDiscreteEventThatRequiresHydration(eventType) {
  return discreteReplayableEvents.indexOf(eventType) > -1;
}

function createQueuedReplayableEvent(blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
  return {
    blockedOn,
    domEventName,
    eventSystemFlags,
    nativeEvent,
    targetContainers: [targetContainer]
  };
} // Resets the replaying for this type of continuous event to no event.


function clearIfContinuousEvent(domEventName, nativeEvent) {
  switch (domEventName) {
    case 'focusin':
    case 'focusout':
      queuedFocus = null;
      break;

    case 'dragenter':
    case 'dragleave':
      queuedDrag = null;
      break;

    case 'mouseover':
    case 'mouseout':
      queuedMouse = null;
      break;

    case 'pointerover':
    case 'pointerout':
      {
        const pointerId = nativeEvent.pointerId;
        queuedPointers.delete(pointerId);
        break;
      }

    case 'gotpointercapture':
    case 'lostpointercapture':
      {
        const pointerId = nativeEvent.pointerId;
        queuedPointerCaptures.delete(pointerId);
        break;
      }
  }
}

function accumulateOrCreateContinuousQueuedReplayableEvent(existingQueuedEvent, blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
  if (existingQueuedEvent === null || existingQueuedEvent.nativeEvent !== nativeEvent) {
    const queuedEvent = createQueuedReplayableEvent(blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent);

    if (blockedOn !== null) {
      const fiber = getInstanceFromNode(blockedOn);

      if (fiber !== null) {
        // Attempt to increase the priority of this target.
        attemptContinuousHydration(fiber);
      }
    }

    return queuedEvent;
  } // If we have already queued this exact event, then it's because
  // the different event systems have different DOM event listeners.
  // We can accumulate the flags, and the targetContainers, and
  // store a single event to be replayed.


  existingQueuedEvent.eventSystemFlags |= eventSystemFlags;
  const targetContainers = existingQueuedEvent.targetContainers;

  if (targetContainer !== null && targetContainers.indexOf(targetContainer) === -1) {
    targetContainers.push(targetContainer);
  }

  return existingQueuedEvent;
}

function queueIfContinuousEvent(blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
  // These set relatedTarget to null because the replayed event will be treated as if we
  // moved from outside the window (no target) onto the target once it hydrates.
  // Instead of mutating we could clone the event.
  switch (domEventName) {
    case 'focusin':
      {
        const focusEvent = nativeEvent;
        queuedFocus = accumulateOrCreateContinuousQueuedReplayableEvent(queuedFocus, blockedOn, domEventName, eventSystemFlags, targetContainer, focusEvent);
        return true;
      }

    case 'dragenter':
      {
        const dragEvent = nativeEvent;
        queuedDrag = accumulateOrCreateContinuousQueuedReplayableEvent(queuedDrag, blockedOn, domEventName, eventSystemFlags, targetContainer, dragEvent);
        return true;
      }

    case 'mouseover':
      {
        const mouseEvent = nativeEvent;
        queuedMouse = accumulateOrCreateContinuousQueuedReplayableEvent(queuedMouse, blockedOn, domEventName, eventSystemFlags, targetContainer, mouseEvent);
        return true;
      }

    case 'pointerover':
      {
        const pointerEvent = nativeEvent;
        const pointerId = pointerEvent.pointerId;
        queuedPointers.set(pointerId, accumulateOrCreateContinuousQueuedReplayableEvent(queuedPointers.get(pointerId) || null, blockedOn, domEventName, eventSystemFlags, targetContainer, pointerEvent));
        return true;
      }

    case 'gotpointercapture':
      {
        const pointerEvent = nativeEvent;
        const pointerId = pointerEvent.pointerId;
        queuedPointerCaptures.set(pointerId, accumulateOrCreateContinuousQueuedReplayableEvent(queuedPointerCaptures.get(pointerId) || null, blockedOn, domEventName, eventSystemFlags, targetContainer, pointerEvent));
        return true;
      }
  }

  return false;
} // Check if this target is unblocked. Returns true if it's unblocked.

function attemptExplicitHydrationTarget(queuedTarget) {
  // TODO: This function shares a lot of logic with findInstanceBlockingEvent.
  // Try to unify them. It's a bit tricky since it would require two return
  // values.
  const targetInst = getClosestInstanceFromNode(queuedTarget.target);

  if (targetInst !== null) {
    const nearestMounted = getNearestMountedFiber(targetInst);

    if (nearestMounted !== null) {
      const tag = nearestMounted.tag;

      if (tag === SuspenseComponent) {
        const instance = getSuspenseInstanceFromFiber(nearestMounted);

        if (instance !== null) {
          // We're blocked on hydrating this boundary.
          // Increase its priority.
          queuedTarget.blockedOn = instance;
          runWithPriority(queuedTarget.priority, () => {
            attemptHydrationAtCurrentPriority(nearestMounted);
          });
          return;
        }
      } else if (tag === HostRoot) {
        const root = nearestMounted.stateNode;

        if (isRootDehydrated(root)) {
          queuedTarget.blockedOn = getContainerFromFiber(nearestMounted); // We don't currently have a way to increase the priority of
          // a root other than sync.

          return;
        }
      }
    }
  }

  queuedTarget.blockedOn = null;
}

function queueExplicitHydrationTarget(target) {
  // TODO: This will read the priority if it's dispatched by the React
  // event system but not native events. Should read window.event.type, like
  // we do for updates (getCurrentEventPriority).
  const updatePriority = getCurrentUpdatePriority();
  const queuedTarget = {
    blockedOn: null,
    target: target,
    priority: updatePriority
  };
  let i = 0;

  for (; i < queuedExplicitHydrationTargets.length; i++) {
    // Stop once we hit the first target with lower priority than
    if (!isHigherEventPriority(updatePriority, queuedExplicitHydrationTargets[i].priority)) {
      break;
    }
  }

  queuedExplicitHydrationTargets.splice(i, 0, queuedTarget);

  if (i === 0) {
    attemptExplicitHydrationTarget(queuedTarget);
  }
}

function attemptReplayContinuousQueuedEvent(queuedEvent) {
  if (queuedEvent.blockedOn !== null) {
    return false;
  }

  const targetContainers = queuedEvent.targetContainers;

  while (targetContainers.length > 0) {
    const nextBlockedOn = findInstanceBlockingEvent(queuedEvent.nativeEvent);

    if (nextBlockedOn === null) {
      const nativeEvent = queuedEvent.nativeEvent;
      const nativeEventClone = new nativeEvent.constructor(nativeEvent.type, nativeEvent);
      setReplayingEvent(nativeEventClone);
      nativeEvent.target.dispatchEvent(nativeEventClone);
      resetReplayingEvent();
    } else {
      // We're still blocked. Try again later.
      const fiber = getInstanceFromNode(nextBlockedOn);

      if (fiber !== null) {
        attemptContinuousHydration(fiber);
      }

      queuedEvent.blockedOn = nextBlockedOn;
      return false;
    } // This target container was successfully dispatched. Try the next.


    targetContainers.shift();
  }

  return true;
}

function attemptReplayContinuousQueuedEventInMap(queuedEvent, key, map) {
  if (attemptReplayContinuousQueuedEvent(queuedEvent)) {
    map.delete(key);
  }
}

function replayUnblockedEvents() {
  hasScheduledReplayAttempt = false; // Replay any continuous events.

  if (queuedFocus !== null && attemptReplayContinuousQueuedEvent(queuedFocus)) {
    queuedFocus = null;
  }

  if (queuedDrag !== null && attemptReplayContinuousQueuedEvent(queuedDrag)) {
    queuedDrag = null;
  }

  if (queuedMouse !== null && attemptReplayContinuousQueuedEvent(queuedMouse)) {
    queuedMouse = null;
  }

  queuedPointers.forEach(attemptReplayContinuousQueuedEventInMap);
  queuedPointerCaptures.forEach(attemptReplayContinuousQueuedEventInMap);
}

function scheduleCallbackIfUnblocked(queuedEvent, unblocked) {
  if (queuedEvent.blockedOn === unblocked) {
    queuedEvent.blockedOn = null;

    if (!hasScheduledReplayAttempt) {
      hasScheduledReplayAttempt = true; // Schedule a callback to attempt replaying as many events as are
      // now unblocked. This first might not actually be unblocked yet.
      // We could check it early to avoid scheduling an unnecessary callback.

      Scheduler.unstable_scheduleCallback(Scheduler.unstable_NormalPriority, replayUnblockedEvents);
    }
  }
} // [form, submitter or action, formData...]


let lastScheduledReplayQueue = null;

function replayUnblockedFormActions(formReplayingQueue) {
  if (lastScheduledReplayQueue === formReplayingQueue) {
    lastScheduledReplayQueue = null;
  }

  for (let i = 0; i < formReplayingQueue.length; i += 3) {
    const form = formReplayingQueue[i];
    const submitterOrAction = formReplayingQueue[i + 1];
    const formData = formReplayingQueue[i + 2];

    if (typeof submitterOrAction !== 'function') {
      // This action is not hydrated yet. This might be because it's blocked on
      // a different React instance or higher up our tree.
      const blockedOn = findInstanceBlockingTarget(submitterOrAction || form);

      if (blockedOn === null) {
        // We're not blocked but we don't have an action. This must mean that
        // this is in another React instance. We'll just skip past it.
        continue;
      } else {
        // We're blocked on something in this React instance. We'll retry later.
        break;
      }
    }

    const formInst = getInstanceFromNode(form);

    if (formInst !== null) {
      // This is part of our instance.
      // We're ready to replay this. Let's delete it from the queue.
      formReplayingQueue.splice(i, 3);
      i -= 3;
      dispatchReplayedFormAction(formInst, form, submitterOrAction, formData); // Continue without incrementing the index.

      continue;
    } // This form must've been part of a different React instance.
    // If we want to preserve ordering between React instances on the same root
    // we'd need some way for the other instance to ping us when it's done.
    // We'll just skip this and let the other instance execute it.

  }
}

function scheduleReplayQueueIfNeeded(formReplayingQueue) {
  // Schedule a callback to execute any unblocked form actions in.
  // We only keep track of the last queue which means that if multiple React oscillate
  // commits, we could schedule more callbacks than necessary but it's not a big deal
  // and we only really except one instance.
  if (lastScheduledReplayQueue !== formReplayingQueue) {
    lastScheduledReplayQueue = formReplayingQueue;
    Scheduler.unstable_scheduleCallback(Scheduler.unstable_NormalPriority, () => replayUnblockedFormActions(formReplayingQueue));
  }
}

function retryIfBlockedOn(unblocked) {
  if (queuedFocus !== null) {
    scheduleCallbackIfUnblocked(queuedFocus, unblocked);
  }

  if (queuedDrag !== null) {
    scheduleCallbackIfUnblocked(queuedDrag, unblocked);
  }

  if (queuedMouse !== null) {
    scheduleCallbackIfUnblocked(queuedMouse, unblocked);
  }

  const unblock = queuedEvent => scheduleCallbackIfUnblocked(queuedEvent, unblocked);

  queuedPointers.forEach(unblock);
  queuedPointerCaptures.forEach(unblock);

  for (let i = 0; i < queuedExplicitHydrationTargets.length; i++) {
    const queuedTarget = queuedExplicitHydrationTargets[i];

    if (queuedTarget.blockedOn === unblocked) {
      queuedTarget.blockedOn = null;
    }
  }

  while (queuedExplicitHydrationTargets.length > 0) {
    const nextExplicitTarget = queuedExplicitHydrationTargets[0];

    if (nextExplicitTarget.blockedOn !== null) {
      // We're still blocked.
      break;
    } else {
      attemptExplicitHydrationTarget(nextExplicitTarget);

      if (nextExplicitTarget.blockedOn === null) {
        // We're unblocked.
        queuedExplicitHydrationTargets.shift();
      }
    }
  }

  {
    // Check the document if there are any queued form actions.
    const root = unblocked.getRootNode();
    const formReplayingQueue = root.$$reactFormReplay;

    if (formReplayingQueue != null) {
      for (let i = 0; i < formReplayingQueue.length; i += 3) {
        const form = formReplayingQueue[i];
        const submitterOrAction = formReplayingQueue[i + 1];
        const formProps = getFiberCurrentPropsFromNode(form);

        if (typeof submitterOrAction === 'function') {
          // This action has already resolved. We're just waiting to dispatch it.
          if (!formProps) {
            // This was not part of this React instance. It might have been recently
            // unblocking us from dispatching our events. So let's make sure we schedule
            // a retry.
            scheduleReplayQueueIfNeeded(formReplayingQueue);
          }

          continue;
        }

        let target = form;

        if (formProps) {
          // This form belongs to this React instance but the submitter might
          // not be done yet.
          let action = null;
          const submitter = submitterOrAction;

          if (submitter && submitter.hasAttribute('formAction')) {
            // The submitter is the one that is responsible for the action.
            target = submitter;
            const submitterProps = getFiberCurrentPropsFromNode(submitter);

            if (submitterProps) {
              // The submitter is part of this instance.
              action = submitterProps.formAction;
            } else {
              const blockedOn = findInstanceBlockingTarget(target);

              if (blockedOn !== null) {
                // The submitter is not hydrated yet. We'll wait for it.
                continue;
              } // The submitter must have been a part of a different React instance.
              // Except the form isn't. We don't dispatch actions in this scenario.

            }
          } else {
            action = formProps.action;
          }

          if (typeof action === 'function') {
            formReplayingQueue[i + 1] = action;
          } else {
            // Something went wrong so let's just delete this action.
            formReplayingQueue.splice(i, 3);
            i -= 3;
          } // Schedule a replay in case this unblocked something.


          scheduleReplayQueueIfNeeded(formReplayingQueue);
          continue;
        } // Something above this target is still blocked so we can't continue yet.
        // We're not sure if this target is actually part of this React instance
        // yet. It could be a different React as a child but at least some parent is.
        // We must continue for any further queued actions.

      }
    }
  }
}

const ReactCurrentBatchConfig = ReactSharedInternals.ReactCurrentBatchConfig; // TODO: can we stop exporting these?

let _enabled = true; // This is exported in FB builds for use by legacy FB layer infra.
// We'd like to remove this but it's not clear if this is safe.

function setEnabled(enabled) {
  _enabled = !!enabled;
}
function isEnabled() {
  return _enabled;
}
function createEventListenerWrapperWithPriority(targetContainer, domEventName, eventSystemFlags) {
  const eventPriority = getEventPriority(domEventName);
  let listenerWrapper;

  switch (eventPriority) {
    case DiscreteEventPriority:
      listenerWrapper = dispatchDiscreteEvent;
      break;

    case ContinuousEventPriority:
      listenerWrapper = dispatchContinuousEvent;
      break;

    case DefaultEventPriority:
    default:
      listenerWrapper = dispatchEvent;
      break;
  }

  return listenerWrapper.bind(null, domEventName, eventSystemFlags, targetContainer);
}

function dispatchDiscreteEvent(domEventName, eventSystemFlags, container, nativeEvent) {
  const previousPriority = getCurrentUpdatePriority();
  const prevTransition = ReactCurrentBatchConfig.transition;
  ReactCurrentBatchConfig.transition = null;

  try {
    setCurrentUpdatePriority(DiscreteEventPriority);
    dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
  } finally {
    setCurrentUpdatePriority(previousPriority);
    ReactCurrentBatchConfig.transition = prevTransition;
  }
}

function dispatchContinuousEvent(domEventName, eventSystemFlags, container, nativeEvent) {
  const previousPriority = getCurrentUpdatePriority();
  const prevTransition = ReactCurrentBatchConfig.transition;
  ReactCurrentBatchConfig.transition = null;

  try {
    setCurrentUpdatePriority(ContinuousEventPriority);
    dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
  } finally {
    setCurrentUpdatePriority(previousPriority);
    ReactCurrentBatchConfig.transition = prevTransition;
  }
}

function dispatchEvent(domEventName, eventSystemFlags, targetContainer, nativeEvent) {
  if (!_enabled) {
    return;
  }

  let blockedOn = findInstanceBlockingEvent(nativeEvent);

  if (blockedOn === null) {
    dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, return_targetInst, targetContainer);
    clearIfContinuousEvent(domEventName, nativeEvent);
    return;
  }

  if (queueIfContinuousEvent(blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent)) {
    nativeEvent.stopPropagation();
    return;
  } // We need to clear only if we didn't queue because
  // queueing is accumulative.


  clearIfContinuousEvent(domEventName, nativeEvent);

  if (eventSystemFlags & IS_CAPTURE_PHASE && isDiscreteEventThatRequiresHydration(domEventName)) {
    while (blockedOn !== null) {
      const fiber = getInstanceFromNode(blockedOn);

      if (fiber !== null) {
        attemptSynchronousHydration(fiber);
      }

      const nextBlockedOn = findInstanceBlockingEvent(nativeEvent);

      if (nextBlockedOn === null) {
        dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, return_targetInst, targetContainer);
      }

      if (nextBlockedOn === blockedOn) {
        break;
      }

      blockedOn = nextBlockedOn;
    }

    if (blockedOn !== null) {
      nativeEvent.stopPropagation();
    }

    return;
  } // This is not replayable so we'll invoke it but without a target,
  // in case the event system needs to trace it.


  dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, null, targetContainer);
}
function findInstanceBlockingEvent(nativeEvent) {
  const nativeEventTarget = getEventTarget(nativeEvent);
  return findInstanceBlockingTarget(nativeEventTarget);
}
let return_targetInst = null; // Returns a SuspenseInstance or Container if it's blocked.
// The return_targetInst field above is conceptually part of the return value.

function findInstanceBlockingTarget(targetNode) {
  // TODO: Warn if _enabled is false.
  return_targetInst = null;
  let targetInst = getClosestInstanceFromNode(targetNode);

  if (targetInst !== null) {
    const nearestMounted = getNearestMountedFiber(targetInst);

    if (nearestMounted === null) {
      // This tree has been unmounted already. Dispatch without a target.
      targetInst = null;
    } else {
      const tag = nearestMounted.tag;

      if (tag === SuspenseComponent) {
        const instance = getSuspenseInstanceFromFiber(nearestMounted);

        if (instance !== null) {
          // Queue the event to be replayed later. Abort dispatching since we
          // don't want this event dispatched twice through the event system.
          // TODO: If this is the first discrete event in the queue. Schedule an increased
          // priority for this boundary.
          return instance;
        } // This shouldn't happen, something went wrong but to avoid blocking
        // the whole system, dispatch the event without a target.
        // TODO: Warn.


        targetInst = null;
      } else if (tag === HostRoot) {
        const root = nearestMounted.stateNode;

        if (isRootDehydrated(root)) {
          // If this happens during a replay something went wrong and it might block
          // the whole system.
          return getContainerFromFiber(nearestMounted);
        }

        targetInst = null;
      } else if (nearestMounted !== targetInst) {
        // If we get an event (ex: img onload) before committing that
        // component's mount, ignore it for now (that is, treat it as if it was an
        // event on a non-React tree). We might also consider queueing events and
        // dispatching them after the mount.
        targetInst = null;
      }
    }
  }

  return_targetInst = targetInst; // We're not blocked on anything.

  return null;
}
function getEventPriority(domEventName) {
  switch (domEventName) {
    // Used by SimpleEventPlugin:
    case 'cancel':
    case 'click':
    case 'close':
    case 'contextmenu':
    case 'copy':
    case 'cut':
    case 'auxclick':
    case 'dblclick':
    case 'dragend':
    case 'dragstart':
    case 'drop':
    case 'focusin':
    case 'focusout':
    case 'input':
    case 'invalid':
    case 'keydown':
    case 'keypress':
    case 'keyup':
    case 'mousedown':
    case 'mouseup':
    case 'paste':
    case 'pause':
    case 'play':
    case 'pointercancel':
    case 'pointerdown':
    case 'pointerup':
    case 'ratechange':
    case 'reset':
    case 'resize':
    case 'seeked':
    case 'submit':
    case 'touchcancel':
    case 'touchend':
    case 'touchstart':
    case 'volumechange': // Used by polyfills: (fall through)

    case 'change':
    case 'selectionchange':
    case 'textInput':
    case 'compositionstart':
    case 'compositionend':
    case 'compositionupdate': // Only enableCreateEventHandleAPI: (fall through)

    case 'beforeblur':
    case 'afterblur': // Not used by React but could be by user code: (fall through)

    case 'beforeinput':
    case 'blur':
    case 'fullscreenchange':
    case 'focus':
    case 'hashchange':
    case 'popstate':
    case 'select':
    case 'selectstart':
      return DiscreteEventPriority;

    case 'drag':
    case 'dragenter':
    case 'dragexit':
    case 'dragleave':
    case 'dragover':
    case 'mousemove':
    case 'mouseout':
    case 'mouseover':
    case 'pointermove':
    case 'pointerout':
    case 'pointerover':
    case 'scroll':
    case 'toggle':
    case 'touchmove':
    case 'wheel': // Not used by React but could be by user code: (fall through)

    case 'mouseenter':
    case 'mouseleave':
    case 'pointerenter':
    case 'pointerleave':
      return ContinuousEventPriority;

    case 'message':
      {
        // We might be in the Scheduler callback.
        // Eventually this mechanism will be replaced by a check
        // of the current priority on the native scheduler.
        const schedulerPriority = getCurrentPriorityLevel();

        switch (schedulerPriority) {
          case ImmediatePriority:
            return DiscreteEventPriority;

          case UserBlockingPriority:
            return ContinuousEventPriority;

          case NormalPriority$1:
          case LowPriority:
            // TODO: Handle LowSchedulerPriority, somehow. Maybe the same lane as hydration.
            return DefaultEventPriority;

          case IdlePriority:
            return IdleEventPriority;

          default:
            return DefaultEventPriority;
        }
      }

    default:
      return DefaultEventPriority;
  }
}

function addEventBubbleListener(target, eventType, listener) {
  target.addEventListener(eventType, listener, false);
  return listener;
}
function addEventCaptureListener(target, eventType, listener) {
  target.addEventListener(eventType, listener, true);
  return listener;
}
function addEventCaptureListenerWithPassiveFlag(target, eventType, listener, passive) {
  target.addEventListener(eventType, listener, {
    capture: true,
    passive
  });
  return listener;
}
function addEventBubbleListenerWithPassiveFlag(target, eventType, listener, passive) {
  target.addEventListener(eventType, listener, {
    passive
  });
  return listener;
}

/**
 * These variables store information about text content of a target node,
 * allowing comparison of content before and after a given event.
 *
 * Identify the node where selection currently begins, then observe
 * both its text content and its current position in the DOM. Since the
 * browser may natively replace the target node during composition, we can
 * use its position to find its replacement.
 *
 *
 */
let root = null;
let startText = null;
let fallbackText = null;
function initialize(nativeEventTarget) {
  root = nativeEventTarget;
  startText = getText();
  return true;
}
function reset() {
  root = null;
  startText = null;
  fallbackText = null;
}
function getData() {
  if (fallbackText) {
    return fallbackText;
  }

  let start;
  const startValue = startText;
  const startLength = startValue.length;
  let end;
  const endValue = getText();
  const endLength = endValue.length;

  for (start = 0; start < startLength; start++) {
    if (startValue[start] !== endValue[start]) {
      break;
    }
  }

  const minEnd = startLength - start;

  for (end = 1; end <= minEnd; end++) {
    if (startValue[startLength - end] !== endValue[endLength - end]) {
      break;
    }
  }

  const sliceTail = end > 1 ? 1 - end : undefined;
  fallbackText = endValue.slice(start, sliceTail);
  return fallbackText;
}
function getText() {
  if ('value' in root) {
    return root.value;
  }

  return root.textContent;
}

const END_KEYCODES = [9, 13, 27, 32]; // Tab, Return, Esc, Space

const START_KEYCODE = 229;
const canUseCompositionEvent = canUseDOM && 'CompositionEvent' in window;
let documentMode = null;

if (canUseDOM && 'documentMode' in document) {
  documentMode = document.documentMode;
} // Webkit offers a very useful `textInput` event that can be used to
// directly represent `beforeInput`. The IE `textinput` event is not as
// useful, so we don't use it.


const canUseTextInputEvent = canUseDOM && 'TextEvent' in window && !documentMode; // In IE9+, we have access to composition events, but the data supplied
// by the native compositionend event may be incorrect. Japanese ideographic
// spaces, for instance (\u3000) are not recorded correctly.

const useFallbackCompositionData = canUseDOM && (!canUseCompositionEvent || documentMode && documentMode > 8 && documentMode <= 11);
const SPACEBAR_CODE = 32;
const SPACEBAR_CHAR = String.fromCharCode(SPACEBAR_CODE);

function registerEvents$3() {
  registerTwoPhaseEvent('onBeforeInput', ['compositionend', 'keypress', 'textInput', 'paste']);
  registerTwoPhaseEvent('onCompositionEnd', ['compositionend', 'focusout', 'keydown', 'keypress', 'keyup', 'mousedown']);
  registerTwoPhaseEvent('onCompositionStart', ['compositionstart', 'focusout', 'keydown', 'keypress', 'keyup', 'mousedown']);
  registerTwoPhaseEvent('onCompositionUpdate', ['compositionupdate', 'focusout', 'keydown', 'keypress', 'keyup', 'mousedown']);
} // Track whether we've ever handled a keypress on the space key.


let hasSpaceKeypress = false;
/**
 * Return whether a native keypress event is assumed to be a command.
 * This is required because Firefox fires `keypress` events for key commands
 * (cut, copy, select-all, etc.) even though no character is inserted.
 */

function isKeypressCommand(nativeEvent) {
  return (nativeEvent.ctrlKey || nativeEvent.altKey || nativeEvent.metaKey) && // ctrlKey && altKey is equivalent to AltGr, and is not a command.
  !(nativeEvent.ctrlKey && nativeEvent.altKey);
}
/**
 * Translate native top level events into event types.
 */


function getCompositionEventType(domEventName) {
  switch (domEventName) {
    case 'compositionstart':
      return 'onCompositionStart';

    case 'compositionend':
      return 'onCompositionEnd';

    case 'compositionupdate':
      return 'onCompositionUpdate';
  }
}
/**
 * Does our fallback best-guess model think this event signifies that
 * composition has begun?
 */


function isFallbackCompositionStart(domEventName, nativeEvent) {
  return domEventName === 'keydown' && nativeEvent.keyCode === START_KEYCODE;
}
/**
 * Does our fallback mode think that this event is the end of composition?
 */


function isFallbackCompositionEnd(domEventName, nativeEvent) {
  switch (domEventName) {
    case 'keyup':
      // Command keys insert or clear IME input.
      return END_KEYCODES.indexOf(nativeEvent.keyCode) !== -1;

    case 'keydown':
      // Expect IME keyCode on each keydown. If we get any other
      // code we must have exited earlier.
      return nativeEvent.keyCode !== START_KEYCODE;

    case 'keypress':
    case 'mousedown':
    case 'focusout':
      // Events are not possible without cancelling IME.
      return true;

    default:
      return false;
  }
}
/**
 * Google Input Tools provides composition data via a CustomEvent,
 * with the `data` property populated in the `detail` object. If this
 * is available on the event object, use it. If not, this is a plain
 * composition event and we have nothing special to extract.
 *
 * @param {object} nativeEvent
 * @return {?string}
 */


function getDataFromCustomEvent(nativeEvent) {
  const detail = nativeEvent.detail;

  if (typeof detail === 'object' && 'data' in detail) {
    return detail.data;
  }

  return null;
}
/**
 * Check if a composition event was triggered by Korean IME.
 * Our fallback mode does not work well with IE's Korean IME,
 * so just use native composition events when Korean IME is used.
 * Although CompositionEvent.locale property is deprecated,
 * it is available in IE, where our fallback mode is enabled.
 *
 * @param {object} nativeEvent
 * @return {boolean}
 */


function isUsingKoreanIME(nativeEvent) {
  return nativeEvent.locale === 'ko';
} // Track the current IME composition status, if any.


let isComposing = false;
/**
 * @return {?object} A SyntheticCompositionEvent.
 */

function extractCompositionEvent(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget) {
  let eventType;
  let fallbackData;

  if (canUseCompositionEvent) {
    eventType = getCompositionEventType(domEventName);
  } else if (!isComposing) {
    if (isFallbackCompositionStart(domEventName, nativeEvent)) {
      eventType = 'onCompositionStart';
    }
  } else if (isFallbackCompositionEnd(domEventName, nativeEvent)) {
    eventType = 'onCompositionEnd';
  }

  if (!eventType) {
    return null;
  }

  if (useFallbackCompositionData && !isUsingKoreanIME(nativeEvent)) {
    // The current composition is stored statically and must not be
    // overwritten while composition continues.
    if (!isComposing && eventType === 'onCompositionStart') {
      isComposing = initialize(nativeEventTarget);
    } else if (eventType === 'onCompositionEnd') {
      if (isComposing) {
        fallbackData = getData();
      }
    }
  }

  const listeners = accumulateTwoPhaseListeners(targetInst, eventType);

  if (listeners.length > 0) {
    const event = new SyntheticCompositionEvent(eventType, domEventName, null, nativeEvent, nativeEventTarget);
    dispatchQueue.push({
      event,
      listeners
    });

    if (fallbackData) {
      // Inject data generated from fallback path into the synthetic event.
      // This matches the property of native CompositionEventInterface.
      // $FlowFixMe[incompatible-use]
      event.data = fallbackData;
    } else {
      const customData = getDataFromCustomEvent(nativeEvent);

      if (customData !== null) {
        // $FlowFixMe[incompatible-use]
        event.data = customData;
      }
    }
  }
}

function getNativeBeforeInputChars(domEventName, nativeEvent) {
  switch (domEventName) {
    case 'compositionend':
      return getDataFromCustomEvent(nativeEvent);

    case 'keypress':
      /**
       * If native `textInput` events are available, our goal is to make
       * use of them. However, there is a special case: the spacebar key.
       * In Webkit, preventing default on a spacebar `textInput` event
       * cancels character insertion, but it *also* causes the browser
       * to fall back to its default spacebar behavior of scrolling the
       * page.
       *
       * Tracking at:
       * https://code.google.com/p/chromium/issues/detail?id=355103
       *
       * To avoid this issue, use the keypress event as if no `textInput`
       * event is available.
       */
      const which = nativeEvent.which;

      if (which !== SPACEBAR_CODE) {
        return null;
      }

      hasSpaceKeypress = true;
      return SPACEBAR_CHAR;

    case 'textInput':
      // Record the characters to be added to the DOM.
      const chars = nativeEvent.data; // If it's a spacebar character, assume that we have already handled
      // it at the keypress level and bail immediately. Android Chrome
      // doesn't give us keycodes, so we need to ignore it.

      if (chars === SPACEBAR_CHAR && hasSpaceKeypress) {
        return null;
      }

      return chars;

    default:
      // For other native event types, do nothing.
      return null;
  }
}
/**
 * For browsers that do not provide the `textInput` event, extract the
 * appropriate string to use for SyntheticInputEvent.
 */


function getFallbackBeforeInputChars(domEventName, nativeEvent) {
  // If we are currently composing (IME) and using a fallback to do so,
  // try to extract the composed characters from the fallback object.
  // If composition event is available, we extract a string only at
  // compositionevent, otherwise extract it at fallback events.
  if (isComposing) {
    if (domEventName === 'compositionend' || !canUseCompositionEvent && isFallbackCompositionEnd(domEventName, nativeEvent)) {
      const chars = getData();
      reset();
      isComposing = false;
      return chars;
    }

    return null;
  }

  switch (domEventName) {
    case 'paste':
      // If a paste event occurs after a keypress, throw out the input
      // chars. Paste events should not lead to BeforeInput events.
      return null;

    case 'keypress':
      /**
       * As of v27, Firefox may fire keypress events even when no character
       * will be inserted. A few possibilities:
       *
       * - `which` is `0`. Arrow keys, Esc key, etc.
       *
       * - `which` is the pressed key code, but no char is available.
       *   Ex: 'AltGr + d` in Polish. There is no modified character for
       *   this key combination and no character is inserted into the
       *   document, but FF fires the keypress for char code `100` anyway.
       *   No `input` event will occur.
       *
       * - `which` is the pressed key code, but a command combination is
       *   being used. Ex: `Cmd+C`. No character is inserted, and no
       *   `input` event will occur.
       */
      if (!isKeypressCommand(nativeEvent)) {
        // IE fires the `keypress` event when a user types an emoji via
        // Touch keyboard of Windows.  In such a case, the `char` property
        // holds an emoji character like `\uD83D\uDE0A`.  Because its length
        // is 2, the property `which` does not represent an emoji correctly.
        // In such a case, we directly return the `char` property instead of
        // using `which`.
        if (nativeEvent.char && nativeEvent.char.length > 1) {
          return nativeEvent.char;
        } else if (nativeEvent.which) {
          return String.fromCharCode(nativeEvent.which);
        }
      }

      return null;

    case 'compositionend':
      return useFallbackCompositionData && !isUsingKoreanIME(nativeEvent) ? null : nativeEvent.data;

    default:
      return null;
  }
}
/**
 * Extract a SyntheticInputEvent for `beforeInput`, based on either native
 * `textInput` or fallback behavior.
 *
 * @return {?object} A SyntheticInputEvent.
 */


function extractBeforeInputEvent(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget) {
  let chars;

  if (canUseTextInputEvent) {
    chars = getNativeBeforeInputChars(domEventName, nativeEvent);
  } else {
    chars = getFallbackBeforeInputChars(domEventName, nativeEvent);
  } // If no characters are being inserted, no BeforeInput event should
  // be fired.


  if (!chars) {
    return null;
  }

  const listeners = accumulateTwoPhaseListeners(targetInst, 'onBeforeInput');

  if (listeners.length > 0) {
    const event = new SyntheticInputEvent('onBeforeInput', 'beforeinput', null, nativeEvent, nativeEventTarget);
    dispatchQueue.push({
      event,
      listeners
    }); // $FlowFixMe[incompatible-use]

    event.data = chars;
  }
}
/**
 * Create an `onBeforeInput` event to match
 * http://www.w3.org/TR/2013/WD-DOM-Level-3-Events-20131105/#events-inputevents.
 *
 * This event plugin is based on the native `textInput` event
 * available in Chrome, Safari, Opera, and IE. This event fires after
 * `onKeyPress` and `onCompositionEnd`, but before `onInput`.
 *
 * `beforeInput` is spec'd but not implemented in any browsers, and
 * the `input` event does not provide any useful information about what has
 * actually been added, contrary to the spec. Thus, `textInput` is the best
 * available event to identify the characters that have actually been inserted
 * into the target node.
 *
 * This plugin is also responsible for emitting `composition` events, thus
 * allowing us to share composition fallback code for both `beforeInput` and
 * `composition` event types.
 */


function extractEvents$5(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget, eventSystemFlags, targetContainer) {
  extractCompositionEvent(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget);
  extractBeforeInputEvent(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget);
}

/**
 * @see http://www.whatwg.org/specs/web-apps/current-work/multipage/the-input-element.html#input-type-attr-summary
 */
const supportedInputTypes = {
  color: true,
  date: true,
  datetime: true,
  'datetime-local': true,
  email: true,
  month: true,
  number: true,
  password: true,
  range: true,
  search: true,
  tel: true,
  text: true,
  time: true,
  url: true,
  week: true
};

function isTextInputElement(elem) {
  const nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase();

  if (nodeName === 'input') {
    return !!supportedInputTypes[elem.type];
  }

  if (nodeName === 'textarea') {
    return true;
  }

  return false;
}

/**
 * Checks if an event is supported in the current execution environment.
 *
 * NOTE: This will not work correctly for non-generic events such as `change`,
 * `reset`, `load`, `error`, and `select`.
 *
 * Borrows from Modernizr.
 *
 * @param {string} eventNameSuffix Event name, e.g. "click".
 * @return {boolean} True if the event is supported.
 * @internal
 * @license Modernizr 3.0.0pre (Custom Build) | MIT
 */

function isEventSupported(eventNameSuffix) {
  if (!canUseDOM) {
    return false;
  }

  const eventName = 'on' + eventNameSuffix;
  let isSupported = (eventName in document);

  if (!isSupported) {
    const element = document.createElement('div');
    element.setAttribute(eventName, 'return;');
    isSupported = typeof element[eventName] === 'function';
  }

  return isSupported;
}

function registerEvents$2() {
  registerTwoPhaseEvent('onChange', ['change', 'click', 'focusin', 'focusout', 'input', 'keydown', 'keyup', 'selectionchange']);
}

function createAndAccumulateChangeEvent(dispatchQueue, inst, nativeEvent, target) {
  // Flag this event loop as needing state restore.
  enqueueStateRestore(target);
  const listeners = accumulateTwoPhaseListeners(inst, 'onChange');

  if (listeners.length > 0) {
    const event = new SyntheticEvent('onChange', 'change', null, nativeEvent, target);
    dispatchQueue.push({
      event,
      listeners
    });
  }
}
/**
 * For IE shims
 */


let activeElement$1 = null;
let activeElementInst$1 = null;
/**
 * SECTION: handle `change` event
 */

function shouldUseChangeEvent(elem) {
  const nodeName = elem.nodeName && elem.nodeName.toLowerCase();
  return nodeName === 'select' || nodeName === 'input' && elem.type === 'file';
}

function manualDispatchChangeEvent(nativeEvent) {
  const dispatchQueue = [];
  createAndAccumulateChangeEvent(dispatchQueue, activeElementInst$1, nativeEvent, getEventTarget(nativeEvent)); // If change and propertychange bubbled, we'd just bind to it like all the
  // other events and have it go through ReactBrowserEventEmitter. Since it
  // doesn't, we manually listen for the events and so we have to enqueue and
  // process the abstract event manually.
  //
  // Batching is necessary here in order to ensure that all event handlers run
  // before the next rerender (including event handlers attached to ancestor
  // elements instead of directly on the input). Without this, controlled
  // components don't work properly in conjunction with event bubbling because
  // the component is rerendered and the value reverted before all the event
  // handlers can run. See https://github.com/facebook/react/issues/708.

  batchedUpdates(runEventInBatch, dispatchQueue);
}

function runEventInBatch(dispatchQueue) {
  processDispatchQueue(dispatchQueue, 0);
}

function getInstIfValueChanged(targetInst) {
  const targetNode = getNodeFromInstance(targetInst);

  if (updateValueIfChanged(targetNode)) {
    return targetInst;
  }
}

function getTargetInstForChangeEvent(domEventName, targetInst) {
  if (domEventName === 'change') {
    return targetInst;
  }
}
/**
 * SECTION: handle `input` event
 */


let isInputEventSupported = false;

if (canUseDOM) {
  // IE9 claims to support the input event but fails to trigger it when
  // deleting text, so we ignore its input events.
  isInputEventSupported = isEventSupported('input') && (!document.documentMode || document.documentMode > 9);
}
/**
 * (For IE <=9) Starts tracking propertychange events on the passed-in element
 * and override the value property so that we can distinguish user events from
 * value changes in JS.
 */


function startWatchingForValueChange(target, targetInst) {
  activeElement$1 = target;
  activeElementInst$1 = targetInst;
  activeElement$1.attachEvent('onpropertychange', handlePropertyChange);
}
/**
 * (For IE <=9) Removes the event listeners from the currently-tracked element,
 * if any exists.
 */


function stopWatchingForValueChange() {
  if (!activeElement$1) {
    return;
  }

  activeElement$1.detachEvent('onpropertychange', handlePropertyChange);
  activeElement$1 = null;
  activeElementInst$1 = null;
}
/**
 * (For IE <=9) Handles a propertychange event, sending a `change` event if
 * the value of the active element has changed.
 */
// $FlowFixMe[missing-local-annot]


function handlePropertyChange(nativeEvent) {
  if (nativeEvent.propertyName !== 'value') {
    return;
  }

  if (getInstIfValueChanged(activeElementInst$1)) {
    manualDispatchChangeEvent(nativeEvent);
  }
}

function handleEventsForInputEventPolyfill(domEventName, target, targetInst) {
  if (domEventName === 'focusin') {
    // In IE9, propertychange fires for most input events but is buggy and
    // doesn't fire when text is deleted, but conveniently, selectionchange
    // appears to fire in all of the remaining cases so we catch those and
    // forward the event if the value has changed
    // In either case, we don't want to call the event handler if the value
    // is changed from JS so we redefine a setter for `.value` that updates
    // our activeElementValue variable, allowing us to ignore those changes
    //
    // stopWatching() should be a noop here but we call it just in case we
    // missed a blur event somehow.
    stopWatchingForValueChange();
    startWatchingForValueChange(target, targetInst);
  } else if (domEventName === 'focusout') {
    stopWatchingForValueChange();
  }
} // For IE8 and IE9.


function getTargetInstForInputEventPolyfill(domEventName, targetInst) {
  if (domEventName === 'selectionchange' || domEventName === 'keyup' || domEventName === 'keydown') {
    // On the selectionchange event, the target is just document which isn't
    // helpful for us so just check activeElement instead.
    //
    // 99% of the time, keydown and keyup aren't necessary. IE8 fails to fire
    // propertychange on the first input event after setting `value` from a
    // script and fires only keydown, keypress, keyup. Catching keyup usually
    // gets it and catching keydown lets us fire an event for the first
    // keystroke if user does a key repeat (it'll be a little delayed: right
    // before the second keystroke). Other input methods (e.g., paste) seem to
    // fire selectionchange normally.
    return getInstIfValueChanged(activeElementInst$1);
  }
}
/**
 * SECTION: handle `click` event
 */


function shouldUseClickEvent(elem) {
  // Use the `click` event to detect changes to checkbox and radio inputs.
  // This approach works across all browsers, whereas `change` does not fire
  // until `blur` in IE8.
  const nodeName = elem.nodeName;
  return nodeName && nodeName.toLowerCase() === 'input' && (elem.type === 'checkbox' || elem.type === 'radio');
}

function getTargetInstForClickEvent(domEventName, targetInst) {
  if (domEventName === 'click') {
    return getInstIfValueChanged(targetInst);
  }
}

function getTargetInstForInputOrChangeEvent(domEventName, targetInst) {
  if (domEventName === 'input' || domEventName === 'change') {
    return getInstIfValueChanged(targetInst);
  }
}

function handleControlledInputBlur(node, props) {
  if (node.type !== 'number') {
    return;
  }

  {
    const isControlled = props.value != null;

    if (isControlled) {
      // If controlled, assign the value attribute to the current value on blur
      setDefaultValue(node, 'number', node.value);
    }
  }
}
/**
 * This plugin creates an `onChange` event that normalizes change events
 * across form elements. This event fires at a time when it's possible to
 * change the element's value without seeing a flicker.
 *
 * Supported elements are:
 * - input (see `isTextInputElement`)
 * - textarea
 * - select
 */


function extractEvents$4(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget, eventSystemFlags, targetContainer) {
  const targetNode = targetInst ? getNodeFromInstance(targetInst) : window;
  let getTargetInstFunc, handleEventFunc;

  if (shouldUseChangeEvent(targetNode)) {
    getTargetInstFunc = getTargetInstForChangeEvent;
  } else if (isTextInputElement(targetNode)) {
    if (isInputEventSupported) {
      getTargetInstFunc = getTargetInstForInputOrChangeEvent;
    } else {
      getTargetInstFunc = getTargetInstForInputEventPolyfill;
      handleEventFunc = handleEventsForInputEventPolyfill;
    }
  } else if (shouldUseClickEvent(targetNode)) {
    getTargetInstFunc = getTargetInstForClickEvent;
  } else if (targetInst && isCustomElement(targetInst.elementType)) {
    getTargetInstFunc = getTargetInstForChangeEvent;
  }

  if (getTargetInstFunc) {
    const inst = getTargetInstFunc(domEventName, targetInst);

    if (inst) {
      createAndAccumulateChangeEvent(dispatchQueue, inst, nativeEvent, nativeEventTarget);
      return;
    }
  }

  if (handleEventFunc) {
    handleEventFunc(domEventName, targetNode, targetInst);
  } // When blurring, set the value attribute for number inputs


  if (domEventName === 'focusout' && targetInst) {
    // These props aren't necessarily the most current but we warn for changing
    // between controlled and uncontrolled, so it doesn't matter and the previous
    // code was also broken for changes.
    const props = targetInst.memoizedProps;
    handleControlledInputBlur(targetNode, props);
  }
}

function registerEvents$1() {
  registerDirectEvent('onMouseEnter', ['mouseout', 'mouseover']);
  registerDirectEvent('onMouseLeave', ['mouseout', 'mouseover']);
  registerDirectEvent('onPointerEnter', ['pointerout', 'pointerover']);
  registerDirectEvent('onPointerLeave', ['pointerout', 'pointerover']);
}
/**
 * For almost every interaction we care about, there will be both a top-level
 * `mouseover` and `mouseout` event that occurs. Only use `mouseout` so that
 * we do not extract duplicate events. However, moving the mouse into the
 * browser from outside will not fire a `mouseout` event. In this case, we use
 * the `mouseover` top-level event.
 */


function extractEvents$3(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget, eventSystemFlags, targetContainer) {
  const isOverEvent = domEventName === 'mouseover' || domEventName === 'pointerover';
  const isOutEvent = domEventName === 'mouseout' || domEventName === 'pointerout';

  if (isOverEvent && !isReplayingEvent(nativeEvent)) {
    // If this is an over event with a target, we might have already dispatched
    // the event in the out event of the other target. If this is replayed,
    // then it's because we couldn't dispatch against this target previously
    // so we have to do it now instead.
    const related = nativeEvent.relatedTarget || nativeEvent.fromElement;

    if (related) {
      // If the related node is managed by React, we can assume that we have
      // already dispatched the corresponding events during its mouseout.
      if (getClosestInstanceFromNode(related) || isContainerMarkedAsRoot(related)) {
        return;
      }
    }
  }

  if (!isOutEvent && !isOverEvent) {
    // Must not be a mouse or pointer in or out - ignoring.
    return;
  }

  let win; // TODO: why is this nullable in the types but we read from it?

  if (nativeEventTarget.window === nativeEventTarget) {
    // `nativeEventTarget` is probably a window object.
    win = nativeEventTarget;
  } else {
    // TODO: Figure out why `ownerDocument` is sometimes undefined in IE8.
    const doc = nativeEventTarget.ownerDocument;

    if (doc) {
      win = doc.defaultView || doc.parentWindow;
    } else {
      win = window;
    }
  }

  let from;
  let to;

  if (isOutEvent) {
    const related = nativeEvent.relatedTarget || nativeEvent.toElement;
    from = targetInst;
    to = related ? getClosestInstanceFromNode(related) : null;

    if (to !== null) {
      const nearestMounted = getNearestMountedFiber(to);
      const tag = to.tag;

      if (to !== nearestMounted || tag !== HostComponent && (tag !== HostSingleton) && tag !== HostText) {
        to = null;
      }
    }
  } else {
    // Moving to a node from outside the window.
    from = null;
    to = targetInst;
  }

  if (from === to) {
    // Nothing pertains to our managed components.
    return;
  }

  let SyntheticEventCtor = SyntheticMouseEvent;
  let leaveEventType = 'onMouseLeave';
  let enterEventType = 'onMouseEnter';
  let eventTypePrefix = 'mouse';

  if (domEventName === 'pointerout' || domEventName === 'pointerover') {
    SyntheticEventCtor = SyntheticPointerEvent;
    leaveEventType = 'onPointerLeave';
    enterEventType = 'onPointerEnter';
    eventTypePrefix = 'pointer';
  }

  const fromNode = from == null ? win : getNodeFromInstance(from);
  const toNode = to == null ? win : getNodeFromInstance(to);
  const leave = new SyntheticEventCtor(leaveEventType, eventTypePrefix + 'leave', from, nativeEvent, nativeEventTarget);
  leave.target = fromNode;
  leave.relatedTarget = toNode;
  let enter = null; // We should only process this nativeEvent if we are processing
  // the first ancestor. Next time, we will ignore the event.

  const nativeTargetInst = getClosestInstanceFromNode(nativeEventTarget);

  if (nativeTargetInst === targetInst) {
    const enterEvent = new SyntheticEventCtor(enterEventType, eventTypePrefix + 'enter', to, nativeEvent, nativeEventTarget);
    enterEvent.target = toNode;
    enterEvent.relatedTarget = fromNode;
    enter = enterEvent;
  }

  accumulateEnterLeaveTwoPhaseListeners(dispatchQueue, leave, enter, from, to);
}

/**
 * Given any node return the first leaf node without children.
 *
 * @param {DOMElement|DOMTextNode} node
 * @return {DOMElement|DOMTextNode}
 */

function getLeafNode(node) {
  while (node && node.firstChild) {
    node = node.firstChild;
  }

  return node;
}
/**
 * Get the next sibling within a container. This will walk up the
 * DOM if a node's siblings have been exhausted.
 *
 * @param {DOMElement|DOMTextNode} node
 * @return {?DOMElement|DOMTextNode}
 */


function getSiblingNode(node) {
  while (node) {
    if (node.nextSibling) {
      return node.nextSibling;
    }

    node = node.parentNode;
  }
}
/**
 * Get object describing the nodes which contain characters at offset.
 *
 * @param {DOMElement|DOMTextNode} root
 * @param {number} offset
 * @return {?object}
 */


function getNodeForCharacterOffset(root, offset) {
  let node = getLeafNode(root);
  let nodeStart = 0;
  let nodeEnd = 0;

  while (node) {
    if (node.nodeType === TEXT_NODE) {
      nodeEnd = nodeStart + node.textContent.length;

      if (nodeStart <= offset && nodeEnd >= offset) {
        return {
          node: node,
          offset: offset - nodeStart
        };
      }

      nodeStart = nodeEnd;
    }

    node = getLeafNode(getSiblingNode(node));
  }
}

/**
 * @param {DOMElement} outerNode
 * @return {?object}
 */

function getOffsets(outerNode) {
  const ownerDocument = outerNode.ownerDocument;
  const win = ownerDocument && ownerDocument.defaultView || window;
  const selection = win.getSelection && win.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const anchorNode = selection.anchorNode,
        anchorOffset = selection.anchorOffset,
        focusNode = selection.focusNode,
        focusOffset = selection.focusOffset; // In Firefox, anchorNode and focusNode can be "anonymous divs", e.g. the
  // up/down buttons on an <input type="number">. Anonymous divs do not seem to
  // expose properties, triggering a "Permission denied error" if any of its
  // properties are accessed. The only seemingly possible way to avoid erroring
  // is to access a property that typically works for non-anonymous divs and
  // catch any error that may otherwise arise. See
  // https://bugzilla.mozilla.org/show_bug.cgi?id=208427

  try {
    /* eslint-disable ft-flow/no-unused-expressions */
    anchorNode.nodeType;
    focusNode.nodeType;
    /* eslint-enable ft-flow/no-unused-expressions */
  } catch (e) {
    return null;
  }

  return getModernOffsetsFromPoints(outerNode, anchorNode, anchorOffset, focusNode, focusOffset);
}
/**
 * Returns {start, end} where `start` is the character/codepoint index of
 * (anchorNode, anchorOffset) within the textContent of `outerNode`, and
 * `end` is the index of (focusNode, focusOffset).
 *
 * Returns null if you pass in garbage input but we should probably just crash.
 *
 * Exported only for testing.
 */

function getModernOffsetsFromPoints(outerNode, anchorNode, anchorOffset, focusNode, focusOffset) {
  let length = 0;
  let start = -1;
  let end = -1;
  let indexWithinAnchor = 0;
  let indexWithinFocus = 0;
  let node = outerNode;
  let parentNode = null;

  outer: while (true) {
    let next = null;

    while (true) {
      if (node === anchorNode && (anchorOffset === 0 || node.nodeType === TEXT_NODE)) {
        start = length + anchorOffset;
      }

      if (node === focusNode && (focusOffset === 0 || node.nodeType === TEXT_NODE)) {
        end = length + focusOffset;
      }

      if (node.nodeType === TEXT_NODE) {
        length += node.nodeValue.length;
      }

      if ((next = node.firstChild) === null) {
        break;
      } // Moving from `node` to its first child `next`.


      parentNode = node;
      node = next;
    }

    while (true) {
      if (node === outerNode) {
        // If `outerNode` has children, this is always the second time visiting
        // it. If it has no children, this is still the first loop, and the only
        // valid selection is anchorNode and focusNode both equal to this node
        // and both offsets 0, in which case we will have handled above.
        break outer;
      }

      if (parentNode === anchorNode && ++indexWithinAnchor === anchorOffset) {
        start = length;
      }

      if (parentNode === focusNode && ++indexWithinFocus === focusOffset) {
        end = length;
      }

      if ((next = node.nextSibling) !== null) {
        break;
      }

      node = parentNode;
      parentNode = node.parentNode;
    } // Moving from `node` to its next sibling `next`.


    node = next;
  }

  if (start === -1 || end === -1) {
    // This should never happen. (Would happen if the anchor/focus nodes aren't
    // actually inside the passed-in node.)
    return null;
  }

  return {
    start: start,
    end: end
  };
}
/**
 * In modern non-IE browsers, we can support both forward and backward
 * selections.
 *
 * Note: IE10+ supports the Selection object, but it does not support
 * the `extend` method, which means that even in modern IE, it's not possible
 * to programmatically create a backward selection. Thus, for all IE
 * versions, we use the old IE API to create our selections.
 *
 * @param {DOMElement|DOMTextNode} node
 * @param {object} offsets
 */

function setOffsets(node, offsets) {
  const doc = node.ownerDocument || document;
  const win = doc && doc.defaultView || window; // Edge fails with "Object expected" in some scenarios.
  // (For instance: TinyMCE editor used in a list component that supports pasting to add more,
  // fails when pasting 100+ items)

  if (!win.getSelection) {
    return;
  }

  const selection = win.getSelection();
  const length = node.textContent.length;
  let start = Math.min(offsets.start, length);
  let end = offsets.end === undefined ? start : Math.min(offsets.end, length); // IE 11 uses modern selection, but doesn't support the extend method.
  // Flip backward selections, so we can set with a single range.

  if (!selection.extend && start > end) {
    const temp = end;
    end = start;
    start = temp;
  }

  const startMarker = getNodeForCharacterOffset(node, start);
  const endMarker = getNodeForCharacterOffset(node, end);

  if (startMarker && endMarker) {
    if (selection.rangeCount === 1 && selection.anchorNode === startMarker.node && selection.anchorOffset === startMarker.offset && selection.focusNode === endMarker.node && selection.focusOffset === endMarker.offset) {
      return;
    }

    const range = doc.createRange();
    range.setStart(startMarker.node, startMarker.offset);
    selection.removeAllRanges();

    if (start > end) {
      selection.addRange(range);
      selection.extend(endMarker.node, endMarker.offset);
    } else {
      range.setEnd(endMarker.node, endMarker.offset);
      selection.addRange(range);
    }
  }
}

function isTextNode(node) {
  return node && node.nodeType === TEXT_NODE;
}

function containsNode(outerNode, innerNode) {
  if (!outerNode || !innerNode) {
    return false;
  } else if (outerNode === innerNode) {
    return true;
  } else if (isTextNode(outerNode)) {
    return false;
  } else if (isTextNode(innerNode)) {
    return containsNode(outerNode, innerNode.parentNode);
  } else if ('contains' in outerNode) {
    return outerNode.contains(innerNode);
  } else if (outerNode.compareDocumentPosition) {
    return !!(outerNode.compareDocumentPosition(innerNode) & 16);
  } else {
    return false;
  }
}

function isInDocument(node) {
  return node && node.ownerDocument && containsNode(node.ownerDocument.documentElement, node);
}

function isSameOriginFrame(iframe) {
  try {
    // Accessing the contentDocument of a HTMLIframeElement can cause the browser
    // to throw, e.g. if it has a cross-origin src attribute.
    // Safari will show an error in the console when the access results in "Blocked a frame with origin". e.g:
    // iframe.contentDocument.defaultView;
    // A safety way is to access one of the cross origin properties: Window or Location
    // Which might result in "SecurityError" DOM Exception and it is compatible to Safari.
    // https://html.spec.whatwg.org/multipage/browsers.html#integration-with-idl
    return typeof iframe.contentWindow.location.href === 'string';
  } catch (err) {
    return false;
  }
}

function getActiveElementDeep() {
  let win = window;
  let element = getActiveElement();

  while (element instanceof win.HTMLIFrameElement) {
    if (isSameOriginFrame(element)) {
      win = element.contentWindow;
    } else {
      return element;
    }

    element = getActiveElement(win.document);
  }

  return element;
}
/**
 * @ReactInputSelection: React input selection module. Based on Selection.js,
 * but modified to be suitable for react and has a couple of bug fixes (doesn't
 * assume buttons have range selections allowed).
 * Input selection module for React.
 */

/**
 * @hasSelectionCapabilities: we get the element types that support selection
 * from https://html.spec.whatwg.org/#do-not-apply, looking at `selectionStart`
 * and `selectionEnd` rows.
 */


function hasSelectionCapabilities(elem) {
  const nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase();
  return nodeName && (nodeName === 'input' && (elem.type === 'text' || elem.type === 'search' || elem.type === 'tel' || elem.type === 'url' || elem.type === 'password') || nodeName === 'textarea' || elem.contentEditable === 'true');
}
function getSelectionInformation() {
  const focusedElem = getActiveElementDeep();
  return {
    focusedElem: focusedElem,
    selectionRange: hasSelectionCapabilities(focusedElem) ? getSelection$1(focusedElem) : null
  };
}
/**
 * @restoreSelection: If any selection information was potentially lost,
 * restore it. This is useful when performing operations that could remove dom
 * nodes and place them back in, resulting in focus being lost.
 */

function restoreSelection(priorSelectionInformation) {
  const curFocusedElem = getActiveElementDeep();
  const priorFocusedElem = priorSelectionInformation.focusedElem;
  const priorSelectionRange = priorSelectionInformation.selectionRange;

  if (curFocusedElem !== priorFocusedElem && isInDocument(priorFocusedElem)) {
    if (priorSelectionRange !== null && hasSelectionCapabilities(priorFocusedElem)) {
      setSelection(priorFocusedElem, priorSelectionRange);
    } // Focusing a node can change the scroll position, which is undesirable


    const ancestors = [];
    let ancestor = priorFocusedElem;

    while (ancestor = ancestor.parentNode) {
      if (ancestor.nodeType === ELEMENT_NODE) {
        ancestors.push({
          element: ancestor,
          left: ancestor.scrollLeft,
          top: ancestor.scrollTop
        });
      }
    }

    if (typeof priorFocusedElem.focus === 'function') {
      priorFocusedElem.focus();
    }

    for (let i = 0; i < ancestors.length; i++) {
      const info = ancestors[i];
      info.element.scrollLeft = info.left;
      info.element.scrollTop = info.top;
    }
  }
}
/**
 * @getSelection: Gets the selection bounds of a focused textarea, input or
 * contentEditable node.
 * -@input: Look up selection bounds of this input
 * -@return {start: selectionStart, end: selectionEnd}
 */

function getSelection$1(input) {
  let selection;

  if ('selectionStart' in input) {
    // Modern browser with input or textarea.
    selection = {
      start: input.selectionStart,
      end: input.selectionEnd
    };
  } else {
    // Content editable or old IE textarea.
    selection = getOffsets(input);
  }

  return selection || {
    start: 0,
    end: 0
  };
}
/**
 * @setSelection: Sets the selection bounds of a textarea or input and focuses
 * the input.
 * -@input     Set selection bounds of this input or textarea
 * -@offsets   Object of same form that is returned from get*
 */

function setSelection(input, offsets) {
  const start = offsets.start;
  let end = offsets.end;

  if (end === undefined) {
    end = start;
  }

  if ('selectionStart' in input) {
    input.selectionStart = start;
    input.selectionEnd = Math.min(end, input.value.length);
  } else {
    setOffsets(input, offsets);
  }
}

const skipSelectionChangeEvent = canUseDOM && 'documentMode' in document && document.documentMode <= 11;

function registerEvents() {
  registerTwoPhaseEvent('onSelect', ['focusout', 'contextmenu', 'dragend', 'focusin', 'keydown', 'keyup', 'mousedown', 'mouseup', 'selectionchange']);
}

let activeElement = null;
let activeElementInst = null;
let lastSelection = null;
let mouseDown = false;
/**
 * Get an object which is a unique representation of the current selection.
 *
 * The return value will not be consistent across nodes or browsers, but
 * two identical selections on the same node will return identical objects.
 */

function getSelection(node) {
  if ('selectionStart' in node && hasSelectionCapabilities(node)) {
    return {
      start: node.selectionStart,
      end: node.selectionEnd
    };
  } else {
    const win = node.ownerDocument && node.ownerDocument.defaultView || window;
    const selection = win.getSelection();
    return {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset
    };
  }
}
/**
 * Get document associated with the event target.
 */


function getEventTargetDocument(eventTarget) {
  return eventTarget.window === eventTarget ? eventTarget.document : eventTarget.nodeType === DOCUMENT_NODE ? eventTarget : eventTarget.ownerDocument;
}
/**
 * Poll selection to see whether it's changed.
 *
 * @param {object} nativeEvent
 * @param {object} nativeEventTarget
 * @return {?SyntheticEvent}
 */


function constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget) {
  // Ensure we have the right element, and that the user is not dragging a
  // selection (this matches native `select` event behavior). In HTML5, select
  // fires only on input and textarea thus if there's no focused element we
  // won't dispatch.
  const doc = getEventTargetDocument(nativeEventTarget);

  if (mouseDown || activeElement == null || activeElement !== getActiveElement(doc)) {
    return;
  } // Only fire when selection has actually changed.


  const currentSelection = getSelection(activeElement);

  if (!lastSelection || !shallowEqual(lastSelection, currentSelection)) {
    lastSelection = currentSelection;
    const listeners = accumulateTwoPhaseListeners(activeElementInst, 'onSelect');

    if (listeners.length > 0) {
      const event = new SyntheticEvent('onSelect', 'select', null, nativeEvent, nativeEventTarget);
      dispatchQueue.push({
        event,
        listeners
      });
      event.target = activeElement;
    }
  }
}
/**
 * This plugin creates an `onSelect` event that normalizes select events
 * across form elements.
 *
 * Supported elements are:
 * - input (see `isTextInputElement`)
 * - textarea
 * - contentEditable
 *
 * This differs from native browser implementations in the following ways:
 * - Fires on contentEditable fields as well as inputs.
 * - Fires for collapsed selection.
 * - Fires after user input.
 */


function extractEvents$2(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget, eventSystemFlags, targetContainer) {
  const targetNode = targetInst ? getNodeFromInstance(targetInst) : window;

  switch (domEventName) {
    // Track the input node that has focus.
    case 'focusin':
      if (isTextInputElement(targetNode) || targetNode.contentEditable === 'true') {
        activeElement = targetNode;
        activeElementInst = targetInst;
        lastSelection = null;
      }

      break;

    case 'focusout':
      activeElement = null;
      activeElementInst = null;
      lastSelection = null;
      break;
    // Don't fire the event while the user is dragging. This matches the
    // semantics of the native select event.

    case 'mousedown':
      mouseDown = true;
      break;

    case 'contextmenu':
    case 'mouseup':
    case 'dragend':
      mouseDown = false;
      constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
      break;
    // Chrome and IE fire non-standard event when selection is changed (and
    // sometimes when it hasn't). IE's event fires out of order with respect
    // to key and input events on deletion, so we discard it.
    //
    // Firefox doesn't support selectionchange, so check selection status
    // after each key entry. The selection changes after keydown and before
    // keyup, but we check on keydown as well in the case of holding down a
    // key, when multiple keydown events are fired but only one keyup is.
    // This is also our approach for IE handling, for the reason above.

    case 'selectionchange':
      if (skipSelectionChangeEvent) {
        break;
      }

    // falls through

    case 'keydown':
    case 'keyup':
      constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
  }
}

/**
 * Generate a mapping of standard vendor prefixes using the defined style property and event name.
 *
 * @param {string} styleProp
 * @param {string} eventName
 * @returns {object}
 */

function makePrefixMap(styleProp, eventName) {
  const prefixes = {};
  prefixes[styleProp.toLowerCase()] = eventName.toLowerCase();
  prefixes['Webkit' + styleProp] = 'webkit' + eventName;
  prefixes['Moz' + styleProp] = 'moz' + eventName;
  return prefixes;
}
/**
 * A list of event names to a configurable list of vendor prefixes.
 */


const vendorPrefixes = {
  animationend: makePrefixMap('Animation', 'AnimationEnd'),
  animationiteration: makePrefixMap('Animation', 'AnimationIteration'),
  animationstart: makePrefixMap('Animation', 'AnimationStart'),
  transitionend: makePrefixMap('Transition', 'TransitionEnd')
};
/**
 * Event names that have already been detected and prefixed (if applicable).
 */

const prefixedEventNames = {};
/**
 * Element to check for prefixes on.
 */

let style = {};
/**
 * Bootstrap if a DOM exists.
 */

if (canUseDOM) {
  style = document.createElement('div').style; // On some platforms, in particular some releases of Android 4.x,
  // the un-prefixed "animation" and "transition" properties are defined on the
  // style object but the events that fire will still be prefixed, so we need
  // to check if the un-prefixed events are usable, and if not remove them from the map.

  if (!('AnimationEvent' in window)) {
    delete vendorPrefixes.animationend.animation;
    delete vendorPrefixes.animationiteration.animation;
    delete vendorPrefixes.animationstart.animation;
  } // Same as above


  if (!('TransitionEvent' in window)) {
    delete vendorPrefixes.transitionend.transition;
  }
}
/**
 * Attempts to determine the correct vendor prefixed event name.
 *
 * @param {string} eventName
 * @returns {string}
 */


function getVendorPrefixedEventName(eventName) {
  if (prefixedEventNames[eventName]) {
    return prefixedEventNames[eventName];
  } else if (!vendorPrefixes[eventName]) {
    return eventName;
  }

  const prefixMap = vendorPrefixes[eventName];

  for (const styleProp in prefixMap) {
    if (prefixMap.hasOwnProperty(styleProp) && styleProp in style) {
      return prefixedEventNames[eventName] = prefixMap[styleProp];
    }
  }

  return eventName;
}

const ANIMATION_END = getVendorPrefixedEventName('animationend');
const ANIMATION_ITERATION = getVendorPrefixedEventName('animationiteration');
const ANIMATION_START = getVendorPrefixedEventName('animationstart');
const TRANSITION_END = getVendorPrefixedEventName('transitionend');

const topLevelEventsToReactNames = new Map(); // NOTE: Capitalization is important in this list!
//
// E.g. it needs "pointerDown", not "pointerdown".
// This is because we derive both React name ("onPointerDown")
// and DOM name ("pointerdown") from the same list.
//
// Exceptions that don't match this convention are listed separately.
//
// prettier-ignore

const simpleEventPluginEvents = ['abort', 'auxClick', 'cancel', 'canPlay', 'canPlayThrough', 'click', 'close', 'contextMenu', 'copy', 'cut', 'drag', 'dragEnd', 'dragEnter', 'dragExit', 'dragLeave', 'dragOver', 'dragStart', 'drop', 'durationChange', 'emptied', 'encrypted', 'ended', 'error', 'gotPointerCapture', 'input', 'invalid', 'keyDown', 'keyPress', 'keyUp', 'load', 'loadedData', 'loadedMetadata', 'loadStart', 'lostPointerCapture', 'mouseDown', 'mouseMove', 'mouseOut', 'mouseOver', 'mouseUp', 'paste', 'pause', 'play', 'playing', 'pointerCancel', 'pointerDown', 'pointerMove', 'pointerOut', 'pointerOver', 'pointerUp', 'progress', 'rateChange', 'reset', 'resize', 'seeked', 'seeking', 'stalled', 'submit', 'suspend', 'timeUpdate', 'touchCancel', 'touchEnd', 'touchStart', 'volumeChange', 'scroll', 'scrollEnd', 'toggle', 'touchMove', 'waiting', 'wheel'];

function registerSimpleEvent(domEventName, reactName) {
  topLevelEventsToReactNames.set(domEventName, reactName);
  registerTwoPhaseEvent(reactName, [domEventName]);
}

function registerSimpleEvents() {
  for (let i = 0; i < simpleEventPluginEvents.length; i++) {
    const eventName = simpleEventPluginEvents[i];
    const domEventName = eventName.toLowerCase();
    const capitalizedEvent = eventName[0].toUpperCase() + eventName.slice(1);
    registerSimpleEvent(domEventName, 'on' + capitalizedEvent);
  } // Special cases where event names don't match.


  registerSimpleEvent(ANIMATION_END, 'onAnimationEnd');
  registerSimpleEvent(ANIMATION_ITERATION, 'onAnimationIteration');
  registerSimpleEvent(ANIMATION_START, 'onAnimationStart');
  registerSimpleEvent('dblclick', 'onDoubleClick');
  registerSimpleEvent('focusin', 'onFocus');
  registerSimpleEvent('focusout', 'onBlur');
  registerSimpleEvent(TRANSITION_END, 'onTransitionEnd');
}

function extractEvents$1(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget, eventSystemFlags, targetContainer) {
  const reactName = topLevelEventsToReactNames.get(domEventName);

  if (reactName === undefined) {
    return;
  }

  let SyntheticEventCtor = SyntheticEvent;
  let reactEventType = domEventName;

  switch (domEventName) {
    case 'keypress':
      // Firefox creates a keypress event for function keys too. This removes
      // the unwanted keypress events. Enter is however both printable and
      // non-printable. One would expect Tab to be as well (but it isn't).
      // TODO: Fixed in https://bugzilla.mozilla.org/show_bug.cgi?id=968056. Can
      // probably remove.
      if (getEventCharCode(nativeEvent) === 0) {
        return;
      }

    /* falls through */

    case 'keydown':
    case 'keyup':
      SyntheticEventCtor = SyntheticKeyboardEvent;
      break;

    case 'focusin':
      reactEventType = 'focus';
      SyntheticEventCtor = SyntheticFocusEvent;
      break;

    case 'focusout':
      reactEventType = 'blur';
      SyntheticEventCtor = SyntheticFocusEvent;
      break;

    case 'beforeblur':
    case 'afterblur':
      SyntheticEventCtor = SyntheticFocusEvent;
      break;

    case 'click':
      // Firefox creates a click event on right mouse clicks. This removes the
      // unwanted click events.
      // TODO: Fixed in https://phabricator.services.mozilla.com/D26793. Can
      // probably remove.
      if (nativeEvent.button === 2) {
        return;
      }

    /* falls through */

    case 'auxclick':
    case 'dblclick':
    case 'mousedown':
    case 'mousemove':
    case 'mouseup': // TODO: Disabled elements should not respond to mouse events

    /* falls through */

    case 'mouseout':
    case 'mouseover':
    case 'contextmenu':
      SyntheticEventCtor = SyntheticMouseEvent;
      break;

    case 'drag':
    case 'dragend':
    case 'dragenter':
    case 'dragexit':
    case 'dragleave':
    case 'dragover':
    case 'dragstart':
    case 'drop':
      SyntheticEventCtor = SyntheticDragEvent;
      break;

    case 'touchcancel':
    case 'touchend':
    case 'touchmove':
    case 'touchstart':
      SyntheticEventCtor = SyntheticTouchEvent;
      break;

    case ANIMATION_END:
    case ANIMATION_ITERATION:
    case ANIMATION_START:
      SyntheticEventCtor = SyntheticAnimationEvent;
      break;

    case TRANSITION_END:
      SyntheticEventCtor = SyntheticTransitionEvent;
      break;

    case 'scroll':
    case 'scrollend':
      SyntheticEventCtor = SyntheticUIEvent;
      break;

    case 'wheel':
      SyntheticEventCtor = SyntheticWheelEvent;
      break;

    case 'copy':
    case 'cut':
    case 'paste':
      SyntheticEventCtor = SyntheticClipboardEvent;
      break;

    case 'gotpointercapture':
    case 'lostpointercapture':
    case 'pointercancel':
    case 'pointerdown':
    case 'pointermove':
    case 'pointerout':
    case 'pointerover':
    case 'pointerup':
      SyntheticEventCtor = SyntheticPointerEvent;
      break;
  }

  const inCapturePhase = (eventSystemFlags & IS_CAPTURE_PHASE) !== 0;

  {
    // Some events don't bubble in the browser.
    // In the past, React has always bubbled them, but this can be surprising.
    // We're going to try aligning closer to the browser behavior by not bubbling
    // them in React either. We'll start by not bubbling onScroll, and then expand.
    const accumulateTargetOnly = !inCapturePhase && ( // TODO: ideally, we'd eventually add all events from
    // nonDelegatedEvents list in DOMPluginEventSystem.
    // Then we can remove this special list.
    // This is a breaking change that can wait until React 18.
    domEventName === 'scroll' || domEventName === 'scrollend');
    const listeners = accumulateSinglePhaseListeners(targetInst, reactName, nativeEvent.type, inCapturePhase, accumulateTargetOnly);

    if (listeners.length > 0) {
      // Intentionally create event lazily.
      const event = new SyntheticEventCtor(reactName, reactEventType, null, nativeEvent, nativeEventTarget);
      dispatchQueue.push({
        event,
        listeners
      });
    }
  }
}

registerSimpleEvents();
registerEvents$1();
registerEvents$2();
registerEvents();
registerEvents$3();

function extractEvents(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget, eventSystemFlags, targetContainer) {
  // TODO: we should remove the concept of a "SimpleEventPlugin".
  // This is the basic functionality of the event system. All
  // the other plugins are essentially polyfills. So the plugin
  // should probably be inlined somewhere and have its logic
  // be core the to event system. This would potentially allow
  // us to ship builds of React without the polyfilled plugins below.
  extractEvents$1(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget, eventSystemFlags);
  const shouldProcessPolyfillPlugins = (eventSystemFlags & SHOULD_NOT_PROCESS_POLYFILL_EVENT_PLUGINS) === 0; // We don't process these events unless we are in the
  // event's native "bubble" phase, which means that we're
  // not in the capture phase. That's because we emulate
  // the capture phase here still. This is a trade-off,
  // because in an ideal world we would not emulate and use
  // the phases properly, like we do with the SimpleEvent
  // plugin. However, the plugins below either expect
  // emulation (EnterLeave) or use state localized to that
  // plugin (BeforeInput, Change, Select). The state in
  // these modules complicates things, as you'll essentially
  // get the case where the capture phase event might change
  // state, only for the following bubble event to come in
  // later and not trigger anything as the state now
  // invalidates the heuristics of the event plugin. We
  // could alter all these plugins to work in such ways, but
  // that might cause other unknown side-effects that we
  // can't foresee right now.

  if (shouldProcessPolyfillPlugins) {
    extractEvents$3(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget);
    extractEvents$4(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget);
    extractEvents$2(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget);
    extractEvents$5(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget);

    {
      extractEvents$6(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget);
    }
  }
} // List of events that need to be individually attached to media elements.


const mediaEventTypes = ['abort', 'canplay', 'canplaythrough', 'durationchange', 'emptied', 'encrypted', 'ended', 'error', 'loadeddata', 'loadedmetadata', 'loadstart', 'pause', 'play', 'playing', 'progress', 'ratechange', 'resize', 'seeked', 'seeking', 'stalled', 'suspend', 'timeupdate', 'volumechange', 'waiting']; // We should not delegate these events to the container, but rather
// set them on the actual target element itself. This is primarily
// because these events do not consistently bubble in the DOM.

const nonDelegatedEvents = new Set(['cancel', 'close', 'invalid', 'load', 'scroll', 'scrollend', 'toggle'].concat(mediaEventTypes));

function executeDispatch(event, listener, currentTarget) {
  const type = event.type || 'unknown-event';
  event.currentTarget = currentTarget;
  invokeGuardedCallbackAndCatchFirstError(type, listener, undefined, event);
  event.currentTarget = null;
}

function processDispatchQueueItemsInOrder(event, dispatchListeners, inCapturePhase) {
  let previousInstance;

  if (inCapturePhase) {
    for (let i = dispatchListeners.length - 1; i >= 0; i--) {
      const _dispatchListeners$i = dispatchListeners[i],
            instance = _dispatchListeners$i.instance,
            currentTarget = _dispatchListeners$i.currentTarget,
            listener = _dispatchListeners$i.listener;

      if (instance !== previousInstance && event.isPropagationStopped()) {
        return;
      }

      executeDispatch(event, listener, currentTarget);
      previousInstance = instance;
    }
  } else {
    for (let i = 0; i < dispatchListeners.length; i++) {
      const _dispatchListeners$i2 = dispatchListeners[i],
            instance = _dispatchListeners$i2.instance,
            currentTarget = _dispatchListeners$i2.currentTarget,
            listener = _dispatchListeners$i2.listener;

      if (instance !== previousInstance && event.isPropagationStopped()) {
        return;
      }

      executeDispatch(event, listener, currentTarget);
      previousInstance = instance;
    }
  }
}

function processDispatchQueue(dispatchQueue, eventSystemFlags) {
  const inCapturePhase = (eventSystemFlags & IS_CAPTURE_PHASE) !== 0;

  for (let i = 0; i < dispatchQueue.length; i++) {
    const _dispatchQueue$i = dispatchQueue[i],
          event = _dispatchQueue$i.event,
          listeners = _dispatchQueue$i.listeners;
    processDispatchQueueItemsInOrder(event, listeners, inCapturePhase); //  event system doesn't use pooling.
  } // This would be a good time to rethrow if any of the event handlers threw.


  rethrowCaughtError();
}

function dispatchEventsForPlugins(domEventName, eventSystemFlags, nativeEvent, targetInst, targetContainer) {
  const nativeEventTarget = getEventTarget(nativeEvent);
  const dispatchQueue = [];
  extractEvents(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget, eventSystemFlags);
  processDispatchQueue(dispatchQueue, eventSystemFlags);
}

function listenToNonDelegatedEvent(domEventName, targetElement) {

  const isCapturePhaseListener = false;
  const listenerSet = getEventListenerSet(targetElement);
  const listenerSetKey = getListenerSetKey(domEventName, isCapturePhaseListener);

  if (!listenerSet.has(listenerSetKey)) {
    addTrappedEventListener(targetElement, domEventName, IS_NON_DELEGATED, isCapturePhaseListener);
    listenerSet.add(listenerSetKey);
  }
}
function listenToNativeEvent(domEventName, isCapturePhaseListener, target) {

  let eventSystemFlags = 0;

  if (isCapturePhaseListener) {
    eventSystemFlags |= IS_CAPTURE_PHASE;
  }

  addTrappedEventListener(target, domEventName, eventSystemFlags, isCapturePhaseListener);
} // This is only used by createEventHandle when the
const listeningMarker = '_reactListening' + Math.random().toString(36).slice(2);
function listenToAllSupportedEvents(rootContainerElement) {
  if (!rootContainerElement[listeningMarker]) {
    rootContainerElement[listeningMarker] = true;
    allNativeEvents.forEach(domEventName => {
      // We handle selectionchange separately because it
      // doesn't bubble and needs to be on the document.
      if (domEventName !== 'selectionchange') {
        if (!nonDelegatedEvents.has(domEventName)) {
          listenToNativeEvent(domEventName, false, rootContainerElement);
        }

        listenToNativeEvent(domEventName, true, rootContainerElement);
      }
    });
    const ownerDocument = rootContainerElement.nodeType === DOCUMENT_NODE ? rootContainerElement : rootContainerElement.ownerDocument;

    if (ownerDocument !== null) {
      // The selectionchange event also needs deduplication
      // but it is attached to the document.
      if (!ownerDocument[listeningMarker]) {
        ownerDocument[listeningMarker] = true;
        listenToNativeEvent('selectionchange', false, ownerDocument);
      }
    }
  }
}

function addTrappedEventListener(targetContainer, domEventName, eventSystemFlags, isCapturePhaseListener, isDeferredListenerForLegacyFBSupport) {
  let listener = createEventListenerWrapperWithPriority(targetContainer, domEventName, eventSystemFlags); // If passive option is not supported, then the event will be
  // active and not passive.

  let isPassiveListener = undefined;

  if (passiveBrowserEventsSupported) {
    // Browsers introduced an intervention, making these events
    // passive by default on document. React doesn't bind them
    // to document anymore, but changing this now would undo
    // the performance wins from the change. So we emulate
    // the existing behavior manually on the roots now.
    // https://github.com/facebook/react/issues/19651
    if (domEventName === 'touchstart' || domEventName === 'touchmove' || domEventName === 'wheel') {
      isPassiveListener = true;
    }
  }

  targetContainer = targetContainer;


  if (isCapturePhaseListener) {
    if (isPassiveListener !== undefined) {
      addEventCaptureListenerWithPassiveFlag(targetContainer, domEventName, listener, isPassiveListener);
    } else {
      addEventCaptureListener(targetContainer, domEventName, listener);
    }
  } else {
    if (isPassiveListener !== undefined) {
      addEventBubbleListenerWithPassiveFlag(targetContainer, domEventName, listener, isPassiveListener);
    } else {
      addEventBubbleListener(targetContainer, domEventName, listener);
    }
  }
}

function isMatchingRootContainer(grandContainer, targetContainer) {
  return grandContainer === targetContainer || grandContainer.nodeType === COMMENT_NODE && grandContainer.parentNode === targetContainer;
}

function dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, targetInst, targetContainer) {
  let ancestorInst = targetInst;

  if ((eventSystemFlags & IS_EVENT_HANDLE_NON_MANAGED_NODE) === 0 && (eventSystemFlags & IS_NON_DELEGATED) === 0) {
    const targetContainerNode = targetContainer; // If we are using the legacy FB support flag, we

    if (targetInst !== null) {
      // The below logic attempts to work out if we need to change
      // the target fiber to a different ancestor. We had similar logic
      // in the legacy event system, except the big difference between
      // systems is that the modern event system now has an event listener
      // attached to each React Root and React Portal Root. Together,
      // the DOM nodes representing these roots are the "rootContainer".
      // To figure out which ancestor instance we should use, we traverse
      // up the fiber tree from the target instance and attempt to find
      // root boundaries that match that of our current "rootContainer".
      // If we find that "rootContainer", we find the parent fiber
      // sub-tree for that root and make that our ancestor instance.
      let node = targetInst;

      mainLoop: while (true) {
        if (node === null) {
          return;
        }

        const nodeTag = node.tag;

        if (nodeTag === HostRoot || nodeTag === HostPortal) {
          let container = node.stateNode.containerInfo;

          if (isMatchingRootContainer(container, targetContainerNode)) {
            break;
          }

          if (nodeTag === HostPortal) {
            // The target is a portal, but it's not the rootContainer we're looking for.
            // Normally portals handle their own events all the way down to the root.
            // So we should be able to stop now. However, we don't know if this portal
            // was part of *our* root.
            let grandNode = node.return;

            while (grandNode !== null) {
              const grandTag = grandNode.tag;

              if (grandTag === HostRoot || grandTag === HostPortal) {
                const grandContainer = grandNode.stateNode.containerInfo;

                if (isMatchingRootContainer(grandContainer, targetContainerNode)) {
                  // This is the rootContainer we're looking for and we found it as
                  // a parent of the Portal. That means we can ignore it because the
                  // Portal will bubble through to us.
                  return;
                }
              }

              grandNode = grandNode.return;
            }
          } // Now we need to find it's corresponding host fiber in the other
          // tree. To do this we can use getClosestInstanceFromNode, but we
          // need to validate that the fiber is a host instance, otherwise
          // we need to traverse up through the DOM till we find the correct
          // node that is from the other tree.


          while (container !== null) {
            const parentNode = getClosestInstanceFromNode(container);

            if (parentNode === null) {
              return;
            }

            const parentTag = parentNode.tag;

            if (parentTag === HostComponent || parentTag === HostText || (parentTag === HostHoistable ) || (parentTag === HostSingleton )) {
              node = ancestorInst = parentNode;
              continue mainLoop;
            }

            container = container.parentNode;
          }
        }

        node = node.return;
      }
    }
  }

  batchedUpdates(() => dispatchEventsForPlugins(domEventName, eventSystemFlags, nativeEvent, ancestorInst));
}

function createDispatchListener(instance, listener, currentTarget) {
  return {
    instance,
    listener,
    currentTarget
  };
}

function accumulateSinglePhaseListeners(targetFiber, reactName, nativeEventType, inCapturePhase, accumulateTargetOnly, nativeEvent) {
  const captureName = reactName !== null ? reactName + 'Capture' : null;
  const reactEventName = inCapturePhase ? captureName : reactName;
  let listeners = [];
  let instance = targetFiber;
  let lastHostComponent = null; // Accumulate all instances and listeners via the target -> root path.

  while (instance !== null) {
    const _instance = instance,
          stateNode = _instance.stateNode,
          tag = _instance.tag; // Handle listeners that are on HostComponents (i.e. <div>)

    if ((tag === HostComponent || (tag === HostHoistable ) || (tag === HostSingleton )) && stateNode !== null) {
      lastHostComponent = stateNode; // createEventHandle listeners


      if (reactEventName !== null) {
        const listener = getListener(instance, reactEventName);

        if (listener != null) {
          listeners.push(createDispatchListener(instance, listener, lastHostComponent));
        }
      }
    } // If we are only accumulating events for the target, then we don't
    // continue to propagate through the React fiber tree to find other
    // listeners.


    if (accumulateTargetOnly) {
      break;
    } // If we are processing the onBeforeBlur event, then we need to take

    instance = instance.return;
  }

  return listeners;
} // We should only use this function for:
// - BeforeInputEventPlugin
// - ChangeEventPlugin
// - SelectEventPlugin
// This is because we only process these plugins
// in the bubble phase, so we need to accumulate two
// phase event listeners (via emulation).

function accumulateTwoPhaseListeners(targetFiber, reactName) {
  const captureName = reactName + 'Capture';
  const listeners = [];
  let instance = targetFiber; // Accumulate all instances and listeners via the target -> root path.

  while (instance !== null) {
    const _instance2 = instance,
          stateNode = _instance2.stateNode,
          tag = _instance2.tag; // Handle listeners that are on HostComponents (i.e. <div>)

    if ((tag === HostComponent || (tag === HostHoistable ) || (tag === HostSingleton )) && stateNode !== null) {
      const currentTarget = stateNode;
      const captureListener = getListener(instance, captureName);

      if (captureListener != null) {
        listeners.unshift(createDispatchListener(instance, captureListener, currentTarget));
      }

      const bubbleListener = getListener(instance, reactName);

      if (bubbleListener != null) {
        listeners.push(createDispatchListener(instance, bubbleListener, currentTarget));
      }
    }

    instance = instance.return;
  }

  return listeners;
}

function getParent(inst) {
  if (inst === null) {
    return null;
  }

  do {
    // $FlowFixMe[incompatible-use] found when upgrading Flow
    inst = inst.return; // TODO: If this is a HostRoot we might want to bail out.
    // That is depending on if we want nested subtrees (layers) to bubble
    // events to their parent. We could also go through parentNode on the
    // host node but that wouldn't work for React Native and doesn't let us
    // do the portal feature.
  } while (inst && inst.tag !== HostComponent && (inst.tag !== HostSingleton));

  if (inst) {
    return inst;
  }

  return null;
}
/**
 * Return the lowest common ancestor of A and B, or null if they are in
 * different trees.
 */


function getLowestCommonAncestor(instA, instB) {
  let nodeA = instA;
  let nodeB = instB;
  let depthA = 0;

  for (let tempA = nodeA; tempA; tempA = getParent(tempA)) {
    depthA++;
  }

  let depthB = 0;

  for (let tempB = nodeB; tempB; tempB = getParent(tempB)) {
    depthB++;
  } // If A is deeper, crawl up.


  while (depthA - depthB > 0) {
    nodeA = getParent(nodeA);
    depthA--;
  } // If B is deeper, crawl up.


  while (depthB - depthA > 0) {
    nodeB = getParent(nodeB);
    depthB--;
  } // Walk in lockstep until we find a match.


  let depth = depthA;

  while (depth--) {
    if (nodeA === nodeB || nodeB !== null && nodeA === nodeB.alternate) {
      return nodeA;
    }

    nodeA = getParent(nodeA);
    nodeB = getParent(nodeB);
  }

  return null;
}

function accumulateEnterLeaveListenersForEvent(dispatchQueue, event, target, common, inCapturePhase) {
  const registrationName = event._reactName;
  const listeners = [];
  let instance = target;

  while (instance !== null) {
    if (instance === common) {
      break;
    }

    const _instance3 = instance,
          alternate = _instance3.alternate,
          stateNode = _instance3.stateNode,
          tag = _instance3.tag;

    if (alternate !== null && alternate === common) {
      break;
    }

    if ((tag === HostComponent || (tag === HostHoistable ) || (tag === HostSingleton )) && stateNode !== null) {
      const currentTarget = stateNode;

      if (inCapturePhase) {
        const captureListener = getListener(instance, registrationName);

        if (captureListener != null) {
          listeners.unshift(createDispatchListener(instance, captureListener, currentTarget));
        }
      } else if (!inCapturePhase) {
        const bubbleListener = getListener(instance, registrationName);

        if (bubbleListener != null) {
          listeners.push(createDispatchListener(instance, bubbleListener, currentTarget));
        }
      }
    }

    instance = instance.return;
  }

  if (listeners.length !== 0) {
    dispatchQueue.push({
      event,
      listeners
    });
  }
} // We should only use this function for:
// - EnterLeaveEventPlugin
// This is because we only process this plugin
// in the bubble phase, so we need to accumulate two
// phase event listeners.


function accumulateEnterLeaveTwoPhaseListeners(dispatchQueue, leaveEvent, enterEvent, from, to) {
  const common = from && to ? getLowestCommonAncestor(from, to) : null;

  if (from !== null) {
    accumulateEnterLeaveListenersForEvent(dispatchQueue, leaveEvent, from, common, false);
  }

  if (to !== null && enterEvent !== null) {
    accumulateEnterLeaveListenersForEvent(dispatchQueue, enterEvent, to, common, true);
  }
}
function getListenerSetKey(domEventName, capture) {
  return domEventName + "__" + (capture ? 'capture' : 'bubble');
}

// It also can turn \u0000 into \uFFFD inside attributes.
// https://www.w3.org/TR/html5/single-page.html#preprocessing-the-input-stream
// If we have a mismatch, it might be caused by that.
// We will still patch up in this case but not fire the warning.


const NORMALIZE_NEWLINES_REGEX = /\r\n?/g;
const NORMALIZE_NULL_AND_REPLACEMENT_REGEX = /\u0000|\uFFFD/g;

function normalizeMarkupForTextOrAttribute(markup) {

  const markupString = typeof markup === 'string' ? markup : '' + markup;
  return markupString.replace(NORMALIZE_NEWLINES_REGEX, '\n').replace(NORMALIZE_NULL_AND_REPLACEMENT_REGEX, '');
}

function checkForUnmatchedText(serverText, clientText, isConcurrentMode, shouldWarnDev) {
  const normalizedClientText = normalizeMarkupForTextOrAttribute(clientText);
  const normalizedServerText = normalizeMarkupForTextOrAttribute(serverText);

  if (normalizedServerText === normalizedClientText) {
    return;
  }

  if (isConcurrentMode && enableClientRenderFallbackOnTextMismatch) {
    // In concurrent roots, we throw when there's a text mismatch and revert to
    // client rendering, up to the nearest Suspense boundary.
    throw Error(formatProdErrorMessage(425));
  }
}

function noop$1() {}

function trapClickOnNonInteractiveElement(node) {
  // Mobile Safari does not fire properly bubble click events on
  // non-interactive elements, which means delegated click listeners do not
  // fire. The workaround for this bug involves attaching an empty click
  // listener on the target node.
  // https://www.quirksmode.org/blog/archives/2010/09/click_event_del.html
  // Just set it using the onclick property so that we don't have to manage any
  // bookkeeping for it. Not sure if we need to clear it when the listener is
  // removed.
  // TODO: Only do this for the relevant Safaris maybe?
  node.onclick = noop$1;
}
const xlinkNamespace = 'http://www.w3.org/1999/xlink';
const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';

function setProp(domElement, tag, key, value, props, prevValue) {
  switch (key) {
    case 'children':
      {
        if (typeof value === 'string') {
          // textContent on a <textarea> will cause the placeholder to not
          // show within the <textarea> until it has been focused and blurred again.
          // https://github.com/facebook/react/issues/6731#issuecomment-254874553


          const canSetTextContent = (tag !== 'body') && (tag !== 'textarea' || value !== '');

          if (canSetTextContent) {
            setTextContent(domElement, value);
          }
        } else if (typeof value === 'number') {

          const canSetTextContent = tag !== 'body';

          if (canSetTextContent) {
            setTextContent(domElement, '' + value);
          }
        }

        break;
      }
    // These are very common props and therefore are in the beginning of the switch.
    // TODO: aria-label is a very common prop but allows booleans so is not like the others
    // but should ideally go in this list too.

    case 'className':
      setValueForKnownAttribute(domElement, 'class', value);
      break;

    case 'tabIndex':
      // This has to be case sensitive in SVG.
      setValueForKnownAttribute(domElement, 'tabindex', value);
      break;

    case 'dir':
    case 'role':
    case 'viewBox':
    case 'width':
    case 'height':
      {
        setValueForKnownAttribute(domElement, key, value);
        break;
      }

    case 'style':
      {
        setValueForStyles(domElement, value, prevValue);
        break;
      }
    // These attributes accept URLs. These must not allow javascript: URLS.

    case 'src':
    case 'href':
      {
        {
          if (value === '') {

            domElement.removeAttribute(key);
            break;
          }
        }

        if (value == null || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'boolean') {
          domElement.removeAttribute(key);
          break;
        } // `setAttribute` with objects becomes only `[object]` in IE8/9,

        const sanitizedValue = sanitizeURL('' + value);
        domElement.setAttribute(key, sanitizedValue);
        break;
      }

    case 'action':
    case 'formAction':
      {

        {
          if (typeof value === 'function') {
            // Set a javascript URL that doesn't do anything. We don't expect this to be invoked
            // because we'll preventDefault, but it can happen if a form is manually submitted or
            // if someone calls stopPropagation before React gets the event.
            // If CSP is used to block javascript: URLs that's fine too. It just won't show this
            // error message but the URL will be logged.
            domElement.setAttribute(key, // eslint-disable-next-line no-script-url
            "javascript:throw new Error('" + 'A React form was unexpectedly submitted. If you called form.submit() manually, ' + "consider using form.requestSubmit() instead. If you\\'re trying to use " + 'event.stopPropagation() in a submit event handler, consider also calling ' + 'event.preventDefault().' + "')");
            break;
          } else if (typeof prevValue === 'function') {
            // When we're switching off a Server Action that was originally hydrated.
            // The server control these fields during SSR that are now trailing.
            // The regular diffing doesn't apply since we compare against the previous props.
            // Instead, we need to force them to be set to whatever they should be now.
            // This would be a lot cleaner if we did this whole fork in the per-tag approach.
            if (key === 'formAction') {
              if (tag !== 'input') {
                // Setting the name here isn't completely safe for inputs if this is switching
                // to become a radio button. In that case we let the tag based override take
                // control.
                setProp(domElement, tag, 'name', props.name, props, null);
              }

              setProp(domElement, tag, 'formEncType', props.formEncType, props, null);
              setProp(domElement, tag, 'formMethod', props.formMethod, props, null);
              setProp(domElement, tag, 'formTarget', props.formTarget, props, null);
            } else {
              setProp(domElement, tag, 'encType', props.encType, props, null);
              setProp(domElement, tag, 'method', props.method, props, null);
              setProp(domElement, tag, 'target', props.target, props, null);
            }
          }
        }

        if (value == null || !enableFormActions  || typeof value === 'symbol' || typeof value === 'boolean') {
          domElement.removeAttribute(key);
          break;
        } // `setAttribute` with objects becomes only `[object]` in IE8/9,

        const sanitizedValue = sanitizeURL('' + value);
        domElement.setAttribute(key, sanitizedValue);
        break;
      }

    case 'onClick':
      {
        // TODO: This cast may not be sound for SVG, MathML or custom elements.
        if (value != null) {

          trapClickOnNonInteractiveElement(domElement);
        }

        break;
      }

    case 'onScroll':
      {
        if (value != null) {

          listenToNonDelegatedEvent('scroll', domElement);
        }

        break;
      }

    case 'onScrollEnd':
      {
        if (value != null) {

          listenToNonDelegatedEvent('scrollend', domElement);
        }

        break;
      }

    case 'dangerouslySetInnerHTML':
      {
        if (value != null) {
          if (typeof value !== 'object' || !('__html' in value)) {
            throw Error(formatProdErrorMessage(61));
          }

          const nextHtml = value.__html;

          if (nextHtml != null) {
            if (props.children != null) {
              throw Error(formatProdErrorMessage(60));
            }

            {
              domElement.innerHTML = nextHtml;
            }
          }
        }

        break;
      }
    // Note: `option.selected` is not updated if `select.multiple` is
    // disabled with `removeAttribute`. We have special logic for handling this.

    case 'multiple':
      {
        domElement.multiple = value && typeof value !== 'function' && typeof value !== 'symbol';
        break;
      }

    case 'muted':
      {
        domElement.muted = value && typeof value !== 'function' && typeof value !== 'symbol';
        break;
      }

    case 'suppressContentEditableWarning':
    case 'suppressHydrationWarning':
    case 'defaultValue': // Reserved

    case 'defaultChecked':
    case 'innerHTML':
      {
        // Noop
        break;
      }

    case 'autoFocus':
      {
        // We polyfill it separately on the client during commit.
        // We could have excluded it in the property list instead of
        // adding a special case here, but then it wouldn't be emitted
        // on server rendering (but we *do* want to emit it in SSR).
        break;
      }

    case 'xlinkHref':
      {
        if (value == null || typeof value === 'function' || typeof value === 'boolean' || typeof value === 'symbol') {
          domElement.removeAttribute('xlink:href');
          break;
        } // `setAttribute` with objects becomes only `[object]` in IE8/9,

        const sanitizedValue = sanitizeURL('' + value);
        domElement.setAttributeNS(xlinkNamespace, 'xlink:href', sanitizedValue);
        break;
      }

    case 'contentEditable':
    case 'spellCheck':
    case 'draggable':
    case 'value':
    case 'autoReverse':
    case 'externalResourcesRequired':
    case 'focusable':
    case 'preserveAlpha':
      {
        // Booleanish String
        // These are "enumerated" attributes that accept "true" and "false".
        // In React, we let users pass `true` and `false` even though technically
        // these aren't boolean attributes (they are coerced to strings).
        // The SVG attributes are case-sensitive. Since the HTML attributes are
        // insensitive they also work even though we canonically use lower case.
        if (value != null && typeof value !== 'function' && typeof value !== 'symbol') {

          domElement.setAttribute(key, '' + value);
        } else {
          domElement.removeAttribute(key);
        }

        break;
      }
    // Boolean

    case 'allowFullScreen':
    case 'async':
    case 'autoPlay':
    case 'controls':
    case 'default':
    case 'defer':
    case 'disabled':
    case 'disablePictureInPicture':
    case 'disableRemotePlayback':
    case 'formNoValidate':
    case 'hidden':
    case 'loop':
    case 'noModule':
    case 'noValidate':
    case 'open':
    case 'playsInline':
    case 'readOnly':
    case 'required':
    case 'reversed':
    case 'scoped':
    case 'seamless':
    case 'itemScope':
      {
        if (value && typeof value !== 'function' && typeof value !== 'symbol') {
          domElement.setAttribute(key, '');
        } else {
          domElement.removeAttribute(key);
        }

        break;
      }
    // Overloaded Boolean

    case 'capture':
    case 'download':
      {
        // An attribute that can be used as a flag as well as with a value.
        // When true, it should be present (set either to an empty string or its name).
        // When false, it should be omitted.
        // For any other value, should be present with that value.
        if (value === true) {
          domElement.setAttribute(key, '');
        } else if (value !== false && value != null && typeof value !== 'function' && typeof value !== 'symbol') {

          domElement.setAttribute(key, value);
        } else {
          domElement.removeAttribute(key);
        }

        break;
      }

    case 'cols':
    case 'rows':
    case 'size':
    case 'span':
      {
        // These are HTML attributes that must be positive numbers.
        if (value != null && typeof value !== 'function' && typeof value !== 'symbol' && !isNaN(value) && value >= 1) {

          domElement.setAttribute(key, value);
        } else {
          domElement.removeAttribute(key);
        }

        break;
      }

    case 'rowSpan':
    case 'start':
      {
        // These are HTML attributes that must be numbers.
        if (value != null && typeof value !== 'function' && typeof value !== 'symbol' && !isNaN(value)) {

          domElement.setAttribute(key, value);
        } else {
          domElement.removeAttribute(key);
        }

        break;
      }

    case 'xlinkActuate':
      setValueForNamespacedAttribute(domElement, xlinkNamespace, 'xlink:actuate', value);
      break;

    case 'xlinkArcrole':
      setValueForNamespacedAttribute(domElement, xlinkNamespace, 'xlink:arcrole', value);
      break;

    case 'xlinkRole':
      setValueForNamespacedAttribute(domElement, xlinkNamespace, 'xlink:role', value);
      break;

    case 'xlinkShow':
      setValueForNamespacedAttribute(domElement, xlinkNamespace, 'xlink:show', value);
      break;

    case 'xlinkTitle':
      setValueForNamespacedAttribute(domElement, xlinkNamespace, 'xlink:title', value);
      break;

    case 'xlinkType':
      setValueForNamespacedAttribute(domElement, xlinkNamespace, 'xlink:type', value);
      break;

    case 'xmlBase':
      setValueForNamespacedAttribute(domElement, xmlNamespace, 'xml:base', value);
      break;

    case 'xmlLang':
      setValueForNamespacedAttribute(domElement, xmlNamespace, 'xml:lang', value);
      break;

    case 'xmlSpace':
      setValueForNamespacedAttribute(domElement, xmlNamespace, 'xml:space', value);
      break;
    // Properties that should not be allowed on custom elements.

    case 'is':
      {
        // passed it to createElement. We don't also need the attribute.
        // However, our tests currently query for it so it's plausible someone
        // else does too so it's break.


        setValueForAttribute(domElement, 'is', value);
        break;
      }

    case 'innerText':
    case 'textContent':
      {
        break;
      }

    // Fall through

    default:
      {
        if (key.length > 2 && (key[0] === 'o' || key[0] === 'O') && (key[1] === 'n' || key[1] === 'N')) ; else {
          const attributeName = getAttributeAlias(key);
          setValueForAttribute(domElement, attributeName, value);
        }
      }
  }
}

function setPropOnCustomElement(domElement, tag, key, value, props, prevValue) {
  switch (key) {
    case 'style':
      {
        setValueForStyles(domElement, value, prevValue);
        break;
      }

    case 'dangerouslySetInnerHTML':
      {
        if (value != null) {
          if (typeof value !== 'object' || !('__html' in value)) {
            throw Error(formatProdErrorMessage(61));
          }

          const nextHtml = value.__html;

          if (nextHtml != null) {
            if (props.children != null) {
              throw Error(formatProdErrorMessage(60));
            }

            {
              domElement.innerHTML = nextHtml;
            }
          }
        }

        break;
      }

    case 'children':
      {
        if (typeof value === 'string') {
          setTextContent(domElement, value);
        } else if (typeof value === 'number') {
          setTextContent(domElement, '' + value);
        }

        break;
      }

    case 'onScroll':
      {
        if (value != null) {

          listenToNonDelegatedEvent('scroll', domElement);
        }

        break;
      }

    case 'onScrollEnd':
      {
        if (value != null) {

          listenToNonDelegatedEvent('scrollend', domElement);
        }

        break;
      }

    case 'onClick':
      {
        // TODO: This cast may not be sound for SVG, MathML or custom elements.
        if (value != null) {

          trapClickOnNonInteractiveElement(domElement);
        }

        break;
      }

    case 'suppressContentEditableWarning':
    case 'suppressHydrationWarning':
    case 'innerHTML':
      {
        // Noop
        break;
      }

    case 'innerText': // Properties

    case 'textContent':
      {
        break;
      }

    // Fall through

    default:
      {
        if (registrationNameDependencies.hasOwnProperty(key)) ; else {
          {
            setValueForPropertyOnCustomComponent(domElement, key, value);
          }
        }
      }
  }
}

function setInitialProperties(domElement, tag, props) {


  switch (tag) {
    case 'div':
    case 'span':
    case 'svg':
    case 'path':
    case 'a':
    case 'g':
    case 'p':
    case 'li':
      {
        // Fast track the most common tag types
        break;
      }

    case 'input':
      {
        // listeners still fire for the invalid event.


        listenToNonDelegatedEvent('invalid', domElement);
        let name = null;
        let type = null;
        let value = null;
        let defaultValue = null;
        let checked = null;
        let defaultChecked = null;

        for (const propKey in props) {
          if (!props.hasOwnProperty(propKey)) {
            continue;
          }

          const propValue = props[propKey];

          if (propValue == null) {
            continue;
          }

          switch (propKey) {
            case 'name':
              {
                name = propValue;
                break;
              }

            case 'type':
              {
                type = propValue;
                break;
              }

            case 'checked':
              {
                checked = propValue;
                break;
              }

            case 'defaultChecked':
              {
                defaultChecked = propValue;
                break;
              }

            case 'value':
              {
                value = propValue;
                break;
              }

            case 'defaultValue':
              {
                defaultValue = propValue;
                break;
              }

            case 'children':
            case 'dangerouslySetInnerHTML':
              {
                if (propValue != null) {
                  throw Error(formatProdErrorMessage(137, tag));
                }

                break;
              }

            default:
              {
                setProp(domElement, tag, propKey, propValue, props, null);
              }
          }
        } // TODO: Make sure we check if this is still unmounted or do any clean
        initInput(domElement, value, defaultValue, checked, defaultChecked, type, name, false);
        track(domElement);
        return;
      }

    case 'select':
      {
        // listeners still fire for the invalid event.


        listenToNonDelegatedEvent('invalid', domElement);
        let value = null;
        let defaultValue = null;
        let multiple = null;

        for (const propKey in props) {
          if (!props.hasOwnProperty(propKey)) {
            continue;
          }

          const propValue = props[propKey];

          if (propValue == null) {
            continue;
          }

          switch (propKey) {
            case 'value':
              {
                value = propValue; // This is handled by initSelect below.

                break;
              }

            case 'defaultValue':
              {
                defaultValue = propValue; // This is handled by initSelect below.

                break;
              }

            case 'multiple':
              {
                multiple = propValue; // TODO: We don't actually have to fall through here because we set it
                // in initSelect anyway. We can remove the special case in setProp.
              }
            // Fallthrough

            default:
              {
                setProp(domElement, tag, propKey, propValue, props, null);
              }
          }
        }
        initSelect(domElement, value, defaultValue, multiple);
        return;
      }

    case 'textarea':
      {
        // listeners still fire for the invalid event.


        listenToNonDelegatedEvent('invalid', domElement);
        let value = null;
        let defaultValue = null;
        let children = null;

        for (const propKey in props) {
          if (!props.hasOwnProperty(propKey)) {
            continue;
          }

          const propValue = props[propKey];

          if (propValue == null) {
            continue;
          }

          switch (propKey) {
            case 'value':
              {
                value = propValue; // This is handled by initTextarea below.

                break;
              }

            case 'defaultValue':
              {
                defaultValue = propValue;
                break;
              }

            case 'children':
              {
                children = propValue; // Handled by initTextarea above.

                break;
              }

            case 'dangerouslySetInnerHTML':
              {
                if (propValue != null) {
                  // TODO: Do we really need a special error message for this. It's also pretty blunt.
                  throw Error(formatProdErrorMessage(91));
                }

                break;
              }

            default:
              {
                setProp(domElement, tag, propKey, propValue, props, null);
              }
          }
        } // TODO: Make sure we check if this is still unmounted or do any clean
        initTextarea(domElement, value, defaultValue, children);
        track(domElement);
        return;
      }

    case 'option':
      {

        for (const propKey in props) {
          if (!props.hasOwnProperty(propKey)) {
            continue;
          }

          const propValue = props[propKey];

          if (propValue == null) {
            continue;
          }

          switch (propKey) {
            case 'selected':
              {
                // TODO: Remove support for selected on option.
                domElement.selected = propValue && typeof propValue !== 'function' && typeof propValue !== 'symbol';
                break;
              }

            default:
              {
                setProp(domElement, tag, propKey, propValue, props, null);
              }
          }
        }

        return;
      }

    case 'dialog':
      {
        listenToNonDelegatedEvent('cancel', domElement);
        listenToNonDelegatedEvent('close', domElement);
        break;
      }

    case 'iframe':
    case 'object':
      {
        // We listen to this event in case to ensure emulated bubble
        // listeners still fire for the load event.
        listenToNonDelegatedEvent('load', domElement);
        break;
      }

    case 'video':
    case 'audio':
      {
        // We listen to these events in case to ensure emulated bubble
        // listeners still fire for all the media events.
        for (let i = 0; i < mediaEventTypes.length; i++) {
          listenToNonDelegatedEvent(mediaEventTypes[i], domElement);
        }

        break;
      }

    case 'image':
      {
        // We listen to these events in case to ensure emulated bubble
        // listeners still fire for error and load events.
        listenToNonDelegatedEvent('error', domElement);
        listenToNonDelegatedEvent('load', domElement);
        break;
      }

    case 'details':
      {
        // We listen to this event in case to ensure emulated bubble
        // listeners still fire for the toggle event.
        listenToNonDelegatedEvent('toggle', domElement);
        break;
      }

    case 'embed':
    case 'source':
    case 'img':
    case 'link':
      {
        // These are void elements that also need delegated events.
        listenToNonDelegatedEvent('error', domElement);
        listenToNonDelegatedEvent('load', domElement); // We fallthrough to the return of the void elements
      }

    case 'area':
    case 'base':
    case 'br':
    case 'col':
    case 'hr':
    case 'keygen':
    case 'meta':
    case 'param':
    case 'track':
    case 'wbr':
    case 'menuitem':
      {
        // Void elements
        for (const propKey in props) {
          if (!props.hasOwnProperty(propKey)) {
            continue;
          }

          const propValue = props[propKey];

          if (propValue == null) {
            continue;
          }

          switch (propKey) {
            case 'children':
            case 'dangerouslySetInnerHTML':
              {
                // TODO: Can we make this a DEV warning to avoid this deny list?
                throw Error(formatProdErrorMessage(137, tag));
              }
            // defaultChecked and defaultValue are ignored by setProp

            default:
              {
                setProp(domElement, tag, propKey, propValue, props, null);
              }
          }
        }

        return;
      }

    default:
      {
        if (isCustomElement(tag)) {
          for (const propKey in props) {
            if (!props.hasOwnProperty(propKey)) {
              continue;
            }

            const propValue = props[propKey];

            if (propValue == null) {
              continue;
            }

            setPropOnCustomElement(domElement, tag, propKey, propValue, props, null);
          }

          return;
        }
      }
  }

  for (const propKey in props) {
    if (!props.hasOwnProperty(propKey)) {
      continue;
    }

    const propValue = props[propKey];

    if (propValue == null) {
      continue;
    }

    setProp(domElement, tag, propKey, propValue, props, null);
  }
}
function updateProperties(domElement, tag, lastProps, nextProps) {

  switch (tag) {
    case 'div':
    case 'span':
    case 'svg':
    case 'path':
    case 'a':
    case 'g':
    case 'p':
    case 'li':
      {
        // Fast track the most common tag types
        break;
      }

    case 'input':
      {
        let name = null;
        let type = null;
        let value = null;
        let defaultValue = null;
        let lastDefaultValue = null;
        let checked = null;
        let defaultChecked = null;

        for (const propKey in lastProps) {
          const lastProp = lastProps[propKey];

          if (lastProps.hasOwnProperty(propKey) && lastProp != null) {
            switch (propKey) {
              case 'checked':
                {
                  break;
                }

              case 'value':
                {
                  // This is handled by updateWrapper below.
                  break;
                }

              case 'defaultValue':
                {
                  lastDefaultValue = lastProp;
                }
              // defaultChecked and defaultValue are ignored by setProp
              // Fallthrough

              default:
                {
                  if (!nextProps.hasOwnProperty(propKey)) setProp(domElement, tag, propKey, null, nextProps, lastProp);
                }
            }
          }
        }

        for (const propKey in nextProps) {
          const nextProp = nextProps[propKey];
          const lastProp = lastProps[propKey];

          if (nextProps.hasOwnProperty(propKey) && (nextProp != null || lastProp != null)) {
            switch (propKey) {
              case 'type':
                {
                  type = nextProp;
                  break;
                }

              case 'name':
                {
                  name = nextProp;
                  break;
                }

              case 'checked':
                {
                  checked = nextProp;
                  break;
                }

              case 'defaultChecked':
                {
                  defaultChecked = nextProp;
                  break;
                }

              case 'value':
                {
                  value = nextProp;
                  break;
                }

              case 'defaultValue':
                {
                  defaultValue = nextProp;
                  break;
                }

              case 'children':
              case 'dangerouslySetInnerHTML':
                {
                  if (nextProp != null) {
                    throw Error(formatProdErrorMessage(137, tag));
                  }

                  break;
                }

              default:
                {
                  if (nextProp !== lastProp) setProp(domElement, tag, propKey, nextProp, nextProps, lastProp);
                }
            }
          }
        }
        // happen after updating the rest of props. Otherwise HTML5 input validations
        // raise warnings and prevent the new value from being assigned.


        updateInput(domElement, value, defaultValue, lastDefaultValue, checked, defaultChecked, type, name);
        return;
      }

    case 'select':
      {
        let value = null;
        let defaultValue = null;
        let multiple = null;
        let wasMultiple = null;

        for (const propKey in lastProps) {
          const lastProp = lastProps[propKey];

          if (lastProps.hasOwnProperty(propKey) && lastProp != null) {
            switch (propKey) {
              case 'value':
                {
                  // This is handled by updateWrapper below.
                  break;
                }
              // defaultValue are ignored by setProp

              case 'multiple':
                {
                  wasMultiple = lastProp; // TODO: Move special case in here from setProp.
                }
              // Fallthrough

              default:
                {
                  if (!nextProps.hasOwnProperty(propKey)) setProp(domElement, tag, propKey, null, nextProps, lastProp);
                }
            }
          }
        }

        for (const propKey in nextProps) {
          const nextProp = nextProps[propKey];
          const lastProp = lastProps[propKey];

          if (nextProps.hasOwnProperty(propKey) && (nextProp != null || lastProp != null)) {
            switch (propKey) {
              case 'value':
                {
                  value = nextProp; // This is handled by updateSelect below.

                  break;
                }

              case 'defaultValue':
                {
                  defaultValue = nextProp;
                  break;
                }

              case 'multiple':
                {
                  multiple = nextProp; // TODO: Just move the special case in here from setProp.
                }
              // Fallthrough

              default:
                {
                  if (nextProp !== lastProp) setProp(domElement, tag, propKey, nextProp, nextProps, lastProp);
                }
            }
          }
        } // <select> value update needs to occur after <option> children
        // reconciliation


        updateSelect(domElement, value, defaultValue, multiple, wasMultiple);
        return;
      }

    case 'textarea':
      {
        let value = null;
        let defaultValue = null;

        for (const propKey in lastProps) {
          const lastProp = lastProps[propKey];

          if (lastProps.hasOwnProperty(propKey) && lastProp != null && !nextProps.hasOwnProperty(propKey)) {
            switch (propKey) {
              case 'value':
                {
                  // This is handled by updateTextarea below.
                  break;
                }

              case 'children':
                {
                  // TODO: This doesn't actually do anything if it updates.
                  break;
                }
              // defaultValue is ignored by setProp

              default:
                {
                  setProp(domElement, tag, propKey, null, nextProps, lastProp);
                }
            }
          }
        }

        for (const propKey in nextProps) {
          const nextProp = nextProps[propKey];
          const lastProp = lastProps[propKey];

          if (nextProps.hasOwnProperty(propKey) && (nextProp != null || lastProp != null)) {
            switch (propKey) {
              case 'value':
                {
                  value = nextProp; // This is handled by updateTextarea below.

                  break;
                }

              case 'defaultValue':
                {
                  defaultValue = nextProp;
                  break;
                }

              case 'children':
                {
                  // TODO: This doesn't actually do anything if it updates.
                  break;
                }

              case 'dangerouslySetInnerHTML':
                {
                  if (nextProp != null) {
                    // TODO: Do we really need a special error message for this. It's also pretty blunt.
                    throw Error(formatProdErrorMessage(91));
                  }

                  break;
                }

              default:
                {
                  if (nextProp !== lastProp) setProp(domElement, tag, propKey, nextProp, nextProps, lastProp);
                }
            }
          }
        }

        updateTextarea(domElement, value, defaultValue);
        return;
      }

    case 'option':
      {
        for (const propKey in lastProps) {
          const lastProp = lastProps[propKey];

          if (lastProps.hasOwnProperty(propKey) && lastProp != null && !nextProps.hasOwnProperty(propKey)) {
            switch (propKey) {
              case 'selected':
                {
                  // TODO: Remove support for selected on option.
                  domElement.selected = false;
                  break;
                }

              default:
                {
                  setProp(domElement, tag, propKey, null, nextProps, lastProp);
                }
            }
          }
        }

        for (const propKey in nextProps) {
          const nextProp = nextProps[propKey];
          const lastProp = lastProps[propKey];

          if (nextProps.hasOwnProperty(propKey) && nextProp !== lastProp && (nextProp != null || lastProp != null)) {
            switch (propKey) {
              case 'selected':
                {
                  // TODO: Remove support for selected on option.
                  domElement.selected = nextProp && typeof nextProp !== 'function' && typeof nextProp !== 'symbol';
                  break;
                }

              default:
                {
                  setProp(domElement, tag, propKey, nextProp, nextProps, lastProp);
                }
            }
          }
        }

        return;
      }

    case 'img':
    case 'link':
    case 'area':
    case 'base':
    case 'br':
    case 'col':
    case 'embed':
    case 'hr':
    case 'keygen':
    case 'meta':
    case 'param':
    case 'source':
    case 'track':
    case 'wbr':
    case 'menuitem':
      {
        // Void elements
        for (const propKey in lastProps) {
          const lastProp = lastProps[propKey];

          if (lastProps.hasOwnProperty(propKey) && lastProp != null && !nextProps.hasOwnProperty(propKey)) {
            setProp(domElement, tag, propKey, null, nextProps, lastProp);
          }
        }

        for (const propKey in nextProps) {
          const nextProp = nextProps[propKey];
          const lastProp = lastProps[propKey];

          if (nextProps.hasOwnProperty(propKey) && nextProp !== lastProp && (nextProp != null || lastProp != null)) {
            switch (propKey) {
              case 'children':
              case 'dangerouslySetInnerHTML':
                {
                  if (nextProp != null) {
                    // TODO: Can we make this a DEV warning to avoid this deny list?
                    throw Error(formatProdErrorMessage(137, tag));
                  }

                  break;
                }
              // defaultChecked and defaultValue are ignored by setProp

              default:
                {
                  setProp(domElement, tag, propKey, nextProp, nextProps, lastProp);
                }
            }
          }
        }

        return;
      }

    default:
      {
        if (isCustomElement(tag)) {
          for (const propKey in lastProps) {
            const lastProp = lastProps[propKey];

            if (lastProps.hasOwnProperty(propKey) && lastProp != null && !nextProps.hasOwnProperty(propKey)) {
              setPropOnCustomElement(domElement, tag, propKey, null, nextProps, lastProp);
            }
          }

          for (const propKey in nextProps) {
            const nextProp = nextProps[propKey];
            const lastProp = lastProps[propKey];

            if (nextProps.hasOwnProperty(propKey) && nextProp !== lastProp && (nextProp != null || lastProp != null)) {
              setPropOnCustomElement(domElement, tag, propKey, nextProp, nextProps, lastProp);
            }
          }

          return;
        }
      }
  }

  for (const propKey in lastProps) {
    const lastProp = lastProps[propKey];

    if (lastProps.hasOwnProperty(propKey) && lastProp != null && !nextProps.hasOwnProperty(propKey)) {
      setProp(domElement, tag, propKey, null, nextProps, lastProp);
    }
  }

  for (const propKey in nextProps) {
    const nextProp = nextProps[propKey];
    const lastProp = lastProps[propKey];

    if (nextProps.hasOwnProperty(propKey) && nextProp !== lastProp && (nextProp != null || lastProp != null)) {
      setProp(domElement, tag, propKey, nextProp, nextProps, lastProp);
    }
  }
}

function diffHydratedProperties(domElement, tag, props, isConcurrentMode, shouldWarnDev, hostContext) {


  switch (tag) {
    case 'dialog':
      listenToNonDelegatedEvent('cancel', domElement);
      listenToNonDelegatedEvent('close', domElement);
      break;

    case 'iframe':
    case 'object':
    case 'embed':
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the load event.
      listenToNonDelegatedEvent('load', domElement);
      break;

    case 'video':
    case 'audio':
      // We listen to these events in case to ensure emulated bubble
      // listeners still fire for all the media events.
      for (let i = 0; i < mediaEventTypes.length; i++) {
        listenToNonDelegatedEvent(mediaEventTypes[i], domElement);
      }

      break;

    case 'source':
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the error event.
      listenToNonDelegatedEvent('error', domElement);
      break;

    case 'img':
    case 'image':
    case 'link':
      // We listen to these events in case to ensure emulated bubble
      // listeners still fire for error and load events.
      listenToNonDelegatedEvent('error', domElement);
      listenToNonDelegatedEvent('load', domElement);
      break;

    case 'details':
      // We listen to this event in case to ensure emulated bubble
      // listeners still fire for the toggle event.
      listenToNonDelegatedEvent('toggle', domElement);
      break;

    case 'input':
      // listeners still fire for the invalid event.


      listenToNonDelegatedEvent('invalid', domElement); // TODO: Make sure we check if this is still unmounted or do any clean
      // post mount to force it to diverge from attributes. However, for
      // option and select we don't quite do the same thing and select
      // is not resilient to the DOM state changing so we don't do that here.
      // TODO: Consider not doing this for input and textarea.

      initInput(domElement, props.value, props.defaultValue, props.checked, props.defaultChecked, props.type, props.name, true);
      track(domElement);
      break;

    case 'option':
      break;

    case 'select':
      // listeners still fire for the invalid event.


      listenToNonDelegatedEvent('invalid', domElement);
      break;

    case 'textarea':
      // listeners still fire for the invalid event.


      listenToNonDelegatedEvent('invalid', domElement); // TODO: Make sure we check if this is still unmounted or do any clean
      initTextarea(domElement, props.value, props.defaultValue, props.children);
      track(domElement);
      break;
  }

  const children = props.children; // For text content children we compare against textContent. This
  // might match additional HTML that is hidden when we read it using
  // textContent. E.g. "foo" will match "f<span>oo</span>" but that still
  // satisfies our requirement. Our requirement is not to produce perfect
  // HTML and attributes. Ideally we should preserve structure but it's
  // ok not to if the visible content is still enough to indicate what
  // even listeners these nodes might be wired up to.
  // TODO: Warn if there is more than a single textNode as a child.
  // TODO: Should we use domElement.firstChild.nodeValue to compare?

  if (typeof children === 'string' || typeof children === 'number') {
    if (domElement.textContent !== '' + children) {
      if (props.suppressHydrationWarning !== true) {
        checkForUnmatchedText(domElement.textContent, children, isConcurrentMode);
      }

      if (!isConcurrentMode || !enableClientRenderFallbackOnTextMismatch) {
        // We really should be patching this in the commit phase but since
        // this only affects legacy mode hydration which is deprecated anyway
        // we can get away with it.
        // Host singletons get their children appended and don't use the text
        // content mechanism.
        if (tag !== 'body') {
          domElement.textContent = children;
        }
      }
    }
  }

  if (props.onScroll != null) {
    listenToNonDelegatedEvent('scroll', domElement);
  }

  if (props.onScrollEnd != null) {
    listenToNonDelegatedEvent('scrollend', domElement);
  }

  if (props.onClick != null) {
    // TODO: This cast may not be sound for SVG, MathML or custom elements.
    trapClickOnNonInteractiveElement(domElement);
  }
}
function diffHydratedText(textNode, text, isConcurrentMode) {
  const isDifferent = textNode.nodeValue !== text;
  return isDifferent;
}
function restoreControlledState(domElement, tag, props) {
  switch (tag) {
    case 'input':
      restoreControlledInputState(domElement, props);
      return;

    case 'textarea':
      restoreControlledTextareaState(domElement, props);
      return;

    case 'select':
      restoreControlledSelectState(domElement, props);
      return;
  }
}

const SUPPRESS_HYDRATION_WARNING = 'suppressHydrationWarning';
const SUSPENSE_START_DATA = '$';
const SUSPENSE_END_DATA = '/$';
const SUSPENSE_PENDING_START_DATA = '$?';
const SUSPENSE_FALLBACK_START_DATA = '$!';
const FORM_STATE_IS_MATCHING = 'F!';
const FORM_STATE_IS_NOT_MATCHING = 'F';
const STYLE = 'style';
const HostContextNamespaceNone = 0;
const HostContextNamespaceSvg = 1;
const HostContextNamespaceMath = 2;
let eventsEnabled = null;
let selectionInformation = null;

function getOwnerDocumentFromRootContainer(rootContainerElement) {
  return rootContainerElement.nodeType === DOCUMENT_NODE ? rootContainerElement : rootContainerElement.ownerDocument;
}

function getRootHostContext(rootContainerInstance) {
  let type;
  let context;
  const nodeType = rootContainerInstance.nodeType;

  switch (nodeType) {
    case DOCUMENT_NODE:
    case DOCUMENT_FRAGMENT_NODE:
      {
        type = nodeType === DOCUMENT_NODE ? '#document' : '#fragment';
        const root = rootContainerInstance.documentElement;

        if (root) {
          const namespaceURI = root.namespaceURI;
          context = namespaceURI ? getOwnHostContext(namespaceURI) : HostContextNamespaceNone;
        } else {
          context = HostContextNamespaceNone;
        }

        break;
      }

    default:
      {
        const container = nodeType === COMMENT_NODE ? rootContainerInstance.parentNode : rootContainerInstance;
        type = container.tagName;
        const namespaceURI = container.namespaceURI;

        if (!namespaceURI) {
          switch (type) {
            case 'svg':
              context = HostContextNamespaceSvg;
              break;

            case 'math':
              context = HostContextNamespaceMath;
              break;

            default:
              context = HostContextNamespaceNone;
              break;
          }
        } else {
          const ownContext = getOwnHostContext(namespaceURI);
          context = getChildHostContextProd(ownContext, type);
        }

        break;
      }
  }

  return context;
}

function getOwnHostContext(namespaceURI) {
  switch (namespaceURI) {
    case SVG_NAMESPACE:
      return HostContextNamespaceSvg;

    case MATH_NAMESPACE:
      return HostContextNamespaceMath;

    default:
      return HostContextNamespaceNone;
  }
}

function getChildHostContextProd(parentNamespace, type) {
  if (parentNamespace === HostContextNamespaceNone) {
    // No (or default) parent namespace: potential entry point.
    switch (type) {
      case 'svg':
        return HostContextNamespaceSvg;

      case 'math':
        return HostContextNamespaceMath;

      default:
        return HostContextNamespaceNone;
    }
  }

  if (parentNamespace === HostContextNamespaceSvg && type === 'foreignObject') {
    // We're leaving SVG.
    return HostContextNamespaceNone;
  } // By default, pass namespace below.


  return parentNamespace;
}

function getChildHostContext(parentHostContext, type) {

  const parentNamespace = parentHostContext;
  return getChildHostContextProd(parentNamespace, type);
}
function getPublicInstance(instance) {
  return instance;
}
function prepareForCommit(containerInfo) {
  eventsEnabled = isEnabled();
  selectionInformation = getSelectionInformation();
  let activeInstance = null;

  setEnabled(false);
  return activeInstance;
}
function resetAfterCommit(containerInfo) {
  restoreSelection(selectionInformation);
  setEnabled(eventsEnabled);
  eventsEnabled = null;
  selectionInformation = null;
}
function createHoistableInstance(type, props, rootContainerInstance, internalInstanceHandle) {
  const ownerDocument = getOwnerDocumentFromRootContainer(rootContainerInstance);
  const domElement = ownerDocument.createElement(type);
  precacheFiberNode(internalInstanceHandle, domElement);
  updateFiberProps(domElement, props);
  setInitialProperties(domElement, type, props);
  markNodeAsHoistable(domElement);
  return domElement;
}
function createInstance(type, props, rootContainerInstance, hostContext, internalInstanceHandle) {
  let hostContextProd;

  {
    hostContextProd = hostContext;
  }

  const ownerDocument = getOwnerDocumentFromRootContainer(rootContainerInstance);
  let domElement;

  switch (hostContextProd) {
    case HostContextNamespaceSvg:
      domElement = ownerDocument.createElementNS(SVG_NAMESPACE, type);
      break;

    case HostContextNamespaceMath:
      domElement = ownerDocument.createElementNS(MATH_NAMESPACE, type);
      break;

    default:
      switch (type) {
        case 'svg':
          {
            domElement = ownerDocument.createElementNS(SVG_NAMESPACE, type);
            break;
          }

        case 'math':
          {
            domElement = ownerDocument.createElementNS(MATH_NAMESPACE, type);
            break;
          }

        case 'script':
          {
            // Create the script via .innerHTML so its "parser-inserted" flag is
            // set to true and it does not execute
            const div = ownerDocument.createElement('div');

            div.innerHTML = '<script><' + '/script>'; // eslint-disable-line
            // This is guaranteed to yield a script element.

            const firstChild = div.firstChild;
            domElement = div.removeChild(firstChild);
            break;
          }

        case 'select':
          {
            if (typeof props.is === 'string') {
              domElement = ownerDocument.createElement('select', {
                is: props.is
              });
            } else {
              // Separate else branch instead of using `props.is || undefined` above because of a Firefox bug.
              // See discussion in https://github.com/facebook/react/pull/6896
              // and discussion in https://bugzilla.mozilla.org/show_bug.cgi?id=1276240
              domElement = ownerDocument.createElement('select');
            }

            if (props.multiple) {
              domElement.multiple = true;
            } else if (props.size) {
              // Setting a size greater than 1 causes a select to behave like `multiple=true`, where
              // it is possible that no option is selected.
              //
              // This is only necessary when a select in "single selection mode".
              domElement.size = props.size;
            }

            break;
          }

        default:
          {
            if (typeof props.is === 'string') {
              domElement = ownerDocument.createElement(type, {
                is: props.is
              });
            } else {
              // Separate else branch instead of using `props.is || undefined` above because of a Firefox bug.
              // See discussion in https://github.com/facebook/react/pull/6896
              // and discussion in https://bugzilla.mozilla.org/show_bug.cgi?id=1276240
              domElement = ownerDocument.createElement(type);
            }
          }
      }

  }

  precacheFiberNode(internalInstanceHandle, domElement);
  updateFiberProps(domElement, props);
  return domElement;
}
function appendInitialChild(parentInstance, child) {
  parentInstance.appendChild(child);
}
function finalizeInitialChildren(domElement, type, props, hostContext) {
  setInitialProperties(domElement, type, props);

  switch (type) {
    case 'button':
    case 'input':
    case 'select':
    case 'textarea':
      return !!props.autoFocus;

    case 'img':
      return true;

    default:
      return false;
  }
}
function shouldSetTextContent(type, props) {
  return type === 'textarea' || type === 'noscript' || typeof props.children === 'string' || typeof props.children === 'number' || typeof props.dangerouslySetInnerHTML === 'object' && props.dangerouslySetInnerHTML !== null && props.dangerouslySetInnerHTML.__html != null;
}
function createTextInstance(text, rootContainerInstance, hostContext, internalInstanceHandle) {

  const textNode = getOwnerDocumentFromRootContainer(rootContainerInstance).createTextNode(text);
  precacheFiberNode(internalInstanceHandle, textNode);
  return textNode;
}
function getCurrentEventPriority() {
  const currentEvent = window.event;

  if (currentEvent === undefined) {
    return DefaultEventPriority;
  }

  return getEventPriority(currentEvent.type);
}
let currentPopstateTransitionEvent = null;
function shouldAttemptEagerTransition() {
  const event = window.event;

  if (event && event.type === 'popstate') {
    // This is a popstate event. Attempt to render any transition during this
    // event synchronously. Unless we already attempted during this event.
    if (event === currentPopstateTransitionEvent) {
      // We already attempted to render this popstate transition synchronously.
      // Any subsequent attempts must have happened as the result of a derived
      // update, like startTransition inside useEffect, or useDV. Switch back to
      // the default behavior for all remaining transitions during the current
      // popstate event.
      return false;
    } else {
      // Cache the current event in case a derived transition is scheduled.
      // (Refer to previous branch.)
      currentPopstateTransitionEvent = event;
      return true;
    }
  } // We're not inside a popstate event.


  currentPopstateTransitionEvent = null;
  return false;
}
// if a component just imports ReactDOM (e.g. for findDOMNode).
// Some environments might not have setTimeout or clearTimeout.

const scheduleTimeout = typeof setTimeout === 'function' ? setTimeout : undefined;
const cancelTimeout = typeof clearTimeout === 'function' ? clearTimeout : undefined;
const noTimeout = -1;
const localPromise = typeof Promise === 'function' ? Promise : undefined;
function preparePortalMount(portalInstance) {
  listenToAllSupportedEvents(portalInstance);
}
const scheduleMicrotask = typeof queueMicrotask === 'function' ? queueMicrotask : typeof localPromise !== 'undefined' ? callback => localPromise.resolve(null).then(callback).catch(handleErrorInNextTick) : scheduleTimeout; // TODO: Determine the best fallback here.

function handleErrorInNextTick(error) {
  setTimeout(() => {
    throw error;
  });
} // -------------------
function commitMount(domElement, type, newProps, internalInstanceHandle) {
  // Despite the naming that might imply otherwise, this method only
  // fires if there is an `Update` effect scheduled during mounting.
  // This happens if `finalizeInitialChildren` returns `true` (which it
  // does to implement the `autoFocus` attribute on the client). But
  // there are also other cases when this might happen (such as patching
  // up text content during hydration mismatch). So we'll check this again.
  switch (type) {
    case 'button':
    case 'input':
    case 'select':
    case 'textarea':
      if (newProps.autoFocus) {
        domElement.focus();
      }

      return;

    case 'img':
      {
        if (newProps.src) {
          domElement.src = newProps.src;
        }

        return;
      }
  }
}
function commitUpdate(domElement, updatePayload, type, oldProps, newProps, internalInstanceHandle) {
  // Diff and update the properties.
  updateProperties(domElement, type, oldProps, newProps); // Update the props handle so that we know which props are the ones with
  // with current event handlers.

  updateFiberProps(domElement, newProps);
}
function resetTextContent(domElement) {
  setTextContent(domElement, '');
}
function commitTextUpdate(textInstance, oldText, newText) {
  textInstance.nodeValue = newText;
}
function appendChild(parentInstance, child) {
  parentInstance.appendChild(child);
}
function appendChildToContainer(container, child) {
  let parentNode;

  if (container.nodeType === COMMENT_NODE) {
    parentNode = container.parentNode;
    parentNode.insertBefore(child, container);
  } else {
    parentNode = container;
    parentNode.appendChild(child);
  } // This container might be used for a portal.
  // If something inside a portal is clicked, that click should bubble
  // through the React tree. However, on Mobile Safari the click would
  // never bubble through the *DOM* tree unless an ancestor with onclick
  // event exists. So we wouldn't see it and dispatch it.
  // This is why we ensure that non React root containers have inline onclick
  // defined.
  // https://github.com/facebook/react/issues/11918


  const reactRootContainer = container._reactRootContainer;

  if ((reactRootContainer === null || reactRootContainer === undefined) && parentNode.onclick === null) {
    // TODO: This cast may not be sound for SVG, MathML or custom elements.
    trapClickOnNonInteractiveElement(parentNode);
  }
}
function insertBefore(parentInstance, child, beforeChild) {
  parentInstance.insertBefore(child, beforeChild);
}
function insertInContainerBefore(container, child, beforeChild) {
  if (container.nodeType === COMMENT_NODE) {
    container.parentNode.insertBefore(child, beforeChild);
  } else {
    container.insertBefore(child, beforeChild);
  }
}

function removeChild(parentInstance, child) {
  parentInstance.removeChild(child);
}
function removeChildFromContainer(container, child) {
  if (container.nodeType === COMMENT_NODE) {
    container.parentNode.removeChild(child);
  } else {
    container.removeChild(child);
  }
}
function clearSuspenseBoundary(parentInstance, suspenseInstance) {
  let node = suspenseInstance; // Delete all nodes within this suspense boundary.
  // There might be nested nodes so we need to keep track of how
  // deep we are and only break out when we're back on top.

  let depth = 0;

  do {
    const nextNode = node.nextSibling;
    parentInstance.removeChild(node);

    if (nextNode && nextNode.nodeType === COMMENT_NODE) {
      const data = nextNode.data;

      if (data === SUSPENSE_END_DATA) {
        if (depth === 0) {
          parentInstance.removeChild(nextNode); // Retry if any event replaying was blocked on this.

          retryIfBlockedOn(suspenseInstance);
          return;
        } else {
          depth--;
        }
      } else if (data === SUSPENSE_START_DATA || data === SUSPENSE_PENDING_START_DATA || data === SUSPENSE_FALLBACK_START_DATA) {
        depth++;
      }
    } // $FlowFixMe[incompatible-type] we bail out when we get a null


    node = nextNode;
  } while (node); // TODO: Warn, we didn't find the end comment boundary.
  // Retry if any event replaying was blocked on this.


  retryIfBlockedOn(suspenseInstance);
}
function clearSuspenseBoundaryFromContainer(container, suspenseInstance) {
  if (container.nodeType === COMMENT_NODE) {
    clearSuspenseBoundary(container.parentNode, suspenseInstance);
  } else if (container.nodeType === ELEMENT_NODE) {
    clearSuspenseBoundary(container, suspenseInstance);
  } else ; // Retry if any event replaying was blocked on this.


  retryIfBlockedOn(container);
}
function hideInstance(instance) {
  // TODO: Does this work for all element types? What about MathML? Should we
  // pass host context to this method?
  instance = instance;
  const style = instance.style; // $FlowFixMe[method-unbinding]

  if (typeof style.setProperty === 'function') {
    style.setProperty('display', 'none', 'important');
  } else {
    style.display = 'none';
  }
}
function hideTextInstance(textInstance) {
  textInstance.nodeValue = '';
}
function unhideInstance(instance, props) {
  instance = instance;
  const styleProp = props[STYLE];
  const display = styleProp !== undefined && styleProp !== null && styleProp.hasOwnProperty('display') ? styleProp.display : null;
  instance.style.display = display == null || typeof display === 'boolean' ? '' : // The value would've errored already if it wasn't safe.
  // eslint-disable-next-line react-internal/safe-string-coercion
  ('' + display).trim();
}
function unhideTextInstance(textInstance, text) {
  textInstance.nodeValue = text;
}
function clearContainer(container) {
  {
    const nodeType = container.nodeType;

    if (nodeType === DOCUMENT_NODE) {
      clearContainerSparingly(container);
    } else if (nodeType === ELEMENT_NODE) {
      switch (container.nodeName) {
        case 'HEAD':
        case 'HTML':
        case 'BODY':
          clearContainerSparingly(container);
          return;

        default:
          {
            container.textContent = '';
          }
      }
    }
  }
}

function clearContainerSparingly(container) {
  let node;
  let nextNode = container.firstChild;

  if (nextNode && nextNode.nodeType === DOCUMENT_TYPE_NODE) {
    nextNode = nextNode.nextSibling;
  }

  while (nextNode) {
    node = nextNode;
    nextNode = nextNode.nextSibling;

    switch (node.nodeName) {
      case 'HTML':
      case 'HEAD':
      case 'BODY':
        {
          const element = node;
          clearContainerSparingly(element); // If these singleton instances had previously been rendered with React they
          // may still hold on to references to the previous fiber tree. We detatch them
          // prospectively to reset them to a baseline starting state since we cannot create
          // new instances.

          detachDeletedInstance(element);
          continue;
        }
      // Script tags are retained to avoid an edge case bug. Normally scripts will execute if they
      // are ever inserted into the DOM. However when streaming if a script tag is opened but not
      // yet closed some browsers create and insert the script DOM Node but the script cannot execute
      // yet until the closing tag is parsed. If something causes React to call clearContainer while
      // this DOM node is in the document but not yet executable the DOM node will be removed from the
      // document and when the script closing tag comes in the script will not end up running. This seems
      // to happen in Chrome/Firefox but not Safari at the moment though this is not necessarily specified
      // behavior so it could change in future versions of browsers. While leaving all scripts is broader
      // than strictly necessary this is the least amount of additional code to avoid this breaking
      // edge case.
      //
      // Style tags are retained because they may likely come from 3rd party scripts and extensions

      case 'SCRIPT':
      case 'STYLE':
        {
          continue;
        }
      // Stylesheet tags are retained because tehy may likely come from 3rd party scripts and extensions

      case 'LINK':
        {
          if (node.rel.toLowerCase() === 'stylesheet') {
            continue;
          }
        }
    }

    container.removeChild(node);
  }

  return;
} // Making this so we can eventually move all of the instance caching to the commit phase.
function isHydratableText(text) {
  return text !== '';
}
function canHydrateInstance(instance, type, props, inRootOrSingleton) {
  while (instance.nodeType === ELEMENT_NODE) {
    const element = instance;
    const anyProps = props;

    if (element.nodeName.toLowerCase() !== type.toLowerCase()) {
      if (!inRootOrSingleton || !enableHostSingletons) {
        // Usually we error for mismatched tags.
        if (element.nodeName === 'INPUT' && element.type === 'hidden') ; else {
          return null;
        }
      } // In root or singleton parents we skip past mismatched instances.

    } else if (!inRootOrSingleton || !enableHostSingletons) {
      // Match
      if (type === 'input' && element.type === 'hidden') {

        const name = anyProps.name == null ? null : '' + anyProps.name;

        if (anyProps.type !== 'hidden' || element.getAttribute('name') !== name) ; else {
          return element;
        }
      } else {
        return element;
      }
    } else if (isMarkedHoistable(element)) ; else {
      // We have an Element with the right type.
      // We are going to try to exclude it if we can definitely identify it as a hoisted Node or if
      // we can guess that the node is likely hoisted or was inserted by a 3rd party script or browser extension
      // using high entropy attributes for certain types. This technique will fail for strange insertions like
      // extension prepending <div> in the <body> but that already breaks before and that is an edge case.
      switch (type) {
        // case 'title':
        //We assume all titles are matchable. You should only have one in the Document, at least in a hoistable scope
        // and if you are a HostComponent with type title we must either be in an <svg> context or this title must have an `itemProp` prop.
        case 'meta':
          {
            // The only way to opt out of hoisting meta tags is to give it an itemprop attribute. We assume there will be
            // not 3rd party meta tags that are prepended, accepting the cases where this isn't true because meta tags
            // are usually only functional for SSR so even in a rare case where we did bind to an injected tag the runtime
            // implications are minimal
            if (!element.hasAttribute('itemprop')) {
              // This is a Hoistable
              break;
            }

            return element;
          }

        case 'link':
          {
            // Links come in many forms and we do expect 3rd parties to inject them into <head> / <body>. We exclude known resources
            // and then use high-entroy attributes like href which are almost always used and almost always unique to filter out unlikely
            // matches.
            const rel = element.getAttribute('rel');

            if (rel === 'stylesheet' && element.hasAttribute('data-precedence')) {
              // This is a stylesheet resource
              break;
            } else if (rel !== anyProps.rel || element.getAttribute('href') !== (anyProps.href == null ? null : anyProps.href) || element.getAttribute('crossorigin') !== (anyProps.crossOrigin == null ? null : anyProps.crossOrigin) || element.getAttribute('title') !== (anyProps.title == null ? null : anyProps.title)) {
              // rel + href should usually be enough to uniquely identify a link however crossOrigin can vary for rel preconnect
              // and title could vary for rel alternate
              break;
            }

            return element;
          }

        case 'style':
          {
            // Styles are hard to match correctly. We can exclude known resources but otherwise we accept the fact that a non-hoisted style tags
            // in <head> or <body> are likely never going to be unmounted given their position in the document and the fact they likely hold global styles
            if (element.hasAttribute('data-precedence')) {
              // This is a style resource
              break;
            }

            return element;
          }

        case 'script':
          {
            // Scripts are a little tricky, we exclude known resources and then similar to links try to use high-entropy attributes
            // to reject poor matches. One challenge with scripts are inline scripts. We don't attempt to check text content which could
            // in theory lead to a hydration error later if a 3rd party injected an inline script before the React rendered nodes.
            // Falling back to client rendering if this happens should be seemless though so we will try this hueristic and revisit later
            // if we learn it is problematic
            const srcAttr = element.getAttribute('src');

            if (srcAttr !== (anyProps.src == null ? null : anyProps.src) || element.getAttribute('type') !== (anyProps.type == null ? null : anyProps.type) || element.getAttribute('crossorigin') !== (anyProps.crossOrigin == null ? null : anyProps.crossOrigin)) {
              // This script is for a different src/type/crossOrigin. It may be a script resource
              // or it may just be a mistmatch
              if (srcAttr && element.hasAttribute('async') && !element.hasAttribute('itemprop')) {
                // This is an async script resource
                break;
              }
            }

            return element;
          }

        default:
          {
            // We have excluded the most likely cases of mismatch between hoistable tags, 3rd party script inserted tags,
            // and browser extension inserted tags. While it is possible this is not the right match it is a decent hueristic
            // that should work in the vast majority of cases.
            return element;
          }
      }
    }

    const nextInstance = getNextHydratableSibling(element);

    if (nextInstance === null) {
      break;
    }

    instance = nextInstance;
  } // This is a suspense boundary or Text node or we got the end.
  // Suspense Boundaries are never expected to be injected by 3rd parties. If we see one it should be matched
  // and this is a hydration error.
  // Text Nodes are also not expected to be injected by 3rd parties. This is less of a guarantee for <body>
  // but it seems reasonable and conservative to reject this as a hydration error as well


  return null;
}
function canHydrateTextInstance(instance, text, inRootOrSingleton) {
  // Empty strings are not parsed by HTML so there won't be a correct match here.
  if (text === '') return null;

  while (instance.nodeType !== TEXT_NODE) {
    if (instance.nodeType === ELEMENT_NODE && instance.nodeName === 'INPUT' && instance.type === 'hidden') ; else if (!inRootOrSingleton || !enableHostSingletons) {
      return null;
    }

    const nextInstance = getNextHydratableSibling(instance);

    if (nextInstance === null) {
      return null;
    }

    instance = nextInstance;
  } // This has now been refined to a text node.


  return instance;
}
function canHydrateSuspenseInstance(instance, inRootOrSingleton) {
  while (instance.nodeType !== COMMENT_NODE) {
    if (!inRootOrSingleton || !enableHostSingletons) {
      return null;
    }

    const nextInstance = getNextHydratableSibling(instance);

    if (nextInstance === null) {
      return null;
    }

    instance = nextInstance;
  } // This has now been refined to a suspense node.


  return instance;
}
function isSuspenseInstancePending(instance) {
  return instance.data === SUSPENSE_PENDING_START_DATA;
}
function isSuspenseInstanceFallback(instance) {
  return instance.data === SUSPENSE_FALLBACK_START_DATA;
}
function getSuspenseInstanceFallbackErrorDetails(instance) {
  const dataset = instance.nextSibling && instance.nextSibling.dataset;
  let digest;

  if (dataset) {
    digest = dataset.dgst;
  }

  {
    // Object gets DCE'd if constructed in tail position and matches callsite destructuring
    return {
      digest
    };
  }
}
function registerSuspenseInstanceRetry(instance, callback) {
  instance._reactRetry = callback;
}
function canHydrateFormStateMarker(instance, inRootOrSingleton) {
  while (instance.nodeType !== COMMENT_NODE) {
    if (!inRootOrSingleton || !enableHostSingletons) {
      return null;
    }

    const nextInstance = getNextHydratableSibling(instance);

    if (nextInstance === null) {
      return null;
    }

    instance = nextInstance;
  }

  const nodeData = instance.data;

  if (nodeData === FORM_STATE_IS_MATCHING || nodeData === FORM_STATE_IS_NOT_MATCHING) {
    const markerInstance = instance;
    return markerInstance;
  }

  return null;
}
function isFormStateMarkerMatching(markerInstance) {
  return markerInstance.data === FORM_STATE_IS_MATCHING;
}

function getNextHydratable(node) {
  // Skip non-hydratable nodes.
  for (; node != null; node = node.nextSibling) {
    const nodeType = node.nodeType;

    if (nodeType === ELEMENT_NODE || nodeType === TEXT_NODE) {
      break;
    }

    if (nodeType === COMMENT_NODE) {
      const nodeData = node.data;

      if (nodeData === SUSPENSE_START_DATA || nodeData === SUSPENSE_FALLBACK_START_DATA || nodeData === SUSPENSE_PENDING_START_DATA || (nodeData === FORM_STATE_IS_MATCHING || nodeData === FORM_STATE_IS_NOT_MATCHING)) {
        break;
      }

      if (nodeData === SUSPENSE_END_DATA) {
        return null;
      }
    }
  }

  return node;
}

function getNextHydratableSibling(instance) {
  return getNextHydratable(instance.nextSibling);
}
function getFirstHydratableChild(parentInstance) {
  return getNextHydratable(parentInstance.firstChild);
}
function getFirstHydratableChildWithinContainer(parentContainer) {
  return getNextHydratable(parentContainer.firstChild);
}
function getFirstHydratableChildWithinSuspenseInstance(parentInstance) {
  return getNextHydratable(parentInstance.nextSibling);
}
function hydrateInstance(instance, type, props, hostContext, internalInstanceHandle, shouldWarnDev) {
  precacheFiberNode(internalInstanceHandle, instance); // TODO: Possibly defer this until the commit phase where all the events
  // get attached.

  updateFiberProps(instance, props); // TODO: Temporary hack to check if we're in a concurrent root. We can delete
  // when the legacy root API is removed.

  const isConcurrentMode = (internalInstanceHandle.mode & ConcurrentMode) !== NoMode;
  diffHydratedProperties(instance, type, props, isConcurrentMode);
}
function hydrateTextInstance(textInstance, text, internalInstanceHandle, shouldWarnDev) {
  precacheFiberNode(internalInstanceHandle, textInstance); // TODO: Temporary hack to check if we're in a concurrent root. We can delete
  return diffHydratedText(textInstance, text);
}
function hydrateSuspenseInstance(suspenseInstance, internalInstanceHandle) {
  precacheFiberNode(internalInstanceHandle, suspenseInstance);
}
function getNextHydratableInstanceAfterSuspenseInstance(suspenseInstance) {
  let node = suspenseInstance.nextSibling; // Skip past all nodes within this suspense boundary.
  // There might be nested nodes so we need to keep track of how
  // deep we are and only break out when we're back on top.

  let depth = 0;

  while (node) {
    if (node.nodeType === COMMENT_NODE) {
      const data = node.data;

      if (data === SUSPENSE_END_DATA) {
        if (depth === 0) {
          return getNextHydratableSibling(node);
        } else {
          depth--;
        }
      } else if (data === SUSPENSE_START_DATA || data === SUSPENSE_FALLBACK_START_DATA || data === SUSPENSE_PENDING_START_DATA) {
        depth++;
      }
    }

    node = node.nextSibling;
  } // TODO: Warn, we didn't find the end comment boundary.


  return null;
} // Returns the SuspenseInstance if this node is a direct child of a
// SuspenseInstance. I.e. if its previous sibling is a Comment with
// SUSPENSE_x_START_DATA. Otherwise, null.

function getParentSuspenseInstance(targetInstance) {
  let node = targetInstance.previousSibling; // Skip past all nodes within this suspense boundary.
  // There might be nested nodes so we need to keep track of how
  // deep we are and only break out when we're back on top.

  let depth = 0;

  while (node) {
    if (node.nodeType === COMMENT_NODE) {
      const data = node.data;

      if (data === SUSPENSE_START_DATA || data === SUSPENSE_FALLBACK_START_DATA || data === SUSPENSE_PENDING_START_DATA) {
        if (depth === 0) {
          return node;
        } else {
          depth--;
        }
      } else if (data === SUSPENSE_END_DATA) {
        depth++;
      }
    }

    node = node.previousSibling;
  }

  return null;
}
function commitHydratedContainer(container) {
  // Retry if any event replaying was blocked on this.
  retryIfBlockedOn(container);
}
function commitHydratedSuspenseInstance(suspenseInstance) {
  // Retry if any event replaying was blocked on this.
  retryIfBlockedOn(suspenseInstance);
}
function shouldDeleteUnhydratedTailInstances(parentType) {
  return (parentType !== 'form' && parentType !== 'button');
}
function didNotMatchHydratedContainerTextInstance(parentContainer, textInstance, text, isConcurrentMode, shouldWarnDev) {
  checkForUnmatchedText(textInstance.nodeValue, text, isConcurrentMode);
}
function didNotMatchHydratedTextInstance(parentType, parentProps, parentInstance, textInstance, text, isConcurrentMode, shouldWarnDev) {
  if (parentProps[SUPPRESS_HYDRATION_WARNING] !== true) {
    checkForUnmatchedText(textInstance.nodeValue, text, isConcurrentMode);
  }
}
function isHostSingletonType(type) {
  return type === 'html' || type === 'head' || type === 'body';
}
function resolveSingletonInstance(type, props, rootContainerInstance, hostContext, validateDOMNestingDev) {

  const ownerDocument = getOwnerDocumentFromRootContainer(rootContainerInstance);

  switch (type) {
    case 'html':
      {
        const documentElement = ownerDocument.documentElement;

        if (!documentElement) {
          throw Error(formatProdErrorMessage(452));
        }

        return documentElement;
      }

    case 'head':
      {
        const head = ownerDocument.head;

        if (!head) {
          throw Error(formatProdErrorMessage(453));
        }

        return head;
      }

    case 'body':
      {
        const body = ownerDocument.body;

        if (!body) {
          throw Error(formatProdErrorMessage(454));
        }

        return body;
      }

    default:
      {
        throw Error(formatProdErrorMessage(451));
      }
  }
}
function acquireSingletonInstance(type, props, instance, internalInstanceHandle) {

  const attributes = instance.attributes;

  while (attributes.length) {
    instance.removeAttributeNode(attributes[0]);
  }

  setInitialProperties(instance, type, props);
  precacheFiberNode(internalInstanceHandle, instance);
  updateFiberProps(instance, props);
}
function releaseSingletonInstance(instance) {
  const attributes = instance.attributes;

  while (attributes.length) {
    instance.removeAttributeNode(attributes[0]);
  }

  detachDeletedInstance(instance);
}
function clearSingleton(instance) {
  const element = instance;
  let node = element.firstChild;

  while (node) {
    const nextNode = node.nextSibling;
    const nodeName = node.nodeName;

    if (isMarkedHoistable(node) || nodeName === 'HEAD' || nodeName === 'BODY' || nodeName === 'SCRIPT' || nodeName === 'STYLE' || nodeName === 'LINK' && node.rel.toLowerCase() === 'stylesheet') ; else {
      element.removeChild(node);
    }

    node = nextNode;
  }

  return;
} // -------------------
const NotLoaded =
/*       */
0b000;
const Loaded =
/*          */
0b001;
const Errored =
/*         */
0b010;
const Settled =
/*         */
0b011;
const Inserted =
/*        */
0b100;
function prepareToCommitHoistables() {
  tagCaches = null;
} // global collections of Resources

const preloadPropsMap = new Map();
const preconnectsSet = new Set(); // getRootNode is missing from IE and old jsdom versions

function getHoistableRoot(container) {
  // $FlowFixMe[method-unbinding]
  return typeof container.getRootNode === 'function' ?
  /* $FlowFixMe[incompatible-return] Flow types this as returning a `Node`,
   * but it's either a `Document` or `ShadowRoot`. */
  container.getRootNode() : container.ownerDocument;
}

function getCurrentResourceRoot() {
  const currentContainer = getCurrentRootHostContainer();
  return currentContainer ? getHoistableRoot(currentContainer) : null;
}

function getDocumentFromRoot(root) {
  return root.ownerDocument || root;
} // We want this to be the default dispatcher on ReactDOMSharedInternals but we don't want to mutate
// internals in Module scope. Instead we export it and Internals will import it. There is already a cycle
// from Internals -> ReactDOM -> HostConfig -> Internals so this doesn't introduce a new one.


const ReactDOMClientDispatcher = {
  prefetchDNS: prefetchDNS$1,
  preconnect: preconnect$1,
  preload: preload$1,
  preloadModule: preloadModule$1,
  preinitStyle,
  preinitScript,
  preinitModuleScript
}; // We expect this to get inlined. It is a function mostly to communicate the special nature of
// how we resolve the HoistableRoot for ReactDOM.pre*() methods. Because we support calling
// these methods outside of render there is no way to know which Document or ShadowRoot is 'scoped'
// and so we have to fall back to something universal. Currently we just refer to the global document.
// This is notable because nowhere else in ReactDOM do we actually reference the global document or window
// because we may be rendering inside an iframe.

function getDocumentForImperativeFloatMethods() {
  return document;
}

function preconnectAs(rel, href, crossOrigin) {
  const ownerDocument = getDocumentForImperativeFloatMethods();

  if (typeof href === 'string' && href) {
    const limitedEscapedHref = escapeSelectorAttributeValueInsideDoubleQuotes(href);
    let key = "link[rel=\"" + rel + "\"][href=\"" + limitedEscapedHref + "\"]";

    if (typeof crossOrigin === 'string') {
      key += "[crossorigin=\"" + crossOrigin + "\"]";
    }

    if (!preconnectsSet.has(key)) {
      preconnectsSet.add(key);
      const preconnectProps = {
        rel,
        crossOrigin,
        href
      };

      if (null === ownerDocument.querySelector(key)) {
        const instance = ownerDocument.createElement('link');
        setInitialProperties(instance, 'link', preconnectProps);
        markNodeAsHoistable(instance);
        ownerDocument.head.appendChild(instance);
      }
    }
  }
}

function prefetchDNS$1(href) {

  preconnectAs('dns-prefetch', href, null);
}

function preconnect$1(href, crossOrigin) {

  preconnectAs('preconnect', href, crossOrigin);
}

function preload$1(href, as, options) {

  const ownerDocument = getDocumentForImperativeFloatMethods();

  if (href && as && ownerDocument) {
    let preloadSelector = "link[rel=\"preload\"][as=\"" + escapeSelectorAttributeValueInsideDoubleQuotes(as) + "\"]";

    if (as === 'image') {
      if (options && options.imageSrcSet) {
        preloadSelector += "[imagesrcset=\"" + escapeSelectorAttributeValueInsideDoubleQuotes(options.imageSrcSet) + "\"]";

        if (typeof options.imageSizes === 'string') {
          preloadSelector += "[imagesizes=\"" + escapeSelectorAttributeValueInsideDoubleQuotes(options.imageSizes) + "\"]";
        }
      } else {
        preloadSelector += "[href=\"" + escapeSelectorAttributeValueInsideDoubleQuotes(href) + "\"]";
      }
    } else {
      preloadSelector += "[href=\"" + escapeSelectorAttributeValueInsideDoubleQuotes(href) + "\"]";
    } // Some preloads are keyed under their selector. This happens when the preload is for
    // an arbitrary type. Other preloads are keyed under the resource key they represent a preload for.
    // Here we figure out which key to use to determine if we have a preload already.


    let key = preloadSelector;

    switch (as) {
      case 'style':
        key = getStyleKey(href);
        break;

      case 'script':
        key = getScriptKey(href);
        break;
    }

    if (!preloadPropsMap.has(key)) {
      const preloadProps = assign({
        rel: 'preload',
        // There is a bug in Safari where imageSrcSet is not respected on preload links
        // so we omit the href here if we have imageSrcSet b/c safari will load the wrong image.
        // This harms older browers that do not support imageSrcSet by making their preloads not work
        // but this population is shrinking fast and is already small so we accept this tradeoff.
        href: as === 'image' && options && options.imageSrcSet ? undefined : href,
        as
      }, options);

      preloadPropsMap.set(key, preloadProps);

      if (null === ownerDocument.querySelector(preloadSelector)) {
        if (as === 'style' && ownerDocument.querySelector(getStylesheetSelectorFromKey(key))) {
          // We already have a stylesheet for this key. We don't need to preload it.
          return;
        } else if (as === 'script' && ownerDocument.querySelector(getScriptSelectorFromKey(key))) {
          // We already have a stylesheet for this key. We don't need to preload it.
          return;
        }

        const instance = ownerDocument.createElement('link');
        setInitialProperties(instance, 'link', preloadProps);
        markNodeAsHoistable(instance);
        ownerDocument.head.appendChild(instance);
      }
    }
  }
}

function preloadModule$1(href, options) {

  const ownerDocument = getDocumentForImperativeFloatMethods();

  if (href) {
    const as = options && typeof options.as === 'string' ? options.as : 'script';
    const preloadSelector = "link[rel=\"modulepreload\"][as=\"" + escapeSelectorAttributeValueInsideDoubleQuotes(as) + "\"][href=\"" + escapeSelectorAttributeValueInsideDoubleQuotes(href) + "\"]"; // Some preloads are keyed under their selector. This happens when the preload is for
    // an arbitrary type. Other preloads are keyed under the resource key they represent a preload for.
    // Here we figure out which key to use to determine if we have a preload already.

    let key = preloadSelector;

    switch (as) {
      case 'audioworklet':
      case 'paintworklet':
      case 'serviceworker':
      case 'sharedworker':
      case 'worker':
      case 'script':
        {
          key = getScriptKey(href);
          break;
        }
    }

    if (!preloadPropsMap.has(key)) {
      const props = assign({
        rel: 'modulepreload',
        href
      }, options);

      preloadPropsMap.set(key, props);

      if (null === ownerDocument.querySelector(preloadSelector)) {
        switch (as) {
          case 'audioworklet':
          case 'paintworklet':
          case 'serviceworker':
          case 'sharedworker':
          case 'worker':
          case 'script':
            {
              if (ownerDocument.querySelector(getScriptSelectorFromKey(key))) {
                return;
              }
            }
        }

        const instance = ownerDocument.createElement('link');
        setInitialProperties(instance, 'link', props);
        markNodeAsHoistable(instance);
        ownerDocument.head.appendChild(instance);
      }
    }
  }
}

function preinitStyle(href, precedence, options) {

  const ownerDocument = getDocumentForImperativeFloatMethods();

  if (href) {
    const styles = getResourcesFromRoot(ownerDocument).hoistableStyles;
    const key = getStyleKey(href);
    precedence = precedence || 'default'; // Check if this resource already exists

    let resource = styles.get(key);

    if (resource) {
      // We can early return. The resource exists and there is nothing
      // more to do
      return;
    }

    const state = {
      loading: NotLoaded,
      preload: null
    }; // Attempt to hydrate instance from DOM

    let instance = ownerDocument.querySelector(getStylesheetSelectorFromKey(key));

    if (instance) {
      state.loading = Loaded | Inserted;
    } else {
      // Construct a new instance and insert it
      const stylesheetProps = assign({
        rel: 'stylesheet',
        href,
        'data-precedence': precedence
      }, options);

      const preloadProps = preloadPropsMap.get(key);

      if (preloadProps) {
        adoptPreloadPropsForStylesheet(stylesheetProps, preloadProps);
      }

      const link = instance = ownerDocument.createElement('link');
      markNodeAsHoistable(link);
      setInitialProperties(link, 'link', stylesheetProps);
      link._p = new Promise((resolve, reject) => {
        link.onload = resolve;
        link.onerror = reject;
      });
      link.addEventListener('load', () => {
        state.loading |= Loaded;
      });
      link.addEventListener('error', () => {
        state.loading |= Errored;
      });
      state.loading |= Inserted;
      insertStylesheet(instance, precedence, ownerDocument);
    } // Construct a Resource and cache it


    resource = {
      type: 'stylesheet',
      instance,
      count: 1,
      state
    };
    styles.set(key, resource);
    return;
  }
}

function preinitScript(src, options) {

  const ownerDocument = getDocumentForImperativeFloatMethods();

  if (src) {
    const scripts = getResourcesFromRoot(ownerDocument).hoistableScripts;
    const key = getScriptKey(src); // Check if this resource already exists

    let resource = scripts.get(key);

    if (resource) {
      // We can early return. The resource exists and there is nothing
      // more to do
      return;
    } // Attempt to hydrate instance from DOM


    let instance = ownerDocument.querySelector(getScriptSelectorFromKey(key));

    if (!instance) {
      // Construct a new instance and insert it
      const scriptProps = assign({
        src,
        async: true
      }, options); // Adopt certain preload props


      const preloadProps = preloadPropsMap.get(key);

      if (preloadProps) {
        adoptPreloadPropsForScript(scriptProps, preloadProps);
      }

      instance = ownerDocument.createElement('script');
      markNodeAsHoistable(instance);
      setInitialProperties(instance, 'link', scriptProps);
      ownerDocument.head.appendChild(instance);
    } // Construct a Resource and cache it


    resource = {
      type: 'script',
      instance,
      count: 1,
      state: null
    };
    scripts.set(key, resource);
    return;
  }
}

function preinitModuleScript(src, options) {

  const ownerDocument = getDocumentForImperativeFloatMethods();

  if (src) {
    const scripts = getResourcesFromRoot(ownerDocument).hoistableScripts;
    const key = getScriptKey(src); // Check if this resource already exists

    let resource = scripts.get(key);

    if (resource) {
      // We can early return. The resource exists and there is nothing
      // more to do
      return;
    } // Attempt to hydrate instance from DOM


    let instance = ownerDocument.querySelector(getScriptSelectorFromKey(key));

    if (!instance) {
      // Construct a new instance and insert it
      const scriptProps = assign({
        src,
        async: true,
        type: 'module'
      }, options); // Adopt certain preload props


      const preloadProps = preloadPropsMap.get(key);

      if (preloadProps) {
        adoptPreloadPropsForScript(scriptProps, preloadProps);
      }

      instance = ownerDocument.createElement('script');
      markNodeAsHoistable(instance);
      setInitialProperties(instance, 'link', scriptProps);
      ownerDocument.head.appendChild(instance);
    } // Construct a Resource and cache it


    resource = {
      type: 'script',
      instance,
      count: 1,
      state: null
    };
    scripts.set(key, resource);
    return;
  }
} // This function is called in begin work and we should always have a currentDocument set


function getResource(type, currentProps, pendingProps) {
  const resourceRoot = getCurrentResourceRoot();

  if (!resourceRoot) {
    throw Error(formatProdErrorMessage(446));
  }

  switch (type) {
    case 'meta':
    case 'title':
      {
        return null;
      }

    case 'style':
      {
        if (typeof pendingProps.precedence === 'string' && typeof pendingProps.href === 'string') {
          const key = getStyleKey(pendingProps.href);
          const styles = getResourcesFromRoot(resourceRoot).hoistableStyles;
          let resource = styles.get(key);

          if (!resource) {
            resource = {
              type: 'style',
              instance: null,
              count: 0,
              state: null
            };
            styles.set(key, resource);
          }

          return resource;
        }

        return {
          type: 'void',
          instance: null,
          count: 0,
          state: null
        };
      }

    case 'link':
      {
        if (pendingProps.rel === 'stylesheet' && typeof pendingProps.href === 'string' && typeof pendingProps.precedence === 'string') {
          const qualifiedProps = pendingProps;
          const key = getStyleKey(qualifiedProps.href);
          const styles = getResourcesFromRoot(resourceRoot).hoistableStyles;
          let resource = styles.get(key);

          if (!resource) {
            // We asserted this above but Flow can't figure out that the type satisfies
            const ownerDocument = getDocumentFromRoot(resourceRoot);
            resource = {
              type: 'stylesheet',
              instance: null,
              count: 0,
              state: {
                loading: NotLoaded,
                preload: null
              }
            };
            styles.set(key, resource);

            if (!preloadPropsMap.has(key)) {
              preloadStylesheet(ownerDocument, key, preloadPropsFromStylesheet(qualifiedProps), resource.state);
            }
          }

          return resource;
        }

        return null;
      }

    case 'script':
      {
        if (typeof pendingProps.src === 'string' && pendingProps.async === true) {
          const scriptProps = pendingProps;
          const key = getScriptKey(scriptProps.src);
          const scripts = getResourcesFromRoot(resourceRoot).hoistableScripts;
          let resource = scripts.get(key);

          if (!resource) {
            resource = {
              type: 'script',
              instance: null,
              count: 0,
              state: null
            };
            scripts.set(key, resource);
          }

          return resource;
        }

        return {
          type: 'void',
          instance: null,
          count: 0,
          state: null
        };
      }

    default:
      {
        throw Error(formatProdErrorMessage(444, type));
      }
  }
}

function styleTagPropsFromRawProps(rawProps) {
  return assign({}, rawProps, {
    'data-href': rawProps.href,
    'data-precedence': rawProps.precedence,
    href: null,
    precedence: null
  });
}

function getStyleKey(href) {
  const limitedEscapedHref = escapeSelectorAttributeValueInsideDoubleQuotes(href);
  return "href=\"" + limitedEscapedHref + "\"";
}

function getStyleTagSelector(href) {
  const limitedEscapedHref = escapeSelectorAttributeValueInsideDoubleQuotes(href);
  return "style[data-href~=\"" + limitedEscapedHref + "\"]";
}

function getStylesheetSelectorFromKey(key) {
  return "link[rel=\"stylesheet\"][" + key + "]";
}

function getPreloadStylesheetSelectorFromKey(key) {
  return "link[rel=\"preload\"][as=\"style\"][" + key + "]";
}

function stylesheetPropsFromRawProps(rawProps) {
  return assign({}, rawProps, {
    'data-precedence': rawProps.precedence,
    precedence: null
  });
}

function preloadStylesheet(ownerDocument, key, preloadProps, state) {
  preloadPropsMap.set(key, preloadProps);

  if (!ownerDocument.querySelector(getStylesheetSelectorFromKey(key))) {
    // There is no matching stylesheet instance in the Document.
    // We will insert a preload now to kick off loading because
    // we expect this stylesheet to commit
    const preloadEl = ownerDocument.querySelector(getPreloadStylesheetSelectorFromKey(key));

    if (preloadEl) {
      // If we find a preload already it was SSR'd and we won't have an actual
      // loading state to track. For now we will just assume it is loaded
      state.loading = Loaded;
    } else {
      const instance = ownerDocument.createElement('link');
      state.preload = instance;
      instance.addEventListener('load', () => state.loading |= Loaded);
      instance.addEventListener('error', () => state.loading |= Errored);
      setInitialProperties(instance, 'link', preloadProps);
      markNodeAsHoistable(instance);
      ownerDocument.head.appendChild(instance);
    }
  }
}

function preloadPropsFromStylesheet(props) {
  return {
    rel: 'preload',
    as: 'style',
    href: props.href,
    crossOrigin: props.crossOrigin,
    integrity: props.integrity,
    media: props.media,
    hrefLang: props.hrefLang,
    referrerPolicy: props.referrerPolicy
  };
}

function getScriptKey(src) {
  const limitedEscapedSrc = escapeSelectorAttributeValueInsideDoubleQuotes(src);
  return "[src=\"" + limitedEscapedSrc + "\"]";
}

function getScriptSelectorFromKey(key) {
  return 'script[async]' + key;
}

function acquireResource(hoistableRoot, resource, props) {
  resource.count++;

  if (resource.instance === null) {
    switch (resource.type) {
      case 'style':
        {
          const qualifiedProps = props; // Attempt to hydrate instance from DOM

          let instance = hoistableRoot.querySelector(getStyleTagSelector(qualifiedProps.href));

          if (instance) {
            resource.instance = instance;
            markNodeAsHoistable(instance);
            return instance;
          }

          const styleProps = styleTagPropsFromRawProps(props);
          const ownerDocument = getDocumentFromRoot(hoistableRoot);
          instance = ownerDocument.createElement('style');
          markNodeAsHoistable(instance);
          setInitialProperties(instance, 'style', styleProps); // TODO: `style` does not have loading state for tracking insertions. I
          // guess because these aren't suspensey? Not sure whether this is a
          // factoring smell.
          // resource.state.loading |= Inserted;

          insertStylesheet(instance, qualifiedProps.precedence, hoistableRoot);
          resource.instance = instance;
          return instance;
        }

      case 'stylesheet':
        {
          // This typing is enforce by `getResource`. If we change the logic
          // there for what qualifies as a stylesheet resource we need to ensure
          // this cast still makes sense;
          const qualifiedProps = props;
          const key = getStyleKey(qualifiedProps.href); // Attempt to hydrate instance from DOM

          let instance = hoistableRoot.querySelector(getStylesheetSelectorFromKey(key));

          if (instance) {
            resource.state.loading |= Inserted;
            resource.instance = instance;
            markNodeAsHoistable(instance);
            return instance;
          }

          const stylesheetProps = stylesheetPropsFromRawProps(props);
          const preloadProps = preloadPropsMap.get(key);

          if (preloadProps) {
            adoptPreloadPropsForStylesheet(stylesheetProps, preloadProps);
          } // Construct and insert a new instance


          const ownerDocument = getDocumentFromRoot(hoistableRoot);
          instance = ownerDocument.createElement('link');
          markNodeAsHoistable(instance);
          const linkInstance = instance;
          linkInstance._p = new Promise((resolve, reject) => {
            linkInstance.onload = resolve;
            linkInstance.onerror = reject;
          });
          setInitialProperties(instance, 'link', stylesheetProps);
          resource.state.loading |= Inserted;
          insertStylesheet(instance, qualifiedProps.precedence, hoistableRoot);
          resource.instance = instance;
          return instance;
        }

      case 'script':
        {
          // This typing is enforce by `getResource`. If we change the logic
          // there for what qualifies as a stylesheet resource we need to ensure
          // this cast still makes sense;
          const borrowedScriptProps = props;
          const key = getScriptKey(borrowedScriptProps.src); // Attempt to hydrate instance from DOM

          let instance = hoistableRoot.querySelector(getScriptSelectorFromKey(key));

          if (instance) {
            resource.instance = instance;
            markNodeAsHoistable(instance);
            return instance;
          }

          let scriptProps = borrowedScriptProps;
          const preloadProps = preloadPropsMap.get(key);

          if (preloadProps) {
            scriptProps = assign({}, borrowedScriptProps);
            adoptPreloadPropsForScript(scriptProps, preloadProps);
          } // Construct and insert a new instance


          const ownerDocument = getDocumentFromRoot(hoistableRoot);
          instance = ownerDocument.createElement('script');
          markNodeAsHoistable(instance);
          setInitialProperties(instance, 'link', scriptProps);
          ownerDocument.head.appendChild(instance);
          resource.instance = instance;
          return instance;
        }

      case 'void':
        {
          return null;
        }

      default:
        {
          throw Error(formatProdErrorMessage(443, resource.type));
        }
    }
  } else {
    // In the case of stylesheets, they might have already been assigned an
    // instance during `suspendResource`. But that doesn't mean they were
    // inserted, because the commit might have been interrupted. So we need to
    // check now.
    //
    // The other resource types are unaffected because they are not
    // yet suspensey.
    //
    // TODO: This is a bit of a code smell. Consider refactoring how
    // `suspendResource` and `acquireResource` work together. The idea is that
    // `suspendResource` does all the same stuff as `acquireResource` except
    // for the insertion.
    if (resource.type === 'stylesheet' && (resource.state.loading & Inserted) === NotLoaded) {
      const qualifiedProps = props;
      const instance = resource.instance;
      resource.state.loading |= Inserted;
      insertStylesheet(instance, qualifiedProps.precedence, hoistableRoot);
    }
  }

  return resource.instance;
}
function releaseResource(resource) {
  resource.count--;
}

function insertStylesheet(instance, precedence, root) {
  const nodes = root.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]');
  const last = nodes.length ? nodes[nodes.length - 1] : null;
  let prior = last;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nodePrecedence = node.dataset.precedence;

    if (nodePrecedence === precedence) {
      prior = node;
    } else if (prior !== last) {
      break;
    }
  }

  if (prior) {
    // We get the prior from the document so we know it is in the tree.
    // We also know that links can't be the topmost Node so the parentNode
    // must exist.
    prior.parentNode.insertBefore(instance, prior.nextSibling);
  } else {
    const parent = root.nodeType === DOCUMENT_NODE ? root.head : root;
    parent.insertBefore(instance, parent.firstChild);
  }
}

function adoptPreloadPropsForStylesheet(stylesheetProps, preloadProps) {
  if (stylesheetProps.crossOrigin == null) stylesheetProps.crossOrigin = preloadProps.crossOrigin;
  if (stylesheetProps.referrerPolicy == null) stylesheetProps.referrerPolicy = preloadProps.referrerPolicy;
  if (stylesheetProps.title == null) stylesheetProps.title = preloadProps.title;
}

function adoptPreloadPropsForScript(scriptProps, preloadProps) {
  if (scriptProps.crossOrigin == null) scriptProps.crossOrigin = preloadProps.crossOrigin;
  if (scriptProps.referrerPolicy == null) scriptProps.referrerPolicy = preloadProps.referrerPolicy;
  if (scriptProps.integrity == null) scriptProps.integrity = preloadProps.integrity;
}

let tagCaches = null;
function hydrateHoistable(hoistableRoot, type, props, internalInstanceHandle) {
  const ownerDocument = getDocumentFromRoot(hoistableRoot);
  let instance = null;

  getInstance: switch (type) {
    case 'title':
      {
        instance = ownerDocument.getElementsByTagName('title')[0];

        if (!instance || isOwnedInstance(instance) || instance.namespaceURI === SVG_NAMESPACE || instance.hasAttribute('itemprop')) {
          instance = ownerDocument.createElement(type);
          ownerDocument.head.insertBefore(instance, ownerDocument.querySelector('head > title'));
        }

        setInitialProperties(instance, type, props);
        precacheFiberNode(internalInstanceHandle, instance);
        markNodeAsHoistable(instance);
        return instance;
      }

    case 'link':
      {
        const cache = getHydratableHoistableCache('link', 'href', ownerDocument);
        const key = type + (props.href || '');
        const maybeNodes = cache.get(key);

        if (maybeNodes) {
          const nodes = maybeNodes;

          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            if (node.getAttribute('href') !== (props.href == null ? null : props.href) || node.getAttribute('rel') !== (props.rel == null ? null : props.rel) || node.getAttribute('title') !== (props.title == null ? null : props.title) || node.getAttribute('crossorigin') !== (props.crossOrigin == null ? null : props.crossOrigin)) {
              // mismatch, try the next node;
              continue;
            }

            instance = node;
            nodes.splice(i, 1);
            break getInstance;
          }
        }

        instance = ownerDocument.createElement(type);
        setInitialProperties(instance, type, props);
        ownerDocument.head.appendChild(instance);
        break;
      }

    case 'meta':
      {
        const cache = getHydratableHoistableCache('meta', 'content', ownerDocument);
        const key = type + (props.content || '');
        const maybeNodes = cache.get(key);

        if (maybeNodes) {
          const nodes = maybeNodes;

          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i]; // We coerce content to string because it is the most likely one to

            if (node.getAttribute('content') !== (props.content == null ? null : '' + props.content) || node.getAttribute('name') !== (props.name == null ? null : props.name) || node.getAttribute('property') !== (props.property == null ? null : props.property) || node.getAttribute('http-equiv') !== (props.httpEquiv == null ? null : props.httpEquiv) || node.getAttribute('charset') !== (props.charSet == null ? null : props.charSet)) {
              // mismatch, try the next node;
              continue;
            }

            instance = node;
            nodes.splice(i, 1);
            break getInstance;
          }
        }

        instance = ownerDocument.createElement(type);
        setInitialProperties(instance, type, props);
        ownerDocument.head.appendChild(instance);
        break;
      }

    default:
      throw Error(formatProdErrorMessage(468, type));
  } // This node is a match


  precacheFiberNode(internalInstanceHandle, instance);
  markNodeAsHoistable(instance);
  return instance;
}

function getHydratableHoistableCache(type, keyAttribute, ownerDocument) {
  let cache;
  let caches;

  if (tagCaches === null) {
    cache = new Map();
    caches = tagCaches = new Map();
    caches.set(ownerDocument, cache);
  } else {
    caches = tagCaches;
    const maybeCache = caches.get(ownerDocument);

    if (!maybeCache) {
      cache = new Map();
      caches.set(ownerDocument, cache);
    } else {
      cache = maybeCache;
    }
  }

  if (cache.has(type)) {
    // We use type as a special key that signals that this cache has been seeded for this type
    return cache;
  } // Mark this cache as seeded for this type


  cache.set(type, null);
  const nodes = ownerDocument.getElementsByTagName(type);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (!isOwnedInstance(node) && (type !== 'link' || node.getAttribute('rel') !== 'stylesheet') && node.namespaceURI !== SVG_NAMESPACE) {
      const nodeKey = node.getAttribute(keyAttribute) || '';
      const key = type + nodeKey;
      const existing = cache.get(key);

      if (existing) {
        existing.push(node);
      } else {
        cache.set(key, [node]);
      }
    }
  }

  return cache;
}

function mountHoistable(hoistableRoot, type, instance) {
  const ownerDocument = getDocumentFromRoot(hoistableRoot);
  ownerDocument.head.insertBefore(instance, type === 'title' ? ownerDocument.querySelector('head > title') : null);
}
function unmountHoistable(instance) {
  instance.parentNode.removeChild(instance);
}
function isHostHoistableType(type, props, hostContext) {
  let hostContextProd;

  {
    hostContextProd = hostContext;
  } // Global opt out of hoisting for anything in SVG Namespace or anything with an itemProp inside an itemScope


  if (hostContextProd === HostContextNamespaceSvg || props.itemProp != null) {

    return false;
  }

  switch (type) {
    case 'meta':
    case 'title':
      {
        return true;
      }

    case 'style':
      {
        if (typeof props.precedence !== 'string' || typeof props.href !== 'string' || props.href === '') {

          return false;
        }

        return true;
      }

    case 'link':
      {
        if (typeof props.rel !== 'string' || typeof props.href !== 'string' || props.href === '' || props.onLoad || props.onError) {

          return false;
        }

        switch (props.rel) {
          case 'stylesheet':
            {
              const precedence = props.precedence,
                    disabled = props.disabled;

              return typeof precedence === 'string' && disabled == null;
            }

          default:
            {
              return true;
            }
        }
      }

    case 'script':
      {
        if (props.async !== true || props.onLoad || props.onError || typeof props.src !== 'string' || !props.src) {

          return false;
        }

        return true;
      }

    case 'noscript':
    case 'template':
      {

        return false;
      }
  }

  return false;
}
function mayResourceSuspendCommit(resource) {
  return resource.type === 'stylesheet' && (resource.state.loading & Inserted) === NotLoaded;
}
function preloadInstance(type, props) {
  // Return true to indicate it's already loaded
  return true;
}
function preloadResource(resource) {
  if (resource.type === 'stylesheet' && (resource.state.loading & Settled) === NotLoaded) {
    // we have not finished loading the underlying stylesheet yet.
    return false;
  } // Return true to indicate it's already loaded


  return true;
}
let suspendedState = null; // We use a noop function when we begin suspending because if possible we want the
// waitfor step to finish synchronously. If it doesn't we'll return a function to
// provide the actual unsuspend function and that will get completed when the count
// hits zero or it will get cancelled if the root starts new work.

function noop() {}

function startSuspendingCommit() {
  suspendedState = {
    stylesheets: null,
    count: 0,
    unsuspend: noop
  };
}
function suspendResource(hoistableRoot, resource, props) {
  if (suspendedState === null) {
    throw Error(formatProdErrorMessage(475));
  }

  const state = suspendedState;

  if (resource.type === 'stylesheet') {
    if (typeof props.media === 'string') {
      // If we don't currently match media we avoid suspending on this resource
      // and let it insert on the mutation path
      if (matchMedia(props.media).matches === false) {
        return;
      }
    }

    if ((resource.state.loading & Inserted) === NotLoaded) {
      if (resource.instance === null) {
        const qualifiedProps = props;
        const key = getStyleKey(qualifiedProps.href); // Attempt to hydrate instance from DOM

        let instance = hoistableRoot.querySelector(getStylesheetSelectorFromKey(key));

        if (instance) {
          // If this instance has a loading state it came from the Fizz runtime.
          // If there is not loading state it is assumed to have been server rendered
          // as part of the preamble and therefore synchronously loaded. It could have
          // errored however which we still do not yet have a means to detect. For now
          // we assume it is loaded.
          const maybeLoadingState = instance._p;

          if (maybeLoadingState !== null && typeof maybeLoadingState === 'object' && // $FlowFixMe[method-unbinding]
          typeof maybeLoadingState.then === 'function') {
            const loadingState = maybeLoadingState;
            state.count++;
            const ping = onUnsuspend.bind(state);
            loadingState.then(ping, ping);
          }

          resource.state.loading |= Inserted;
          resource.instance = instance;
          markNodeAsHoistable(instance);
          return;
        }

        const ownerDocument = getDocumentFromRoot(hoistableRoot);
        const stylesheetProps = stylesheetPropsFromRawProps(props);
        const preloadProps = preloadPropsMap.get(key);

        if (preloadProps) {
          adoptPreloadPropsForStylesheet(stylesheetProps, preloadProps);
        } // Construct and insert a new instance


        instance = ownerDocument.createElement('link');
        markNodeAsHoistable(instance);
        const linkInstance = instance; // This Promise is a loading state used by the Fizz runtime. We need this incase there is a race
        // between this resource being rendered on the client and being rendered with a late completed boundary.

        linkInstance._p = new Promise((resolve, reject) => {
          linkInstance.onload = resolve;
          linkInstance.onerror = reject;
        });
        setInitialProperties(instance, 'link', stylesheetProps);
        resource.instance = instance;
      }

      if (state.stylesheets === null) {
        state.stylesheets = new Map();
      }

      state.stylesheets.set(resource, hoistableRoot);
      const preloadEl = resource.state.preload;

      if (preloadEl && (resource.state.loading & Settled) === NotLoaded) {
        state.count++;
        const ping = onUnsuspend.bind(state);
        preloadEl.addEventListener('load', ping);
        preloadEl.addEventListener('error', ping);
      }
    }
  }
}
function waitForCommitToBeReady() {
  if (suspendedState === null) {
    throw Error(formatProdErrorMessage(475));
  }

  const state = suspendedState;

  if (state.stylesheets && state.count === 0) {
    // We are not currently blocked but we have not inserted all stylesheets.
    // If this insertion happens and loads or errors synchronously then we can
    // avoid suspending the commit. To do this we check the count again immediately after
    insertSuspendedStylesheets(state, state.stylesheets);
  } // We need to check the count again because the inserted stylesheets may have led to new
  // tasks to wait on.


  if (state.count > 0) {
    return commit => {
      // We almost never want to show content before its styles have loaded. But
      // eventually we will give up and allow unstyled content. So this number is
      // somewhat arbitrary — big enough that you'd only reach it under
      // extreme circumstances.
      // TODO: Figure out what the browser engines do during initial page load and
      // consider aligning our behavior with that.
      const stylesheetTimer = setTimeout(() => {
        if (state.stylesheets) {
          insertSuspendedStylesheets(state, state.stylesheets);
        }

        if (state.unsuspend) {
          const unsuspend = state.unsuspend;
          state.unsuspend = null;
          unsuspend();
        }
      }, 60000); // one minute

      state.unsuspend = commit;
      return () => {
        state.unsuspend = null;
        clearTimeout(stylesheetTimer);
      };
    };
  }

  return null;
}

function onUnsuspend() {
  this.count--;

  if (this.count === 0) {
    if (this.stylesheets) {
      // If we haven't actually inserted the stylesheets yet we need to do so now before starting the commit.
      // The reason we do this after everything else has finished is because we want to have all the stylesheets
      // load synchronously right before mutating. Ideally the new styles will cause a single recalc only on the
      // new tree. When we filled up stylesheets we only inlcuded stylesheets with matching media attributes so we
      // wait for them to load before actually continuing. We expect this to increase the count above zero
      insertSuspendedStylesheets(this, this.stylesheets);
    } else if (this.unsuspend) {
      const unsuspend = this.unsuspend;
      this.unsuspend = null;
      unsuspend();
    }
  }
} // This is typecast to non-null because it will always be set before read.
// it is important that this not be used except when the stack guarantees it exists.
// Currentlyt his is only during insertSuspendedStylesheet.


let precedencesByRoot = null;

function insertSuspendedStylesheets(state, resources) {
  // We need to clear this out so we don't try to reinsert after the stylesheets have loaded
  state.stylesheets = null;

  if (state.unsuspend === null) {
    // The suspended commit was cancelled. We don't need to insert any stylesheets.
    return;
  } // Temporarily increment count. we don't want any synchronously loaded stylesheets to try to unsuspend
  // before we finish inserting all stylesheets.


  state.count++;
  precedencesByRoot = new Map();
  resources.forEach(insertStylesheetIntoRoot, state);
  precedencesByRoot = null; // We can remove our temporary count and if we're still at zero we can unsuspend.
  // If we are in the synchronous phase before deciding if the commit should suspend and this
  // ends up hitting the unsuspend path it will just invoke the noop unsuspend.

  onUnsuspend.call(state);
}

function insertStylesheetIntoRoot(root, resource, map) {
  if (resource.state.loading & Inserted) {
    // This resource was inserted by another root committing. we don't need to insert it again
    return;
  }

  let last;
  let precedences = precedencesByRoot.get(root);

  if (!precedences) {
    precedences = new Map();
    precedencesByRoot.set(root, precedences);
    const nodes = root.querySelectorAll('link[data-precedence],style[data-precedence]');

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      if (node.nodeName === 'link' || // We omit style tags with media="not all" because they are not in the right position
      // and will be hoisted by the Fizz runtime imminently.
      node.getAttribute('media') !== 'not all') {
        precedences.set('p' + node.dataset.precedence, node);
        last = node;
      }
    }

    if (last) {
      precedences.set('last', last);
    }
  } else {
    last = precedences.get('last');
  } // We only call this after we have constructed an instance so we assume it here


  const instance = resource.instance; // We will always have a precedence for stylesheet instances

  const precedence = instance.getAttribute('data-precedence');
  const prior = precedences.get('p' + precedence) || last;

  if (prior === last) {
    precedences.set('last', instance);
  }

  precedences.set(precedence, instance);
  this.count++;
  const onComplete = onUnsuspend.bind(this);
  instance.addEventListener('load', onComplete);
  instance.addEventListener('error', onComplete);

  if (prior) {
    prior.parentNode.insertBefore(instance, prior.nextSibling);
  } else {
    const parent = root.nodeType === DOCUMENT_NODE ? root.head : root;
    parent.insertBefore(instance, parent.firstChild);
  }

  resource.state.loading |= Inserted;
}

const NotPendingTransition = NotPending;

const Dispatcher$1 = Internals.Dispatcher;

if (typeof document !== 'undefined') {
  // Set the default dispatcher to the client dispatcher
  Dispatcher$1.current = ReactDOMClientDispatcher;
}
/* global reportError */

const defaultOnRecoverableError = typeof reportError === 'function' ? // In modern browsers, reportError will dispatch an error event,
// emulating an uncaught JavaScript error.
reportError : error => {
  // In older browsers and test environments, fallback to console.error.
  // eslint-disable-next-line react-internal/no-production-logging
  console['error'](error);
}; // $FlowFixMe[missing-this-annot]

function ReactDOMRoot(internalRoot) {
  this._internalRoot = internalRoot;
} // $FlowFixMe[prop-missing] found when upgrading Flow


ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render = // $FlowFixMe[missing-this-annot]
function (children) {
  const root = this._internalRoot;

  if (root === null) {
    throw Error(formatProdErrorMessage(409));
  }

  updateContainer(children, root, null, null);
}; // $FlowFixMe[prop-missing] found when upgrading Flow


ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount = // $FlowFixMe[missing-this-annot]
function () {

  const root = this._internalRoot;

  if (root !== null) {
    this._internalRoot = null;
    const container = root.containerInfo;

    flushSync$1(() => {
      updateContainer(null, root, null, null);
    });
    unmarkContainerAsRoot(container);
  }
};

function createRoot$1(container, options) {
  if (!isValidContainer(container)) {
    throw Error(formatProdErrorMessage(299));
  }
  let isStrictMode = false;
  let concurrentUpdatesByDefaultOverride = false;
  let identifierPrefix = '';
  let onRecoverableError = defaultOnRecoverableError;
  let transitionCallbacks = null;

  if (options !== null && options !== undefined) {

    if (options.unstable_strictMode === true) {
      isStrictMode = true;
    }

    if (options.identifierPrefix !== undefined) {
      identifierPrefix = options.identifierPrefix;
    }

    if (options.onRecoverableError !== undefined) {
      onRecoverableError = options.onRecoverableError;
    }

    if (options.unstable_transitionCallbacks !== undefined) {
      transitionCallbacks = options.unstable_transitionCallbacks;
    }
  }

  const root = createContainer(container, ConcurrentRoot, null, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onRecoverableError, transitionCallbacks);
  markContainerAsRoot(root.current, container);
  Dispatcher$1.current = ReactDOMClientDispatcher;
  const rootContainerElement = container.nodeType === COMMENT_NODE ? container.parentNode : container;
  listenToAllSupportedEvents(rootContainerElement); // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions

  return new ReactDOMRoot(root);
} // $FlowFixMe[missing-this-annot]

function ReactDOMHydrationRoot(internalRoot) {
  this._internalRoot = internalRoot;
}

function scheduleHydration(target) {
  if (target) {
    queueExplicitHydrationTarget(target);
  }
} // $FlowFixMe[prop-missing] found when upgrading Flow


ReactDOMHydrationRoot.prototype.unstable_scheduleHydration = scheduleHydration;
function hydrateRoot$1(container, initialChildren, options) {
  if (!isValidContainer(container)) {
    throw Error(formatProdErrorMessage(405));
  }
  // the hydration callbacks.


  const hydrationCallbacks = options != null ? options : null;
  let isStrictMode = false;
  let concurrentUpdatesByDefaultOverride = false;
  let identifierPrefix = '';
  let onRecoverableError = defaultOnRecoverableError;
  let transitionCallbacks = null;
  let formState = null;

  if (options !== null && options !== undefined) {
    if (options.unstable_strictMode === true) {
      isStrictMode = true;
    }

    if (options.identifierPrefix !== undefined) {
      identifierPrefix = options.identifierPrefix;
    }

    if (options.onRecoverableError !== undefined) {
      onRecoverableError = options.onRecoverableError;
    }

    if (options.unstable_transitionCallbacks !== undefined) {
      transitionCallbacks = options.unstable_transitionCallbacks;
    }

    {
      if (options.formState !== undefined) {
        formState = options.formState;
      }
    }
  }

  const root = createHydrationContainer(initialChildren, null, container, ConcurrentRoot, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, onRecoverableError, transitionCallbacks, formState);
  markContainerAsRoot(root.current, container);
  Dispatcher$1.current = ReactDOMClientDispatcher; // This can't be a comment node since hydration doesn't work on comment nodes anyway.

  listenToAllSupportedEvents(container); // $FlowFixMe[invalid-constructor] Flow no longer supports calling new on functions

  return new ReactDOMHydrationRoot(root);
}
function isValidContainer(node) {
  return !!(node && (node.nodeType === ELEMENT_NODE || node.nodeType === DOCUMENT_NODE || node.nodeType === DOCUMENT_FRAGMENT_NODE || !disableCommentsAsDOMContainers  ));
} // TODO: Remove this function which also includes comment nodes.
// We only use it in places that are currently more relaxed.

function isValidContainerLegacy(node) {
  return !!(node && (node.nodeType === ELEMENT_NODE || node.nodeType === DOCUMENT_NODE || node.nodeType === DOCUMENT_FRAGMENT_NODE || node.nodeType === COMMENT_NODE && node.nodeValue === ' react-mount-point-unstable '));
}

function noopOnRecoverableError() {// This isn't reachable because onRecoverableError isn't called in the
  // legacy API.
}

function legacyCreateRootFromDOMContainer(container, initialChildren, parentComponent, callback, isHydrationContainer) {
  if (isHydrationContainer) {
    if (typeof callback === 'function') {
      const originalCallback = callback;

      callback = function () {
        const instance = getPublicRootInstance(root);
        originalCallback.call(instance);
      };
    }

    const root = createHydrationContainer(initialChildren, callback, container, LegacyRoot, null, // hydrationCallbacks
    false, // isStrictMode
    false, // concurrentUpdatesByDefaultOverride,
    '', // identifierPrefix
    noopOnRecoverableError, // TODO(luna) Support hydration later
    null, null);
    container._reactRootContainer = root;
    markContainerAsRoot(root.current, container);
    const rootContainerElement = container.nodeType === COMMENT_NODE ? container.parentNode : container; // $FlowFixMe[incompatible-call]

    listenToAllSupportedEvents(rootContainerElement);
    flushSync$1();
    return root;
  } else {
    // First clear any existing content.
    clearContainer(container);

    if (typeof callback === 'function') {
      const originalCallback = callback;

      callback = function () {
        const instance = getPublicRootInstance(root);
        originalCallback.call(instance);
      };
    }

    const root = createContainer(container, LegacyRoot, null, // hydrationCallbacks
    false, // isStrictMode
    false, // concurrentUpdatesByDefaultOverride,
    '', // identifierPrefix
    noopOnRecoverableError, // onRecoverableError
    null // transitionCallbacks
    );
    container._reactRootContainer = root;
    markContainerAsRoot(root.current, container);
    const rootContainerElement = container.nodeType === COMMENT_NODE ? container.parentNode : container; // $FlowFixMe[incompatible-call]

    listenToAllSupportedEvents(rootContainerElement); // Initial mount should not be batched.

    flushSync$1(() => {
      updateContainer(initialChildren, root, parentComponent, callback);
    });
    return root;
  }
}

function legacyRenderSubtreeIntoContainer(parentComponent, children, container, forceHydrate, callback) {

  const maybeRoot = container._reactRootContainer;
  let root;

  if (!maybeRoot) {
    // Initial mount
    root = legacyCreateRootFromDOMContainer(container, children, parentComponent, callback, forceHydrate);
  } else {
    root = maybeRoot;

    if (typeof callback === 'function') {
      const originalCallback = callback;

      callback = function () {
        const instance = getPublicRootInstance(root);
        originalCallback.call(instance);
      };
    } // Update


    updateContainer(children, root, parentComponent, callback);
  }

  return getPublicRootInstance(root);
}

function findDOMNode(componentOrElement) {

  if (componentOrElement == null) {
    return null;
  }

  if (componentOrElement.nodeType === ELEMENT_NODE) {
    return componentOrElement;
  }

  return findHostInstance(componentOrElement);
}
function hydrate(element, container, callback) {

  if (!isValidContainerLegacy(container)) {
    throw Error(formatProdErrorMessage(200));
  }


  return legacyRenderSubtreeIntoContainer(null, element, container, true, callback);
}
function render(element, container, callback) {

  if (!isValidContainerLegacy(container)) {
    throw Error(formatProdErrorMessage(200));
  }

  return legacyRenderSubtreeIntoContainer(null, element, container, false, callback);
}
function unstable_renderSubtreeIntoContainer(parentComponent, element, containerNode, callback) {

  if (!isValidContainerLegacy(containerNode)) {
    throw Error(formatProdErrorMessage(200));
  }

  if (parentComponent == null || !has(parentComponent)) {
    throw Error(formatProdErrorMessage(38));
  }

  return legacyRenderSubtreeIntoContainer(parentComponent, element, containerNode, false, callback);
}
function unmountComponentAtNode(container) {
  if (!isValidContainerLegacy(container)) {
    throw Error(formatProdErrorMessage(40));
  }

  if (container._reactRootContainer) {


    flushSync$1(() => {
      legacyRenderSubtreeIntoContainer(null, null, container, false, () => {
        // $FlowFixMe[incompatible-type] This should probably use `delete container._reactRootContainer`
        container._reactRootContainer = null;
        unmarkContainerAsRoot(container);
      });
    }); // If you call unmountComponentAtNode twice in quick succession, you'll
    // get `true` twice. That's probably fine?

    return true;
  } else {

    return false;
  }
}

function getCrossOriginString(input) {
  if (typeof input === 'string') {
    return input === 'use-credentials' ? input : '';
  }

  return undefined;
}
function getCrossOriginStringAs(as, input) {
  if (as === 'font') {
    return '';
  }

  if (typeof input === 'string') {
    return input === 'use-credentials' ? input : '';
  }

  return undefined;
}

const Dispatcher = Internals.Dispatcher;
function prefetchDNS(href) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    dispatcher.prefetchDNS(href);
  } // We don't error because preconnect needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preconnect(href, options) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    const crossOrigin = options ? getCrossOriginString(options.crossOrigin) : null;
    dispatcher.preconnect(href, crossOrigin);
  } // We don't error because preconnect needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preload(href, options) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string' && // We check existence because we cannot enforce this function is actually called with the stated type
  typeof options === 'object' && options !== null && typeof options.as === 'string') {
    const as = options.as;
    const crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
    dispatcher.preload(href, as, {
      crossOrigin,
      integrity: typeof options.integrity === 'string' ? options.integrity : undefined,
      nonce: typeof options.nonce === 'string' ? options.nonce : undefined,
      type: typeof options.type === 'string' ? options.type : undefined,
      fetchPriority: typeof options.fetchPriority === 'string' ? options.fetchPriority : undefined,
      referrerPolicy: typeof options.referrerPolicy === 'string' ? options.referrerPolicy : undefined,
      imageSrcSet: typeof options.imageSrcSet === 'string' ? options.imageSrcSet : undefined,
      imageSizes: typeof options.imageSizes === 'string' ? options.imageSizes : undefined
    });
  } // We don't error because preload needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preloadModule(href, options) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    if (options) {
      const crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
      dispatcher.preloadModule(href, {
        as: typeof options.as === 'string' && options.as !== 'script' ? options.as : undefined,
        crossOrigin,
        integrity: typeof options.integrity === 'string' ? options.integrity : undefined
      });
    } else {
      dispatcher.preloadModule(href);
    }
  } // We don't error because preload needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preinit(href, options) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string' && options && typeof options.as === 'string') {
    const as = options.as;
    const crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
    const integrity = typeof options.integrity === 'string' ? options.integrity : undefined;
    const fetchPriority = typeof options.fetchPriority === 'string' ? options.fetchPriority : undefined;

    if (as === 'style') {
      dispatcher.preinitStyle(href, typeof options.precedence === 'string' ? options.precedence : undefined, {
        crossOrigin,
        integrity,
        fetchPriority
      });
    } else if (as === 'script') {
      dispatcher.preinitScript(href, {
        crossOrigin,
        integrity,
        fetchPriority,
        nonce: typeof options.nonce === 'string' ? options.nonce : undefined
      });
    }
  } // We don't error because preinit needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preinitModule(href, options) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    if (typeof options === 'object' && options !== null) {
      if (options.as == null || options.as === 'script') {
        const crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
        dispatcher.preinitModuleScript(href, {
          crossOrigin,
          integrity: typeof options.integrity === 'string' ? options.integrity : undefined,
          nonce: typeof options.nonce === 'string' ? options.nonce : undefined
        });
      }
    } else if (options == null) {
      dispatcher.preinitModuleScript(href);
    }
  } // We don't error because preinit needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}

function createPortal(children, container) {
  let key = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

  if (!isValidContainer(container)) {
    throw Error(formatProdErrorMessage(200));
  } // TODO: pass ReactDOM portal implementation as third argument
  // $FlowFixMe[incompatible-return] The Flow type is opaque but there's no way to actually create it.


  return createPortal$1(children, container, null, key);
}

function renderSubtreeIntoContainer(parentComponent, element, containerNode, callback) {
  return unstable_renderSubtreeIntoContainer(parentComponent, element, containerNode, callback);
}

function createRoot(container, options) {

  return createRoot$1(container, options);
}

function hydrateRoot(container, initialChildren, options) {

  return hydrateRoot$1(container, initialChildren, options);
} // Overload the definition to the two valid signatures.
// Warning, this opts-out of checking the function body.
// eslint-disable-next-line no-redeclare
// eslint-disable-next-line no-redeclare


function flushSync(fn) {

  return flushSync$1(fn);
}
// This is an array for better minification.

Internals.Events = [getInstanceFromNode, getNodeFromInstance, getFiberCurrentPropsFromNode, enqueueStateRestore, restoreStateIfNeeded, batchedUpdates$1];
injectIntoDevTools({
  findFiberByHostInstance: getClosestInstanceFromNode,
  bundleType: 0,
  version: ReactVersion,
  rendererPackageName: 'react-dom'
});

function experimental_useFormStatus() {

  return useFormStatus();
}
function experimental_useFormState(action, initialState, permalink) {

  return useFormState(action, initialState, permalink);
}

exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = Internals;
exports.createPortal = createPortal;
exports.createRoot = createRoot;
exports.experimental_useFormState = experimental_useFormState;
exports.experimental_useFormStatus = experimental_useFormStatus;
exports.findDOMNode = findDOMNode;
exports.flushSync = flushSync;
exports.hydrate = hydrate;
exports.hydrateRoot = hydrateRoot;
exports.preconnect = preconnect;
exports.prefetchDNS = prefetchDNS;
exports.preinit = preinit;
exports.preinitModule = preinitModule;
exports.preload = preload;
exports.preloadModule = preloadModule;
exports.render = render;
exports.unmountComponentAtNode = unmountComponentAtNode;
exports.unstable_batchedUpdates = batchedUpdates$1;
exports.unstable_renderSubtreeIntoContainer = renderSubtreeIntoContainer;
exports.unstable_runWithPriority = runWithPriority;
exports.useFormState = useFormState;
exports.useFormStatus = useFormStatus;
exports.version = ReactVersion;
          /* global __REACT_DEVTOOLS_GLOBAL_HOOK__ */
if (
  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined' &&
  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop ===
    'function'
) {
  __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(new Error());
}
        