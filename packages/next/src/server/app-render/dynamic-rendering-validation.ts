// Render validation is kept separate from the tracking utilities used by server bootstrap.
import type { WorkStore } from './work-async-storage.external'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { isClientHookDynamicError } from '../dynamic-rendering-utils'
import {
  METADATA_BOUNDARY_NAME,
  VIEWPORT_BOUNDARY_NAME,
  OUTLET_BOUNDARY_NAME,
  ROOT_LAYOUT_BOUNDARY_NAME,
} from '../../lib/framework/boundary-constants'
import {
  createRuntimeBodyError,
  createDynamicBodyError,
  createRuntimeBodyErrorInNavigation,
  createNavigationBodyErrorInNavigation,
  createPrefetchBodyErrorInNavigation,
  createDynamicBodyErrorInNavigation,
  createDynamicOrRuntimeBodyError,
  createRuntimeMetadataError,
  createDynamicMetadataError,
  createRuntimeViewportError,
  createNavigationViewportError,
  createPrefetchViewportError,
  createDynamicViewportError,
  createDynamicOrRuntimeViewportError,
  createDynamicOrRuntimeMetadataError,
  logBuildDebugHint,
  createLinkBodyErrorInNavigation,
  createLinkMetadataError,
  createLinkViewportError,
  createNavigationMetadataError,
  createPrefetchMetadataError,
  createNonPrerenderableMetadataErrorInStaticRoute,
  createNonPrerenderableViewportErrorInStaticRoute,
  createNonPrerenderableBodyErrorInStaticRoute,
  createRuntimeBodyErrorInStaticRoute,
  createDynamicBodyErrorInStaticRoute,
  createRuntimeMetadataErrorInStaticRoute,
  createDynamicMetadataErrorInStaticRoute,
  createRuntimeViewportErrorInStaticRoute,
  createDynamicViewportErrorInStaticRoute,
} from './blocking-route-messages'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  INSTANT_VALIDATION_BOUNDARY_NAME,
  INSTANT_SLOT_MARKER_PREFIX,
  INSTANT_SLOT_MARKER_SUFFIX,
} from './instant-validation/boundary-constants'
import {
  type ValidationBoundaryTracking,
  allRequiredBoundariesRendered,
} from './instant-validation/boundary-tracking'
import type { InstantValidationSampleTracking } from './instant-validation/instant-samples'
import { createUnrenderedSegmentError } from '../../shared/lib/instant-messages'
import { getReactBrowserBailoutReason } from '../../shared/lib/lazy-dynamic/react-browser-bailout'
import type { DynamicTrackingState } from './dynamic-rendering'

// Stores dynamic reasons used during an SSR render.
export type DynamicValidationState = {
  hasSuspenseAboveBody: boolean
  hasDynamicMetadata: boolean
  dynamicMetadata: null | Error
  hasDynamicViewport: boolean
  hasAllowedDynamic: boolean
  dynamicErrors: Array<Error>
}

export function createDynamicValidationState(): DynamicValidationState {
  return {
    hasSuspenseAboveBody: false,
    hasDynamicMetadata: false,
    dynamicMetadata: null,
    hasDynamicViewport: false,
    hasAllowedDynamic: false,
    dynamicErrors: [],
  }
}

function getPendingClientSyncDynamicError(
  clientDynamic: DynamicTrackingState
): null | Error {
  return clientDynamic.syncDynamicErrorWithStackPostMicrotask
    ? null
    : clientDynamic.syncDynamicErrorWithStack
}

const hasSuspenseRegex = /\n\s+at Suspense \(<anonymous>\)/

// Common implicit body tags that React will treat as body when placed directly in html
const bodyAndImplicitTags =
  'body|div|main|section|article|aside|header|footer|nav|form|p|span|h1|h2|h3|h4|h5|h6'

// Detects when RootLayoutBoundary (our framework marker component) appears
// after Suspense in the component stack, indicating the root layout is wrapped
// within a Suspense boundary. Ensures no body/html/implicit-body components are in between.
//
// Example matches:
//   at Suspense (<anonymous>)
//   at __next_root_layout_boundary__ (<anonymous>)
//
// Or with other components in between (but not body/html/implicit-body):
//   at Suspense (<anonymous>)
//   at SomeComponent (<anonymous>)
//   at __next_root_layout_boundary__ (<anonymous>)
const hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex = new RegExp(
  `\\n\\s+at Suspense \\(<anonymous>\\)(?:(?!\\n\\s+at (?:${bodyAndImplicitTags}) \\(<anonymous>\\))[\\s\\S])*?\\n\\s+at ${ROOT_LAYOUT_BOUNDARY_NAME} \\([^\\n]*\\)`
)

const hasMetadataRegex = new RegExp(
  `\\n\\s+at ${METADATA_BOUNDARY_NAME}[\\n\\s]`
)
const hasViewportRegex = new RegExp(
  `\\n\\s+at ${VIEWPORT_BOUNDARY_NAME}[\\n\\s]`
)
const hasOutletRegex = new RegExp(`\\n\\s+at ${OUTLET_BOUNDARY_NAME}[\\n\\s]`)

const hasInstantValidationBoundaryRegex = new RegExp(
  `\\n\\s+at ${INSTANT_VALIDATION_BOUNDARY_NAME}[\\n\\s]`
)
const slotMarkerRegex = new RegExp(
  `\\n\\s+at ${INSTANT_SLOT_MARKER_PREFIX}(\\d+)${INSTANT_SLOT_MARKER_SUFFIX}[\\n\\s]`
)

/** Look up the config factory for the slot this error belongs to.
 * Checks the component stack for a slot marker (__next_instant_slot_N__)
 * and returns the config at that index. Falls back to index 0 (root
 * config) when no slot marker is found or the slot has no config. */
function resolveInstantStack(
  componentStack: string,
  dynamicValidation: InstantValidationState
): (() => Error) | null {
  const { slotStacks } = dynamicValidation
  if (slotStacks.length > 1) {
    const match = slotMarkerRegex.exec(componentStack)
    if (match) {
      // Slot markers are 0-indexed in the component name but
      // slotStacks is 1-indexed (index 0 is the root config).
      const slotIndex = parseInt(match[1], 10) + 1
      const slotStack = slotStacks[slotIndex]
      if (slotStack != null) {
        return slotStack
      }
    }
  }
  // Fall back to root config (index 0)
  return slotStacks[0] ?? null
}

/**
 * Inspects the component stack of an outlet boundary to discover whether the
 * user placed a Suspense boundary above the document body, and records the
 * opt-in on `dynamicValidation.hasSuspenseAboveBody` if so.
 *
 * The outlet itself isn't a meaningful source of dynamic — it only resolves
 * when metadata/viewport are dynamic, which we track via their own boundaries.
 * However, the outlet renders alongside the page content, so its stack passes
 * through the user's layout chain (typically reaching into `<body>` via the
 * root layout). That makes the outlet stack our best opportunity to spot a
 * Suspense boundary above the body, even when no real body content is dynamic.
 * Without this, a route whose only dynamic source is `generateViewport()` would
 * miss the Suspense-above-body opt-in, because the viewport's stack lives in
 * the head and never sees the user's root layout.
 *
 * We deliberately only set `hasSuspenseAboveBody`, not `hasAllowedDynamic`. The
 * latter tracks whether the body has dynamic content that's been wrapped in
 * Suspense (i.e., the page is partially dynamic). The outlet rendering tells us
 * about the structural opt-in for an empty shell, not about the body being
 * partially dynamic. The distinction matters because dynamic metadata is only
 * acceptable when the page is partially dynamic (via real body holes), and we
 * don't want this outlet-based detection to mask that case.
 */
function trackOutletSuspenseAboveBody(
  componentStack: string,
  dynamicValidation: DynamicValidationState
): void {
  if (
    hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex.test(
      componentStack
    )
  ) {
    dynamicValidation.hasSuspenseAboveBody = true
  }
}

export function trackDynamicAccessInStaticRoute(
  dynamicReason: unknown,
  workStore: WorkStore,
  componentStack: string,
  dynamicValidation: DynamicValidationState,
  clientDynamic: DynamicTrackingState,
  isServerPartial: boolean,
  kind: StaticValidationHoleKind
) {
  const syncDynamicError = getPendingClientSyncDynamicError(clientDynamic)

  if (hasOutletRegex.test(componentStack)) {
    trackOutletSuspenseAboveBody(componentStack, dynamicValidation)
    return
  }
  if (hasMetadataRegex.test(componentStack)) {
    dynamicValidation.dynamicErrors.push(
      addErrorContext(
        createMetadataErrorInStaticRoute(kind, workStore.route),
        componentStack,
        null
      )
    )
    return
  }
  if (hasViewportRegex.test(componentStack)) {
    dynamicValidation.dynamicErrors.push(
      addErrorContext(
        createViewportErrorInStaticRoute(kind, workStore.route),
        componentStack,
        null
      )
    )
    return
  }

  let hasSuspense = false
  if (
    hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex.test(
      componentStack
    )
  ) {
    // this error had a Suspense boundary above it, and it's above the body as well.
    dynamicValidation.hasSuspenseAboveBody = true
    hasSuspense = true
  } else if (hasSuspenseRegex.test(componentStack)) {
    // this error had a Suspense boundary above it.
    hasSuspense = true
  }

  if (hasSuspense) {
    if (!isServerPartial) {
      // If we don't have holes caused by server data, then any holes must be caused
      // by client-only code, which is allowed.
      dynamicValidation.hasAllowedDynamic = true
      return
    }

    // We have holes that may be caused by server data.
    if (syncDynamicError || isClientHookDynamicError(dynamicReason)) {
      // We know this hole wasn't caused by server data, so it's allowed
      // (because it's wrapped in a Suspense)
      dynamicValidation.hasAllowedDynamic = true
      return
    }

    // Any remaining hole may be caused by a server hole.
    // These are not allowed even with Suspense.
    // (NOTE: this may misreport valid client dynamic holes as server holes)
    dynamicValidation.dynamicErrors.push(
      addErrorContext(
        createBodyErrorInStaticRoute(kind, workStore.route),
        componentStack,
        null
      )
    )
    return
  }

  if (syncDynamicError) {
    dynamicValidation.dynamicErrors.push(syncDynamicError)
    return
  }

  if (isClientHookDynamicError(dynamicReason)) {
    dynamicValidation.dynamicErrors.push(
      addErrorContext(dynamicReason, componentStack, null)
    )
    return
  }

  const error = addErrorContext(
    isServerPartial
      ? // This hole may be caused by server data.
        // (NOTE: this may misreport client dynamic holes as server holes)
        createBodyErrorInStaticRoute(kind, workStore.route)
      : // TODO(ensure-static): this could be something client-specific because we know
        // that server data is complete
        createBodyError(kind, workStore.route),
    componentStack,
    null
  )
  dynamicValidation.dynamicErrors.push(error)
}

export function trackAllowedDynamicAccess(
  dynamicReason: unknown,
  workStore: WorkStore,
  componentStack: string,
  dynamicValidation: DynamicValidationState,
  clientDynamic: DynamicTrackingState
) {
  const dynamicHoleKind = DynamicHoleKind.RuntimeOrDynamic

  const syncDynamicError = getPendingClientSyncDynamicError(clientDynamic)

  if (hasOutletRegex.test(componentStack)) {
    trackOutletSuspenseAboveBody(componentStack, dynamicValidation)
    return
  } else if (hasMetadataRegex.test(componentStack)) {
    dynamicValidation.hasDynamicMetadata = true
    return
  } else if (hasViewportRegex.test(componentStack)) {
    dynamicValidation.hasDynamicViewport = true
    return
  } else if (
    hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex.test(
      componentStack
    )
  ) {
    // For Suspense within body, the prelude wouldn't be empty so it wouldn't violate the empty static shells rule.
    // But if you have Suspense above body, the prelude is empty but we allow that because having Suspense
    // is an explicit signal from the user that they acknowledge the empty shell and want dynamic rendering.
    dynamicValidation.hasAllowedDynamic = true
    dynamicValidation.hasSuspenseAboveBody = true
    return
  } else if (hasSuspenseRegex.test(componentStack)) {
    // this error had a Suspense boundary above it so we don't need to report it as a source
    // of disallowed
    dynamicValidation.hasAllowedDynamic = true
    return
  } else if (syncDynamicError) {
    dynamicValidation.dynamicErrors.push(syncDynamicError)
    return
  }

  if (isClientHookDynamicError(dynamicReason)) {
    dynamicValidation.dynamicErrors.push(
      addErrorContext(dynamicReason, componentStack, null)
    )
    return
  }

  const error = addErrorContext(
    createBodyError(dynamicHoleKind, workStore.route),
    componentStack,
    null
  )
  dynamicValidation.dynamicErrors.push(error)
  return
}

export enum DynamicHoleKind {
  /** We know that this hole is caused by runtime data. */
  Runtime = 1,
  /** We know that this hole is caused by link data. */
  Link = 2,
  /** We know that this hole is caused by navigation(). */
  Navigation = 3,
  /** We know that this hole is caused by prefetch(). */
  Prefetch = 4,
  /** We know that this hole is caused by dynamic data. */
  Dynamic = 5,
  /** We know that this hole is caused by runtime or dynamic data, but don't know which. */
  RuntimeOrDynamic = 6,
}

// In Instant Validation we can always discriminate between runtime and dynamic.
export type InstantValidationHoleKind = Exclude<
  DynamicHoleKind,
  DynamicHoleKind.RuntimeOrDynamic
>

export type StaticValidationHoleKind =
  // During dev-time static validation we can discriminate runtime and dynamic.
  | DynamicHoleKind.Runtime
  | DynamicHoleKind.Dynamic
  // During build-time static validation we can't discriminate runtime and dynamic.
  | DynamicHoleKind.RuntimeOrDynamic

/** Stores dynamic reasons used during an SSR render in instant validation. */
export type InstantValidationState = {
  hasDynamicMetadata: boolean
  hasAllowedClientDynamicAboveBoundary: boolean
  dynamicMetadata: null | Error
  hasDynamicViewport: boolean
  hasAllowedDynamic: boolean
  dynamicErrors: Array<Error>
  validationPreventingErrors: Array<Error>
  thrownErrorsOutsideBoundary: Array<unknown>
  /** Per-slot config factories. Index 0 is the root config (fallback).
   * Indices 1+ correspond to slot marker components in the tree. */
  slotStacks: Array<(() => Error) | null>
}

export function createInstantValidationState(
  slotStacks: Array<(() => Error) | null>
): InstantValidationState {
  return {
    hasDynamicMetadata: false,
    hasAllowedClientDynamicAboveBoundary: false,
    dynamicMetadata: null,
    hasDynamicViewport: false,
    hasAllowedDynamic: false,
    dynamicErrors: [],
    validationPreventingErrors: [],
    thrownErrorsOutsideBoundary: [],
    slotStacks,
  }
}

export function trackDynamicHoleInNavigation(
  dynamicReason: unknown,
  workStore: WorkStore,
  componentStack: string,
  dynamicValidation: InstantValidationState,
  clientDynamic: DynamicTrackingState,
  kind: InstantValidationHoleKind,
  boundaryState: ValidationBoundaryTracking
) {
  const syncDynamicError = getPendingClientSyncDynamicError(clientDynamic)

  if (hasOutletRegex.test(componentStack)) {
    // We don't need to track that this is dynamic. It is only so when something else is also dynamic.
    return
  }
  // Resolve the config stack for this specific error. If the error
  // is inside a slot marker, use that slot's config. Otherwise fall
  // back to the default.
  const effectiveCreateInstantStack = resolveInstantStack(
    componentStack,
    dynamicValidation
  )

  if (hasMetadataRegex.test(componentStack)) {
    const error = addErrorContext(
      createMetadataError(kind, workStore.route),
      componentStack,
      effectiveCreateInstantStack
    )
    dynamicValidation.dynamicMetadata = error
    return
  }
  if (hasViewportRegex.test(componentStack)) {
    const error = addErrorContext(
      createViewportError(kind, workStore.route),
      componentStack,
      effectiveCreateInstantStack
    )
    dynamicValidation.dynamicErrors.push(error)
    return
  }

  const boundaryLocation =
    hasInstantValidationBoundaryRegex.exec(componentStack)
  if (!boundaryLocation) {
    // We don't see the validation boundary in the component stack,
    // so this hole must be coming from a shared parent.
    // Shared parents are fully resolved and don't have RSC holes,
    // but they can still suspend in a client component during SSR.

    // If we managed to render all the validation boundaries, that means
    // that the client holes aren't blocking validation and we can disregard them.
    // Note that we don't even care whether they have suspense or not.
    if (allRequiredBoundariesRendered(boundaryState)) {
      dynamicValidation.hasAllowedClientDynamicAboveBoundary = true
      dynamicValidation.hasAllowedDynamic = true // Holes outside the boundary contribute to allowing dynamic metadata
      return
    } else {
      // TODO(instant-validation) TODO(NAR-787)
      // If shared parents blocked us from validating, we should only log
      // the errors from the innermost (segments), i.e. omit layouts whose
      // slots managed to render (because clearly they didn't block validation)
      const message = `Route "${workStore.route}": Could not validate \`instant\` because a Client Component in a parent segment prevented the page from rendering.`
      const error = addErrorContext(
        new Error(message),
        componentStack,
        effectiveCreateInstantStack
      )
      dynamicValidation.validationPreventingErrors.push(error)
      return
    }
  } else {
    // The hole originates inside the validation boundary.
    //
    // Check if we have a Suspense above the hole, but below the validation boundary.
    // If we do, then this dynamic usage wouldn't block a navigation to this subtree.
    // Conversely, if the nearest suspense is above the validation boundary, then this subtree would block.
    //
    // Note that in the component stack, children come before parents.
    //
    // Valid:
    //   ...
    //   at Suspense
    //   ...
    //   at __next_prefetch_validation_boundary__
    //
    // Invalid:
    //   ...
    //   at __next_prefetch_validation_boundary__
    //   ...
    //   at Suspense
    //
    const suspenseLocation = hasSuspenseRegex.exec(componentStack)
    if (suspenseLocation) {
      if (suspenseLocation.index < boundaryLocation.index) {
        dynamicValidation.hasAllowedDynamic = true
        return
      } else {
        // invalid - fallthrough
      }
    }
  }

  if (syncDynamicError) {
    if (
      effectiveCreateInstantStack !== null &&
      syncDynamicError.cause === undefined
    ) {
      syncDynamicError.cause = effectiveCreateInstantStack()
    }
    dynamicValidation.dynamicErrors.push(syncDynamicError)
    return
  }

  if (isClientHookDynamicError(dynamicReason)) {
    dynamicValidation.dynamicErrors.push(
      addErrorContext(
        dynamicReason,
        componentStack,
        effectiveCreateInstantStack
      )
    )
    return
  }

  const error = addErrorContext(
    createBodyErrorInNavigation(kind, workStore.route),
    componentStack,
    effectiveCreateInstantStack
  )
  dynamicValidation.dynamicErrors.push(error)
  return
}

function createBodyError(kind: StaticValidationHoleKind, route: string): Error {
  switch (kind) {
    case DynamicHoleKind.Runtime:
      return createRuntimeBodyError(route)
    case DynamicHoleKind.Dynamic:
      return createDynamicBodyError(route)
    case DynamicHoleKind.RuntimeOrDynamic:
      return createDynamicOrRuntimeBodyError(route)
  }
}

function createBodyErrorInNavigation(
  kind: InstantValidationHoleKind,
  route: string
): Error {
  switch (kind) {
    case DynamicHoleKind.Runtime:
      return createRuntimeBodyErrorInNavigation(route)
    case DynamicHoleKind.Link:
      return createLinkBodyErrorInNavigation(route)
    case DynamicHoleKind.Navigation:
      return createNavigationBodyErrorInNavigation(route)
    case DynamicHoleKind.Prefetch:
      return createPrefetchBodyErrorInNavigation(route)
    case DynamicHoleKind.Dynamic:
      return createDynamicBodyErrorInNavigation(route)
  }
}

function createMetadataError(kind: DynamicHoleKind, route: string): Error {
  switch (kind) {
    case DynamicHoleKind.Runtime:
      return createRuntimeMetadataError(route)
    case DynamicHoleKind.Link:
      return createLinkMetadataError(route)
    case DynamicHoleKind.Navigation:
      return createNavigationMetadataError(route)
    case DynamicHoleKind.Prefetch:
      return createPrefetchMetadataError(route)
    case DynamicHoleKind.Dynamic:
      return createDynamicMetadataError(route)
    case DynamicHoleKind.RuntimeOrDynamic:
      return createDynamicOrRuntimeMetadataError(route)
  }
}

function createViewportError(kind: DynamicHoleKind, route: string): Error {
  switch (kind) {
    case DynamicHoleKind.Runtime:
      return createRuntimeViewportError(route)
    case DynamicHoleKind.Link:
      return createLinkViewportError(route)
    case DynamicHoleKind.Navigation:
      return createNavigationViewportError(route)
    case DynamicHoleKind.Prefetch:
      return createPrefetchViewportError(route)
    case DynamicHoleKind.Dynamic:
      return createDynamicViewportError(route)
    case DynamicHoleKind.RuntimeOrDynamic:
      return createDynamicOrRuntimeViewportError(route)
  }
}

function createBodyErrorInStaticRoute(
  kind: StaticValidationHoleKind,
  route: string
): Error {
  switch (kind) {
    case DynamicHoleKind.Runtime:
      return createRuntimeBodyErrorInStaticRoute(route)
    case DynamicHoleKind.Dynamic:
      return createDynamicBodyErrorInStaticRoute(route)
    case DynamicHoleKind.RuntimeOrDynamic:
      return createNonPrerenderableBodyErrorInStaticRoute(route)
  }
}

function createMetadataErrorInStaticRoute(
  kind: StaticValidationHoleKind,
  route: string
) {
  switch (kind) {
    case DynamicHoleKind.Runtime:
      return createRuntimeMetadataErrorInStaticRoute(route)
    case DynamicHoleKind.Dynamic:
      return createDynamicMetadataErrorInStaticRoute(route)
    case DynamicHoleKind.RuntimeOrDynamic:
      return createNonPrerenderableMetadataErrorInStaticRoute(route)
  }
}

function createViewportErrorInStaticRoute(
  kind: StaticValidationHoleKind,
  route: string
) {
  switch (kind) {
    case DynamicHoleKind.Runtime:
      return createRuntimeViewportErrorInStaticRoute(route)
    case DynamicHoleKind.Dynamic:
      return createDynamicViewportErrorInStaticRoute(route)
    case DynamicHoleKind.RuntimeOrDynamic:
      return createNonPrerenderableViewportErrorInStaticRoute(route)
  }
}

export function trackThrownErrorInNavigation(
  workStore: WorkStore,
  dynamicValidation: InstantValidationState,
  thrownValue: unknown,
  componentStack: string,
  reactBrowserBailout: boolean
) {
  const boundaryLocation =
    hasInstantValidationBoundaryRegex.exec(componentStack)
  if (!boundaryLocation) {
    // There's no validation boundary on the component stack.
    // This error may have blocked a boundary from rendering.

    // Wrap the error to provide component context.
    // This helps for errors from node_modules which would otherwise
    // have no useful stack information due to ignore-listing,
    // e.g. next/dynamic with `ssr: false`.
    if (reactBrowserBailout) {
      // React preserves Next's branded bailout reason as the error cause.
      // Replace the internal wrapper before storing the user-facing diagnostic.
      const browserBailoutReason = getReactBrowserBailoutReason(thrownValue)
      if (browserBailoutReason !== undefined) {
        const browserBailoutError = thrownValue as Error
        browserBailoutError.cause = browserBailoutReason
      }
    }

    const error = addErrorContext(
      new Error(
        'An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.',
        { cause: thrownValue }
      ),
      componentStack,
      null
    )
    dynamicValidation.thrownErrorsOutsideBoundary.push(error)
  } else {
    // There's validation boundary on the component stack,
    // so we know this error didn't block a validation boundary from rendering.
    // However, this error might be hiding be hiding dynamic content that would
    // cause validation to fail.
    const suspenseLocation = hasSuspenseRegex.exec(componentStack)
    if (suspenseLocation) {
      if (suspenseLocation.index < boundaryLocation.index) {
        // There's a Suspense below the validation boundary but above this error's location.
        // This subtree can't fail instant validation because any potential
        // dynamic holes would be guarded by the Suspense anyway,
        // so we can allow this.
        return
      } else {
        // invalid - fallthrough
      }
    }
    if (reactBrowserBailout) {
      // React preserves Next's branded bailout reason as the error cause.
      // Replace the internal wrapper before storing the user-facing diagnostic.
      const browserBailoutReason = getReactBrowserBailoutReason(thrownValue)
      if (browserBailoutReason !== undefined) {
        const browserBailoutError = thrownValue as Error
        browserBailoutError.cause = browserBailoutReason
      }
    }

    const message = `Route "${workStore.route}": Could not validate \`instant\` because an error prevented the target segment from rendering.`
    const error = addErrorContext(
      new Error(message, { cause: thrownValue }),
      componentStack,
      null // TODO(instant-validation-build): conflicting use of cause
    )
    dynamicValidation.validationPreventingErrors.push(error)
  }
}

export function trackDynamicHoleInStaticShell(
  dynamicReason: unknown,
  workStore: WorkStore,
  componentStack: string,
  dynamicValidation: DynamicValidationState,
  clientDynamic: DynamicTrackingState,
  kind: DynamicHoleKind.Runtime | DynamicHoleKind.Dynamic
) {
  const syncDynamicError = getPendingClientSyncDynamicError(clientDynamic)

  if (hasOutletRegex.test(componentStack)) {
    trackOutletSuspenseAboveBody(componentStack, dynamicValidation)
    return
  } else if (hasMetadataRegex.test(componentStack)) {
    const error = addErrorContext(
      createMetadataError(kind, workStore.route),
      componentStack,
      null
    )
    dynamicValidation.dynamicMetadata = error
    return
  } else if (hasViewportRegex.test(componentStack)) {
    const error = addErrorContext(
      createViewportError(kind, workStore.route),
      componentStack,
      null
    )
    dynamicValidation.dynamicErrors.push(error)
    return
  } else if (
    hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex.test(
      componentStack
    )
  ) {
    // For Suspense within body, the prelude wouldn't be empty so it wouldn't violate the empty static shells rule.
    // But if you have Suspense above body, the prelude is empty but we allow that because having Suspense
    // is an explicit signal from the user that they acknowledge the empty shell and want dynamic rendering.
    dynamicValidation.hasAllowedDynamic = true
    dynamicValidation.hasSuspenseAboveBody = true
    return
  } else if (hasSuspenseRegex.test(componentStack)) {
    // this error had a Suspense boundary above it so we don't need to report it as a source
    // of disallowed
    dynamicValidation.hasAllowedDynamic = true
    return
  } else if (syncDynamicError) {
    dynamicValidation.dynamicErrors.push(syncDynamicError)
    return
  }

  if (isClientHookDynamicError(dynamicReason)) {
    dynamicValidation.dynamicErrors.push(
      addErrorContext(dynamicReason, componentStack, null)
    )
    return
  }

  const error = addErrorContext(
    kind === DynamicHoleKind.Runtime
      ? createRuntimeBodyError(workStore.route)
      : createDynamicBodyError(workStore.route),
    componentStack,
    null
  )
  dynamicValidation.dynamicErrors.push(error)
  return
}

/**
 * In dev mode, we prefer using the owner stack, otherwise the provided
 * component stack is used.
 */
function addErrorContext(
  error: Error,
  componentStack: string,
  createInstantStack: (() => Error) | null
) {
  let ownerStack: string | null = null
  if (process.env.NODE_ENV !== 'production') {
    const React = require('react') as typeof import('react')
    ownerStack = React.captureOwnerStack ? React.captureOwnerStack() : null
  }

  if (createInstantStack !== null) {
    error.cause = createInstantStack()
  }
  // TODO go back to owner stack here if available. This is temporarily using componentStack to get the right
  //
  error.stack =
    error.name + ': ' + error.message + (ownerStack || componentStack)
  return error
}

export enum PreludeState {
  Full = 0,
  Empty = 1,
  Errored = 2,
}

export function logDisallowedDynamicError(
  workStore: WorkStore,
  error: Error
): void {
  console.error(error)
  logBuildDebugHint(workStore.route)
}

export function throwIfSyncIOUsed(
  workStore: WorkStore,
  serverDynamic: DynamicTrackingState
) {
  if (serverDynamic.syncDynamicErrorWithStack) {
    logDisallowedDynamicError(
      workStore,
      serverDynamic.syncDynamicErrorWithStack
    )
    throw new StaticGenBailoutError()
  }
}

export function throwIfDisallowedDynamic(
  workStore: WorkStore,
  prelude: PreludeState,
  dynamicValidation: DynamicValidationState,
  serverDynamic: DynamicTrackingState,
  allowEmptyStaticShell: boolean
): void {
  const dynamicHoleKind = DynamicHoleKind.RuntimeOrDynamic

  throwIfSyncIOUsed(workStore, serverDynamic)

  // The dynamic metadata error is a mistake-detection signal. It fires when the
  // rest of the shell is otherwise fully static apart from metadata, suggesting
  // the dynamic data access in `generateMetadata` was probably unintentional.
  // That condition is independent of whether the user or build phase accepted
  // an empty shell, so we surface it before any opt-in bypass.
  if (
    prelude === PreludeState.Full &&
    dynamicValidation.hasAllowedDynamic === false &&
    dynamicValidation.hasDynamicMetadata
  ) {
    console.error(createMetadataError(dynamicHoleKind, workStore.route).message)
    throw new StaticGenBailoutError()
  }

  // Either flag expresses "this shell is allowed to be empty/blocking":
  //   - `allowEmptyStaticShell` covers `instant = false` (user opt-in)
  //     and the build-phase fallback-shell case.
  //   - `hasSuspenseAboveBody` is the structural opt-in inside the user's root
  //     layout.
  // Treat them as synonyms for the purpose of bypassing shell-failure errors.
  if (allowEmptyStaticShell || dynamicValidation.hasSuspenseAboveBody) {
    return
  }

  if (prelude !== PreludeState.Full) {
    // We didn't have any sync bailouts but there may be user code which
    // blocked the root. We would have captured these during the prerender
    // and can log them here and then terminate the build/validating render
    const dynamicErrors = dynamicValidation.dynamicErrors
    if (dynamicErrors.length > 0) {
      for (let i = 0; i < dynamicErrors.length; i++) {
        logDisallowedDynamicError(workStore, dynamicErrors[i])
      }

      throw new StaticGenBailoutError()
    }

    // If we got this far then the only other thing that could be blocking
    // the root is dynamic Viewport. If this is dynamic then
    // you need to opt into that by adding a Suspense boundary above the body
    // to indicate your are ok with fully dynamic rendering.
    if (dynamicValidation.hasDynamicViewport) {
      console.error(
        createViewportError(dynamicHoleKind, workStore.route).message
      )
      throw new StaticGenBailoutError()
    }

    if (prelude === PreludeState.Empty) {
      // If we ever get this far then we messed up the tracking of invalid dynamic.
      // We still adhere to the constraint that you must produce a shell but invite the
      // user to report this as a bug in Next.js.
      console.error(
        `Route "${workStore.route}" did not produce a static shell and Next.js was unable to determine a reason. This is a bug in Next.js.`
      )
      throw new StaticGenBailoutError()
    }
  }
}

export function throwIfDisallowedDynamicInStaticRoute(
  workStore: WorkStore,
  prelude: PreludeState,
  dynamicValidation: DynamicValidationState,
  serverDynamic: DynamicTrackingState,
  isFallbackShell: boolean,
  allowEmptyStaticShell: boolean,
  isServerPartial: boolean
): void {
  const reasons = getDisallowedReasonsInStaticRoute(
    workStore,
    prelude,
    dynamicValidation,
    serverDynamic,
    isFallbackShell,
    allowEmptyStaticShell,
    isServerPartial
  )
  if (reasons.length > 0) {
    for (const reason of reasons) {
      logDisallowedDynamicError(workStore, reason)
    }
    throw new StaticGenBailoutError()
  }
}

export function getDisallowedReasonsInStaticRoute(
  workStore: WorkStore,
  prelude: PreludeState,
  dynamicValidation: DynamicValidationState,
  serverDynamic: DynamicTrackingState | null,
  isFallbackShell: boolean,
  allowEmptyStaticShell: boolean,
  isServerPartial: boolean
): Error[] {
  if (serverDynamic && serverDynamic.syncDynamicErrorWithStack) {
    return [serverDynamic.syncDynamicErrorWithStack]
  }

  // We do a fallback shell prerender, but it's not meant to be validated --
  // we just need it to create the relevant prerender outputs.
  if (isFallbackShell) {
    return []
  }

  // Suspense-above-body and `instant = false` bypass reporting
  // that the shell is blocked. However, if we have non-prerenderable server
  // data, we still have to error, regardless of those two.
  if (
    !isServerPartial &&
    (allowEmptyStaticShell || dynamicValidation.hasSuspenseAboveBody)
  ) {
    return []
  }

  const { dynamicErrors } = dynamicValidation
  if (dynamicErrors.length > 0) {
    return dynamicErrors
  }

  // Dynamic data may have been passed into a client component without calling `use()`,
  // in which case we wouldn't see it during the prerender, but still need to error.
  // Fall back to a generic error message.
  if (isServerPartial) {
    return [
      new Error(
        `Route "${workStore.route}": Next.js encountered data that is not available during a static prerender, but is unable to provide a location.`
      ),
    ]
  }

  if (prelude === PreludeState.Empty || prelude === PreludeState.Errored) {
    // We've somehow ended up with an empty prelude but no dynamic errors.
    // We must've messed up the tracking somehow.
    return [
      new InvariantError(
        `Route "${workStore.route}" did not produce a static shell and Next.js was unable to determine a reason.`
      ),
    ]
  }
  return []
}

export function getStaticShellDisallowedDynamicReasons(
  workStore: WorkStore,
  prelude: PreludeState,
  dynamicValidation: DynamicValidationState,
  allowEmptyStaticShell: boolean
): Array<Error> {
  // The dynamic metadata error is a mistake-detection signal. It fires when the
  // rest of the shell is otherwise fully static apart from metadata, suggesting
  // the dynamic data access in `generateMetadata` was probably unintentional.
  // That condition is independent of whether the user or build phase accepted
  // an empty shell, so we surface it before any opt-in bypass.
  if (
    prelude === PreludeState.Full &&
    dynamicValidation.hasAllowedDynamic === false &&
    dynamicValidation.dynamicErrors.length === 0 &&
    dynamicValidation.dynamicMetadata
  ) {
    return [dynamicValidation.dynamicMetadata]
  }

  // Either flag expresses "this shell is allowed to be empty/blocking":
  //   - `allowEmptyStaticShell` covers `instant = false` (user opt-in)
  //     and the build-phase fallback-shell case.
  //   - `hasSuspenseAboveBody` is the structural opt-in inside the user's root
  //     layout.
  // Treat them as synonyms for the purpose of bypassing shell-failure errors.
  if (allowEmptyStaticShell || dynamicValidation.hasSuspenseAboveBody) {
    return []
  }

  if (prelude !== PreludeState.Full) {
    // We didn't have any sync bailouts but there may be user code which
    // blocked the root. We would have captured these during the prerender
    // and can log them here and then terminate the build/validating render
    const dynamicErrors = dynamicValidation.dynamicErrors
    if (dynamicErrors.length > 0) {
      return dynamicErrors
    }

    if (prelude === PreludeState.Empty) {
      // If we ever get this far then we messed up the tracking of invalid dynamic.
      // We still adhere to the constraint that you must produce a shell but invite the
      // user to report this as a bug in Next.js.
      return [
        new InvariantError(
          `Route "${workStore.route}" did not produce a static shell and Next.js was unable to determine a reason.`
        ),
      ]
    }
  }
  // We had a non-empty prelude and there are no dynamic holes
  return []
}

/**
 * `errors` are validation failures that should be surfaced immediately.
 * `deferredFallback` carries a missing-boundary explanation that the caller
 * should hold back until *every* validation depth has been tried — a missing
 * boundary often just means a parent layout intentionally omitted a slot, and
 * a different depth's validation may surface a more meaningful error.
 */
export type NavigationValidationResult =
  // instances that block instant navigation
  | Array<Error>
  // validation was blocked with zero or more reasons
  | Error
  | AggregateError

export function getNavigationDisallowedDynamicReasons(
  workStore: WorkStore,
  prelude: PreludeState,
  dynamicValidation: InstantValidationState,
  validationSampleTracking: InstantValidationSampleTracking | null,
  boundaryState: ValidationBoundaryTracking,
  devRenderDidError: boolean
): NavigationValidationResult {
  // If we have errors related to missing samples, those should take precedence over everything else.
  if (validationSampleTracking) {
    const { missingSampleErrors } = validationSampleTracking
    if (missingSampleErrors.length > 0) {
      return missingSampleErrors
    }
  }

  const { validationPreventingErrors } = dynamicValidation
  if (validationPreventingErrors.length > 0) {
    if (process.env.__NEXT_DEV_SERVER && devRenderDidError) {
      // The dev render already surfaced server errors to the user.
      // The same errors likely caused validation to be inconclusive,
      // so reporting them again as validation failures would be noisy.
      return []
    }
    return validationPreventingErrors
  }

  // NOTE: We don't care about Suspense above body here,
  // we're only concerned with the validation boundary
  if (prelude !== PreludeState.Full) {
    const dynamicErrors = dynamicValidation.dynamicErrors
    if (dynamicErrors.length > 0) {
      return dynamicErrors
    }

    if (
      prelude === PreludeState.Empty &&
      !dynamicValidation.hasAllowedClientDynamicAboveBoundary &&
      allRequiredBoundariesRendered(boundaryState)
    ) {
      // If we ever get this far then we messed up the tracking of invalid
      // dynamic. (When boundaries are missing the deferred fallback below
      // will surface a more useful error.)
      return new InvariantError(
        `Route "${workStore.route}" failed to render during instant validation and Next.js was unable to determine a reason.`
      )
    }
  } else {
    const dynamicErrors = dynamicValidation.dynamicErrors
    if (dynamicErrors.length > 0) {
      return dynamicErrors
    }

    if (
      dynamicValidation.hasAllowedDynamic === false &&
      dynamicValidation.dynamicMetadata
    ) {
      return [dynamicValidation.dynamicMetadata]
    }
  }

  // Missing boundaries on their own aren't a strong signal — a parent
  // layout may legitimately omit a slot. Defer this so the caller can
  // try shallower validation depths first; if every depth comes up
  // empty we still want to surface this so the user is made aware that
  // validation didn't complete. When we add a markers API, the
  // marker-based variant of this check can become strict again.
  if (!allRequiredBoundariesRendered(boundaryState)) {
    const { thrownErrorsOutsideBoundary } = dynamicValidation
    const rootInstantStack = dynamicValidation.slotStacks[0]
    if (thrownErrorsOutsideBoundary.length === 0) {
      const missingFiles: string[] = []
      for (const [id, filePaths] of boundaryState.requiredIds) {
        if (!boundaryState.renderedIds.has(id)) {
          for (const filePath of filePaths) {
            let normalized = filePath
              .replace(/^\[project\][\\/]?/, '')
              .replace(process.cwd() + '/', '')
              .replace(process.cwd() + '\\', '')
            missingFiles.push(normalized)
          }
        }
      }
      missingFiles.sort()
      return createUnrenderedSegmentError(workStore.route, missingFiles)
    } else if (process.env.__NEXT_DEV_SERVER && devRenderDidError) {
      // Errors outside the boundary likely blocked it from rendering,
      // but they're already being reported to the user via the dev
      // render. Suppress the validation failure to avoid noise.
      return []
    } else if (thrownErrorsOutsideBoundary.length === 1) {
      const message = `Route "${workStore.route}": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.`
      const error = rootInstantStack !== null ? rootInstantStack() : new Error()
      error.name = 'Error'
      error.message = message
      return new AggregateError([
        error,
        thrownErrorsOutsideBoundary[0] as Error,
      ])
    } else {
      const message = `Route "${workStore.route}": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to one of the following errors.`
      const error = rootInstantStack !== null ? rootInstantStack() : new Error()
      error.name = 'Error'
      error.message = message
      return new AggregateError([
        error,
        ...(thrownErrorsOutsideBoundary as Error[]),
      ])
    }
  }

  // We had a non-empty prelude and there are no dynamic holes
  return []
}
