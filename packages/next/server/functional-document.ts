import { FunctionComponent, ReactElement } from 'react'
import { NextSimplePageContext } from '../shared/lib/utils'

type FlushHandler = () => ReactElement
type FlushHandlerHook = (fn: FlushHandler) => void
let CURRENT_HOOK_IMPL: FlushHandlerHook | null = null

export async function render(
  Document: FunctionComponent
): Promise<[ReactElement | null, Array<FlushHandler>]> {
  const flushHandlers: Array<FlushHandler> = []
  const nextHookImpl: FlushHandlerHook = fn => {
    flushHandlers.push(fn)
  }

  const prevHookImpl = CURRENT_HOOK_IMPL

    try {
      flushHandlers.length = 0
      CURRENT_HOOK_IMPL = nextHookImpl
      // Note: we intentionally do not pass props to functional `Document` components. Since this
      // component is only used on the very first render, we want to prevent handing applications
      // a footgun where page behavior can unexpectedly differ. Instead, applications should
      // move such logic to `pages/_app`.
      const elem = Document({})
      return [elem, flushHandlers]
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
    }
    finally {
      CURRENT_HOOK_IMPL = prevHookImpl
    }
  }

export function useFlushHandler(fn: FlushHandler): void {
  const currHookImpl = CURRENT_HOOK_IMPL
  if (!currHookImpl) {
    throw new Error(
      'The useFlushHandler hook can only be used in pages/_document'
    )
  }
  return currHookImpl(fn)
}