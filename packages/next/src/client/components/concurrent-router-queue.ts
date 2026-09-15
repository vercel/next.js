// The concurrent-router-queue implementation of the navigator interface
// (navigator.ts). Callers must never import this module directly; when
// `experimental.concurrentRouterQueue` is enabled, imports of './navigator'
// resolve here at the bundler level (see create-compiler-aliases.ts and
// next_import_map.rs), and neither navigator.ts nor the sequential
// implementation is bundled at all.
//
// This module must remain free of side effects at module scope: in addition
// to the browser bundle, the navigator module graph is also compiled into
// the pre-compiled app-page runtime bundles (via app-render.tsx), where the
// bundler alias cannot reach. Only the browser copy's operations ever run.
//
// TODO: This is currently a stub. Every operation throws so that enabling
// the flag fails loudly instead of silently running the old implementation.

import type {
  AppHistoryState,
  NavigateAction,
  ScrollBehavior,
} from './router-reducer/router-reducer-types'
import type { NavigateOptions } from '../../shared/lib/app-router-context.shared-runtime'
import type { LinkInstance } from './links'
import type { RouterTransitionPrefetchIntent } from '../router-transition-types'

// Keep in sync with the identical message in concurrent-call-server.ts, so
// all unimplemented behavior shares a single error (and error code).
function notImplemented(): never {
  throw new Error(
    'Not implemented: this behavior is not yet supported when ' +
      '`experimental.concurrentRouterQueue` is enabled.'
  )
}

export function navigate(
  _href: string,
  _navigateType: NavigateAction['navigateType'],
  _scrollBehavior: ScrollBehavior,
  _linkInstanceRef: LinkInstance | null,
  _transitionTypes: string[] | undefined,
  _prefetchIntent: RouterTransitionPrefetchIntent | null
): void {
  notImplemented()
}

export function push(_href: string, _options?: NavigateOptions): void {
  notImplemented()
}

export function replace(_href: string, _options?: NavigateOptions): void {
  notImplemented()
}

export function traverse(
  _href: string,
  _historyState: AppHistoryState | undefined
): void {
  notImplemented()
}

export function restore(
  _url: URL,
  _historyState: AppHistoryState | undefined
): void {
  notImplemented()
}

// Never implemented, on purpose. This op exists only because the sequential
// queue expresses an MPA navigation as state (`pushRef.mpaNavigation`)
// consumed by a render-phase side effect, so a bfcache-restored page must
// reset that state with an urgent update before any other render can observe
// it and re-fire the navigation — urgency as a defense. The concurrent
// machine has no such hazard to defend against, and its single
// history/location owner handles the `pageshow` event itself, feeding it in
// as an ordinary restore — so this entry point won't be called at all once
// the shared callers are ported, and it dies with the sequential queue.
export function legacyUrgentBFCacheRestore(
  _url: URL,
  _historyState: AppHistoryState | undefined
): void {
  notImplemented()
}

export function refresh(): void {
  notImplemented()
}

// Development only.
export function hmrRefresh(): void {
  notImplemented()
}

// Type-only conformance check: this module must expose exactly the surface of
// the navigator interface. Fails to typecheck if a signature drifts. Compiles
// to `const _conformance = null` — no runtime effect.
const _conformance: typeof import('./navigator') =
  null as unknown as typeof import('./concurrent-router-queue')
