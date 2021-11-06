import { FunctionComponent } from 'react'
import { NextSimplePageContext } from '../shared/lib/utils'

type LegacyGetInitialPropsFn<T> = (ctx: NextSimplePageContext) => Promise<T>
type LegacyGetInitialPropsHook = <T>(fn: LegacyGetInitialPropsFn<T>) => T

let HOOK_CONTEXT: LegacyGetInitialPropsHook | null = null

export async function render(
  ctx: NextSimplePageContext,
  Document: FunctionComponent
) {
  let state: {
    fn: LegacyGetInitialPropsFn<unknown>
    promise: Promise<void> | null
    value?: unknown
  } | null = null
  const nextHookContext = <T>(fn: LegacyGetInitialPropsFn<T>) => {
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
        'useLegacyGetInitialProps was called with different functions. This is not supported.'
      )
    }
    if (state.promise) {
      throw new InternalSuspendError(state.promise)
    }
    return state.value as T
  }

  const tryRender = () => {
    const prevHookContext = HOOK_CONTEXT
    HOOK_CONTEXT = nextHookContext

    try {
      return Document({})
    } finally {
      HOOK_CONTEXT = prevHookContext
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
  const impl = HOOK_CONTEXT
  if (!impl) {
    throw new Error(
      'The useLegacyGetInitialProps hook can only be used in pages/_document'
    )
  }
  return impl(fn)
}

class InternalSuspendError {
  promise: Promise<void>

  constructor(promise: Promise<void>) {
    this.promise = promise
  }
}
