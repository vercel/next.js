// @ts-ignore avoid ts errors during manual testing
import { type NextInstance } from 'e2e-utils'

async function getActionsMappingByRuntime(
  next: NextInstance,
  runtime: 'node' | 'edge'
) {
  const manifest = JSON.parse(
    await next.readFile('.next/server/server-reference-manifest.json')
  )

  return manifest[runtime]
}

export function markLayoutAsEdge(next: NextInstance) {
  beforeAll(async () => {
    await next.stop()
    const layoutContent = await next.readFile('app/layout.js')
    await next.patchFile(
      'app/layout.js',
      layoutContent + `\nexport const runtime = 'edge'`
    )
    await next.start()
  })
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

export async function getActionsRoutesStateByRuntime(next: NextInstance) {
  const actionsMappingOfRuntime = await getActionsMappingByRuntime(
    next,
    process.env.TEST_EDGE ? 'edge' : 'node'
  )
  return getActionsRoutesState(actionsMappingOfRuntime)
}
