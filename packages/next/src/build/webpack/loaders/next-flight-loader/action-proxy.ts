export default function createActionProxy(action: any, originalAction: any) {
  action.bind = function (_: any, ...boundArgs: any[]) {
    const newAction = async function (...args: any[]) {
      if (originalAction) {
        return originalAction(newAction.$$bound.concat(args))
      } else {
        // In this case we're calling the user-defined action directly.
        return action(...newAction.$$bound, ...args)
      }
    }

    for (const key of Object.keys(action)) {
      if (key.startsWith('$$')) {
        // @ts-ignore
        newAction[key] = action[key]
      }
    }

    // Rebind args
    newAction.$$bound = (action.$$bound || []).concat(boundArgs)

    return newAction
  }
}
