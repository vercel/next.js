export default function createActionProxy(
  id: string,
  bound: null | any[],
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

  action.$$typeof = Symbol.for('react.server.reference')
  action.$$id = id
  action.$$bound = bound
  action.bind = bindImpl.bind(action)
}
