async function getActionsMappingByRuntime(next: any, runtime: 'node' | 'edge') {
  const manifest = JSON.parse(
    await next.readFile('.next/server/server-reference-manifest.json')
  )

  return manifest[runtime]
}

/* 
{ 
  [route path]: { [layer]: Set<workerId> ]
}
*/
type ActionsMappingOfRuntime = {
  [actionId: string]: {
    workers: {
      [route: string]: string
    }
    layer: {
      [route: string]: string
    }
  }
}
type ActionState = {
  [route: string]: {
    [layer: string]: number
  }
}

function getActionsRoutesState(
  actionsMappingOfRuntime: ActionsMappingOfRuntime
): ActionState {
  const state: ActionState = {}
  Object.keys(actionsMappingOfRuntime).forEach((actionId) => {
    const action = actionsMappingOfRuntime[actionId]
    const routePaths = Object.keys(action.workers)

    routePaths.forEach((routePath) => {
      if (!state[routePath]) {
        state[routePath] = {}
      }
      const layer = action.layer[routePath]

      if (!state[routePath][layer]) {
        state[routePath][layer] = 0
      }

      state[routePath][layer]++
    })
  })

  return state
}

export async function getActionsRoutesStateByRuntime(
  next: any,
  runtime: 'node' | 'edge'
) {
  const actionsMappingOfRuntime = await getActionsMappingByRuntime(
    next,
    runtime
  )
  return getActionsRoutesState(actionsMappingOfRuntime)
}
