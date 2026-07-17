/**
 * DEV-ONLY guardrail for the "module-scoped state leaks across requests" bug.
 *
 * When a reused server function instance keeps a top-level mutable container
 * (`const cache = new Map()`) that stores a per-request `Promise`, and the
 * cache key is deterministic across requests (e.g. `useId()`), one request can
 * read another request's in-flight/resolved data. This is the v0 incident:
 * a `useId()`-keyed module Map served one user's sidebar chats to another.
 *
 * We can't observe the unwrap — native `await` (and React `use()` on an
 * already-settled promise) bypass `Promise.prototype.then`, and async_hooks
 * exposes no cross-store consume event. So we watch the container instead:
 * when a Promise stored under one request's store is retrieved under a
 * different request's store, we warn.
 *
 * This is opt-in via `__NEXT_DETECT_CROSS_REQUEST_STATE` because it patches the
 * global `Map`/`Set`/`WeakMap`/`WeakSet` prototypes. It is also gated to the
 * dev server (`__NEXT_DEV_SERVER`) so it is never installed during
 * `next build`, prerender, or `next start`.
 */
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { installCrossRequestStateDetector } from './cross-request-state-detector'

if (
  process.env.NODE_ENV !== 'production' &&
  process.env.__NEXT_DEV_SERVER &&
  process.env.__NEXT_DETECT_CROSS_REQUEST_STATE
) {
  try {
    installCrossRequestStateDetector({
      getStore: () => workUnitAsyncStorage.getStore(),
      warn: (message) => console.error('\n' + message + '\n'),
    })
  } catch {
    console.error('Failed to install the cross-request state detector.')
  }
}
