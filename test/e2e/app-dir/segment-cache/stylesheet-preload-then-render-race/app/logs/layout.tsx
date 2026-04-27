import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { FallbackProbe } from '../fallback-probe'

// Mirrors the production wide-Suspense layout shape: a fresh
// `<Suspense>` at LAYOUT depth (above the page). When this layout
// mounts for the first time during navigation,
// `pushPrimaryTreeSuspenseHandler` (line 7734 in
// `react-dom-client.production.js`) sets `shellBoundary` to this
// Suspense — its `current.alternate` is null. Any stylesheet rendered
// below it whose `state.loading=0` will throw
// `SuspenseyCommitException` on a transition lane (because
// `shouldRemainOnPreviousScreen()` returns false when shellBoundary is
// set), which causes this Suspense to commit its fallback for at least
// one paint before the retry render eventually commits the children.
//
// `<FallbackProbe />` is a tripwire — if it ever mounts, the bug fired.
export default function LogsLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<FallbackProbe />}>{children}</Suspense>
}
