import { getOriginalStackFrames as getOriginalStackFramesUncached } from '../../shared/stack-frame'
import type { OriginalStackFrame } from '../../shared/stack-frame'
import { getErrorSource } from '../../../shared/lib/error-source'
import { parseStack } from '../../../server/lib/parse-stack'
import { use } from 'react'
import { useDevOverlayContext } from '../../dev-overlay.browser'

export const MAX_CAUSE_DEPTH = 5

export function useFrames(
  error: Error,
  isAppDir: boolean
): readonly OriginalStackFrame[] {
  const { getOwnerStack } = useDevOverlayContext()

  // Kick of sourcemapping of causes to avoid a waterfall.
  preloadOriginalStackFramesDeeply(error, getOwnerStack, isAppDir)

  return use(getOriginalStackFrames(error, getOwnerStack, isAppDir))
}

const originalStackFrames = new WeakMap<
  Error,
  Promise<readonly OriginalStackFrame[]>
>()

export function getOriginalStackFrames(
  error: Error,
  getOwnerStack: (error: Error) => string | null | undefined,
  isAppDir: boolean
): Promise<readonly OriginalStackFrame[]> {
  if (originalStackFrames.has(error)) {
    return originalStackFrames.get(error)!
  }
  const ownerStack = getOwnerStack(error)
  const frames = parseStack((error.stack || '') + (ownerStack || ''))
  const promise = getOriginalStackFramesUncached(
    frames,
    getErrorSource(error),
    isAppDir
  )

  originalStackFrames.set(error, promise)
  return promise
}

function preloadOriginalStackFramesDeeply(
  error: Error,
  getOwnerStack: (error: Error) => string | null | undefined,
  isAppDir: boolean
) {
  if (!originalStackFrames.has(error)) {
    // swallow errors since this is just a preload
    void getOriginalStackFrames(error, getOwnerStack, isAppDir).catch(() => {})
    preloadCausalChain(error, getOwnerStack, isAppDir)
  }
}

function preloadCausalChain(
  error: Error,
  getOwnerStack: (error: Error) => string | null | undefined,
  isAppDir: boolean
): void {
  let cause = error.cause
  let depth = 0
  while (cause instanceof Error) {
    if (depth >= MAX_CAUSE_DEPTH) {
      break
    }

    getOriginalStackFrames(cause, getOwnerStack, isAppDir).catch(() => {})

    cause = cause.cause
    depth++
  }
}
