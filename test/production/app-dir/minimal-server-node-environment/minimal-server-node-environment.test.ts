import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'

// The Node.js environment setup replaces globals like `Date` and `Math.random`
// and installs the require hook. The pre-compiled server has its own copy of
// it, and every route module imports `setup-node-env.external` to make sure
// that the environment is set up. Together they must set it up only once,
// except for the part that depends on what the instrumentation hook did.
describe('minimal-server-node-environment', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let result: {
    status: number
    body: string
    replacedAtStartup: string[]
    replacedAgainByRequest: string[]
    loadedSetupModules: string[]
    pageStatus: number | string
    instrumentedLogCalls: Array<string | null>
  }

  beforeAll(async () => {
    await next.build()

    const { stdout } = await execa(process.execPath, ['minimal-server.js'], {
      cwd: next.testDir,
    })
    result = JSON.parse(stdout.trim().split('\n').pop()!)
  })

  it('should set up the Node.js environment only once', async () => {
    expect({ status: result.status, body: result.body }).toEqual({
      status: 200,
      body: 'pong',
    })

    // Loading the server sets up the environment. The checks below are about
    // the globals that it replaced. Without any, they would pass for the wrong
    // reason.
    expect(result.replacedAtStartup).not.toEqual([])

    // The first request loads the route module. That must not replace any of
    // them again, and must not load a second copy of the setup.
    expect(result.replacedAgainByRequest).toEqual([])
    expect(result.loadedSetupModules).toEqual([])
  })

  // The instrumentation hook runs after the server was loaded. A console
  // method that it replaces, here with one that reads the clock, must still
  // run outside of the render, where reading the clock is not tracked.
  it('should run a console method that the instrumentation hook replaced outside of the render', async () => {
    expect(result.pageStatus).toBe(200)

    // The route handler and the page both log.
    expect(result.instrumentedLogCalls.length).toBeGreaterThanOrEqual(2)
    expect(result.instrumentedLogCalls.filter((type) => type !== null)).toEqual(
      []
    )
  })
})
