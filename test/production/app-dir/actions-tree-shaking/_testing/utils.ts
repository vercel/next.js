import { nextTestSetup, type NextInstance } from 'e2e-utils'

// This is from 'next/dist/build/webpack/plugins/flight-client-entry-plugin', but unfortunately
// Typescript breaks when importing it directly.
type Actions = {
  [actionId: string]: {
    exportedName?: string
    filename?: string
    workers: {
      [name: string]: {
        moduleId: string | number
        async: boolean
      }
    }
  }
}

async function getActionsMappingByRuntime(
  next: NextInstance,
  runtime: 'node' | 'edge'
): Promise<Actions> {
  const manifest = JSON.parse(
    await next.readFile('.next/server/server-reference-manifest.json')
  )

  return manifest[runtime]
}

export function nextTestSetupActionTreeShaking(opts) {
  let result = nextTestSetup({
    ...opts,
    skipStart: !!process.env.TEST_EDGE,
  })

  if (process.env.TEST_EDGE) {
    beforeAll(async () => {
      const layoutContent = await result.next.readFile('app/layout.js')
      await result.next.patchFile(
        'app/layout.js',
        layoutContent + `\nexport const runtime = 'edge'`
      )
      await result.next.start()
    })
  }

  return result
}

type ActionState = {
  [route: string]: string[]
}

function getActionsRoutesState(actionsMappingOfRuntime: Actions): ActionState {
  const state: ActionState = {}
  for (const actionId in actionsMappingOfRuntime) {
    const action = actionsMappingOfRuntime[actionId]
    for (const routePath in action.workers) {
      if (!state[routePath]) {
        state[routePath] = []
      }

      // Normalize when NEXT_SKIP_ISOLATE=1
      const filename = action.filename.startsWith('test/tmp/next-test-')
        ? action.filename.slice(
            action.filename.indexOf('/', 'test/tmp/next-test-'.length) + 1
          )
        : action.filename
      state[routePath].push(`${filename}#${action.exportedName}`)
    }
  }

  for (const page of Object.values(state)) {
    page.sort()
  }

  return state
}

export async function getActionsRoutesStateByRuntime(next: NextInstance) {
  const actionsMappingOfRuntime = await getActionsMappingByRuntime(
    next,
    process.env.TEST_EDGE ? 'edge' : 'node'
  )
  return getActionsRoutesState(actionsMappingOfRuntime)
}
