import { FunctionComponent } from 'react'
import { NextSimplePageContext } from '../shared/lib/utils'

type LegacyGetInitialPropsFn<T> = (ctx: NextSimplePageContext) => Promise<T>
type LegacyGetInitialPropsHook = <T>(fn: LegacyGetInitialPropsFn<T>) => T

let CURRENT_HOOK_IMPL: LegacyGetInitialPropsHook | null = null

export async function render(
  ctx: NextSimplePageContext,
  Document: FunctionComponent
) {
  let state: {
    fn: LegacyGetInitialPropsFn<unknown>
    promise: Promise<void> | null
    value?: unknown
  } | null = null
  let usedDuringRender = false
  const nextHookImpl = <T>(fn: LegacyGetInitialPropsFn<T>) => {
    if (usedDuringRender) {
      throw new Error(
        'useLegacyGetInitialProps was called multiple times. This is not supported.'
      )
    }
    usedDuringRender = true
    if (!state) {
      state = {
        fn,
        promise: fn({ ...ctx }).then((value) => {
          state = {
            fn,
            promise: null,
            value,
          }
        }),
      }
    }
    if (state.fn !== fn) {
      throw new Error(
        'The function passed to useLegacyGetInitialProps changed between renders. This is not supported.'
      )
    }
    if (state.promise) {
      throw new InternalSuspendError(state.promise)
    }
    return state.value as T
  }

  const tryRender = () => {
    const prevHookImpl = CURRENT_HOOK_IMPL
    CURRENT_HOOK_IMPL = nextHookImpl

    try {
      usedDuringRender = false
      // Note: we intentionally do not pass props to functional `Document` components. Since this
      // component is only used on the very first render, we want to prevent handing applications
      // a footgun where page behavior can unexpectedly differ.
      //
      // Instead, applications should ideally move such logic to `pages/_app`, or use the
      // `useLegacyGetInitialProps` hook (which will be deprecated eventually).
      return Document({})
    } finally {
      CURRENT_HOOK_IMPL = prevHookImpl
    }
  }

  while (true) {
    try {
      return tryRender()
    } catch (err) {
      if (
        err instanceof Error &&
        /Invalid hook call|Minified React error #321/.test(err.message)
      ) {
        throw new Error(
          'Functional Document components do not currently support React hooks.\n' +
            'Read more: https://nextjs.org/docs/messages/functional-document-hooks'
        )
      }
      if (!(err instanceof InternalSuspendError)) {
        throw err
      }
      await err.promise
    }
  }
}

export function useLegacyGetInitialProps<T>(fn: LegacyGetInitialPropsFn<T>): T {
  const currHookImpl = CURRENT_HOOK_IMPL
  if (!currHookImpl) {
    throw new Error(
      'The useLegacyGetInitialProps hook can only be used in pages/_document'
    )
  }
  return currHookImpl(fn)
}

class InternalSuspendError {
  promise: Promise<void>

  constructor(promise: Promise<void>) {
    this.promise = promise
  }
}
