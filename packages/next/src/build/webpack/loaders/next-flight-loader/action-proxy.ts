import { encodeActionBoundArg } from '../action-utils'

const SERVER_REFERENCE_TAG = Symbol.for('react.server.reference')

export function encryptActionBoundArgs(args: any[]) {
  return args
}

export function decryptActionBoundArgs(args: any[]) {
  return args
}

export function createActionProxy(
  id: string,
  boundArgsFromClosure: null | any[],
  action: any,
  originalAction?: any
) {
  function bindImpl(this: any, _: any, ...boundArgs: any[]) {
    const currentAction = this

    const newAction = async function (...args: any[]) {
      if (originalAction) {
        return originalAction(newAction.$$bound.concat(args))
      } else {
        // In this case we're calling the user-defined action directly.
        return currentAction(...newAction.$$bound, ...args)
      }
    }

    for (const key of ['$$typeof', '$$id', '$$FORM_ACTION']) {
      // @ts-ignore
      newAction[key] = currentAction[key]
    }

    // Rebind args
    newAction.$$bound = (currentAction.$$bound || []).concat(boundArgs)

    // Assign bind method
    newAction.bind = bindImpl.bind(newAction)

    return newAction
  }

  Object.defineProperties(action, {
    $$typeof: {
      value: SERVER_REFERENCE_TAG,
    },
    $$id: {
      value: id,
    },
    $$bound: {
      value: boundArgsFromClosure
        ? boundArgsFromClosure.map((arg) => encodeActionBoundArg(id, arg))
        : null,
    },
    bind: {
      value: bindImpl,
    },
  })
}
