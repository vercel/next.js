/* eslint-env jest */
/* global jasmine */
import path from 'path'
import fs from 'fs-extra'
import {
  runNextCommand,
  launchApp,
  findPort,
  killApp,
  waitFor,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = path.join(__dirname, '..')
const pagesDir = path.join(appDir, 'pages')
const testsDir = path.join(pagesDir, '__tests__')
const generatedDir = path.join(pagesDir, '__generated__')

describe('Telemetry CLI', () => {
  it('can print telemetry status', async () => {
    const { stdout } = await runNextCommand(['telemetry'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Status: .*/)
  })

  it('can enable telemetry with flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', '--enable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can disable telemetry with flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', '--disable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Your preference has been saved/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('can enable telemetry without flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'enable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can re-enable telemetry', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'enable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can disable telemetry without flag', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'disable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/Your preference has been saved/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('can re-disable telemetry', async () => {
    const { stdout } = await runNextCommand(['telemetry', 'disable'], {
      stdout: true,
    })
    expect(stdout).toMatch(/already disabled/)
    expect(stdout).toMatch(/Status: Disabled/)
  })

  it('detects isSrcDir dir correctly for `next build`', async () => {
    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    expect(stderr).toMatch(/isSrcDir.*?false/)

    await fs.move(path.join(appDir, 'pages'), path.join(appDir, 'src/pages'))
    const { stderr: stderr2 } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })
    await fs.move(path.join(appDir, 'src/pages'), path.join(appDir, 'pages'))

    expect(stderr2).toMatch(/isSrcDir.*?true/)
  })

  it('detects isSrcDir dir correctly for `next dev`', async () => {
    let port = await findPort()
    let stderr = ''

    const handleStderr = msg => {
      stderr += msg
    }
    let app = await launchApp(appDir, port, {
      onStderr: handleStderr,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })
    await waitFor(1000)
    await killApp(app)
    expect(stderr).toMatch(/isSrcDir.*?false/)

    await fs.move(path.join(appDir, 'pages'), path.join(appDir, 'src/pages'))
    stderr = ''

    port = await findPort()
    app = await launchApp(appDir, port, {
      onStderr: handleStderr,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })
    await waitFor(1000)
    await killApp(app)
    await fs.move(path.join(appDir, 'src/pages'), path.join(appDir, 'pages'))

    expect(stderr).toMatch(/isSrcDir.*?true/)
  })

  it('detects test files', async () => {
    const testDir = path.join(pagesDir, 'test')

    await fs.ensureDir(testDir)
    await fs.writeFile(
      path.join(testDir, 'index.test.js'),
      `export default () => null`
    )

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(testDir)

    const buildId = await fs.readFile(
      path.join(appDir, '.next/BUILD_ID'),
      'utf8'
    )
    // Remove the generated test file or tests will break at a second run
    await fs.remove(path.join(appDir, '.next/static', buildId))

    expect(stderr).toMatch(/hasInvalidPages.*?true/)
  })

  it('detects tests in __tests__', async () => {
    await fs.ensureDir(testsDir)
    await fs.writeFile(
      path.join(testsDir, 'index.js'),
      `export default () => null`
    )

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(testsDir)

    expect(stderr).toMatch(/hasInvalidPages.*?true/)
  })

  it('detects __generated__', async () => {
    await fs.ensureDir(generatedDir)
    await fs.writeFile(
      path.join(generatedDir, 'query.graphql.js'),
      `export default () => null`
    )

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(generatedDir)

    expect(stderr).toMatch(/hasInvalidPages.*?true/)
  })

  it('detects TypeScript', async () => {
    const file = path.join(pagesDir, 'about.tsx')

    await fs.writeFile(file, `export default () => null`)

    const { stderr } = await runNextCommand(['build', appDir], {
      stderr: true,
      env: {
        NEXT_TELEMETRY_DEBUG: 1,
      },
    })

    await fs.remove(file)
    await fs.remove(path.join(appDir, 'tsconfig.json'))

    expect(stderr).toMatch(/hasTypescript.*?true/)
  })
})
