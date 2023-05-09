export default function createActionProxy(
  id: string,
  bound: null | any[],
  action: any,
  originalAction?: any
) {
  action.$$typeof = Symbol.for('react.server.reference')
  action.$$id = id
  action.$$bound = bound

  action.bind = function (_: any, ...boundArgs: any[]) {
    const newAction = async function (...args: any[]) {
      if (originalAction) {
        return originalAction(newAction.$$bound.concat(args))
      } else {
        // In this case we're calling the user-defined action directly.
        return action(...newAction.$$bound, ...args)
      }
    }

    for (const key of ['$$typeof', '$$id', '$$FORM_ACTION']) {
      // @ts-ignore
      newAction[key] = action[key]
    }
    // Rebind args
    newAction.$$bound = (action.$$bound || []).concat(boundArgs)

    return newAction
  }
}
