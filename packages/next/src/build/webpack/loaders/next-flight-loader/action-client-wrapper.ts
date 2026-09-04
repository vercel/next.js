// This file must be bundled in the app's client layer, it shouldn't be directly
// imported by the server.

export { callServer } from 'next/dist/client/app-call-server'
export { findSourceMapURL } from 'next/dist/client/app-find-source-map-url'

import type { createServerReference as CreateServerReference } from 'react-server-dom-webpack/client'

// A wrapper around the Flight client's createServerReference.
// See also: https://github.com/facebook/react/pull/26632
//
// Client-side `.bind()` on a Server Function creates a new pending boundPromise
// on every call. During a no-JS useActionState postback, Fizz's
// $$IS_SIGNATURE_EQUAL suspends on that promise, retries the render, binds
// again, and hangs. Compare the bound-arg count against the parent reference
// instead, which is already resolved for createServerReference imports.
// eslint-disable-next-line import/no-extraneous-dependencies
import { createServerReference as createServerReferenceImpl } from 'react-server-dom-webpack/client'

type ServerReferenceFn = ((...args: unknown[]) => Promise<unknown>) & {
  $$FORM_ACTION?: (identifierPrefix: unknown) => unknown
  $$IS_SIGNATURE_EQUAL?: (
    referenceId: string,
    numberOfBoundArgs: number
  ) => boolean
}

function wrapServerReference(
  target: ServerReferenceFn,
  signatureParent: ServerReferenceFn,
  extraBoundCount = 0
): ServerReferenceFn {
  const wrapper = function (this: unknown, ...args: unknown[]) {
    return target.apply(this, args)
  } as ServerReferenceFn

  Object.defineProperties(wrapper, {
    $$FORM_ACTION: {
      value:
        typeof target.$$FORM_ACTION === 'function'
          ? target.$$FORM_ACTION.bind(target)
          : undefined,
    },
    $$IS_SIGNATURE_EQUAL: {
      value: function (
        referenceId: string,
        numberOfBoundArgs: number
      ): boolean {
        const isSignatureEqual = signatureParent.$$IS_SIGNATURE_EQUAL
        if (typeof isSignatureEqual !== 'function') {
          return false
        }
        return isSignatureEqual.call(
          signatureParent,
          referenceId,
          numberOfBoundArgs - extraBoundCount
        )
      },
    },
    bind: {
      value: function (...bindArgs: unknown[]) {
        const bound = (
          target.bind as (...args: unknown[]) => ServerReferenceFn
        )(...bindArgs)
        return wrapServerReference(
          bound,
          wrapper,
          Math.max(0, bindArgs.length - 1)
        )
      },
    },
  })

  return wrapper
}

export const createServerReference: typeof CreateServerReference = function (
  id,
  callServer,
  encodeFormAction,
  findSourceMapURL,
  functionName
) {
  const action = createServerReferenceImpl(
    id,
    callServer,
    encodeFormAction,
    findSourceMapURL,
    functionName
  ) as ServerReferenceFn
  return wrapServerReference(action, action)
}
