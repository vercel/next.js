import { FunctionComponent, ReactElement } from 'react'

type FlushEffect = () => ReactElement
type FlushEffectHook = (fn: FlushEffect) => void
let CURRENT_HOOK_IMPL: FlushEffectHook | null = null

export async function renderFunctionalDocument(
  Document: FunctionComponent
): Promise<[ReactElement | null, Array<FlushEffect>]> {
  const flushEffects: Array<FlushEffect> = []
  const nextHookImpl: FlushEffectHook = (fn) => {
    flushEffects.push(fn)
  }
  const prevHookImpl = CURRENT_HOOK_IMPL

  try {
    flushEffects.length = 0
    CURRENT_HOOK_IMPL = nextHookImpl
    // Note: we intentionally do not pass props to functional `Document` components. Since this
    // component is only used on the very first render, we want to prevent handing applications
    // a footgun where page behavior can unexpectedly differ. Instead, applications should
    // move such logic to `pages/_app`.
    const elem = Document({})
    return [elem, flushEffects]
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      typeof (err as any).then === 'function'
    ) {
      throw new Error(
        'Functional Next.js Document components do not currently support Suspense.\n' +
          'Read more: https://nextjs.org/docs/messages/functional-document-rsc'
      )
    }

    if (
      err instanceof Error &&
      /Invalid hook call|Minified React error #321/.test(err.message)
    ) {
      throw new Error(
        'Functional Next.js Document components do not currently support React hooks.\n' +
          'Read more: https://nextjs.org/docs/messages/functional-document-rsc'
      )
    }
    throw err
  } finally {
    CURRENT_HOOK_IMPL = prevHookImpl
  }
}

export function useFlushEffect(fn: FlushEffect): void {
  const currHookImpl = CURRENT_HOOK_IMPL
  if (!currHookImpl) {
    throw new Error(
      'The useFlushEffect hook can only be used by the `Document` component in `pages/_document`'
    )
  }
  return currHookImpl(fn)
}
