import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'

// The Node.js environment setup replaces globals like `Date` and `Math.random`
// and installs the require hook. The pre-compiled server has its own copy of
// it, and every route module imports `setup-node-env.external` to make sure
// that the environment is set up. Together they must set it up only once.
describe('minimal-server-node-environment', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should set up the Node.js environment only once', async () => {
    await next.build()

    const { stdout } = await execa(process.execPath, ['minimal-server.js'], {
      cwd: next.testDir,
    })
    const result = JSON.parse(stdout.trim().split('\n').pop()!)

    expect({ status: result.status, body: result.body }).toEqual({
      status: 200,
      body: 'pong',
    })

    // Loading the server sets up the environment. If it stops replacing these
    // globals, the checks below would pass for the wrong reason.
    expect(result.replacedAtStartup).toEqual([
      'Date',
      'Math.random',
      'crypto.randomUUID',
      'console.error',
      'Module._resolveFilename',
      'Module.prototype.require',
    ])

    // The first request loads the route module. That must not replace the
    // globals again, and must not load a second copy of the setup.
    expect(result.replacedByRequest).toEqual([])
    expect(result.loadedSetupModules).toEqual([])
  })
})
