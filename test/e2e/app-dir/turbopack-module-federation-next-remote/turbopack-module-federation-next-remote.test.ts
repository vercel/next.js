import { symlink } from 'fs/promises'
import { join } from 'path'
import execa from 'execa'
import type { ChildProcess } from 'child_process'
import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextStart,
  retry,
} from 'next-test-utils'

const isTurbopack = !process.env.IS_WEBPACK_TEST && !process.env.NEXT_RSPACK
// This test launches a second local Next.js server, which deployed fixtures cannot reach.
const describeTurbopack =
  isTurbopack && !isNextDeploy ? describe : describe.skip

describeTurbopack('turbopack module federation between Next.js apps', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // A second local Next.js server is not reachable from a deployed fixture.
    skipDeployment: true,
  })
  let remoteServer: ChildProcess

  beforeAll(async () => {
    const remotePort = await findPort()
    const remoteDir = join(next.testDir, 'remote')
    await symlink(
      join(next.testDir, 'node_modules'),
      join(remoteDir, 'node_modules')
    )
    if (isNextDev) {
      remoteServer = await launchApp(remoteDir, remotePort)
    } else {
      await execa(
        'node',
        [join(next.testDir, 'node_modules/next/dist/bin/next'), 'build'],
        {
          cwd: remoteDir,
          env: {
            ...process.env,
            NEXT_TEST_MODE: undefined,
            // packages/next/types/global.d.ts narrows NODE_ENV, but the child must inherit none.
            NODE_ENV: undefined as NodeJS.ProcessEnv['NODE_ENV'],
            __NEXT_SHOW_IGNORE_LISTED: 'true',
          },
        }
      )
      remoteServer = await nextStart(remoteDir, remotePort, {
        disableAutoSkewProtection: true,
      })
    }
    const response = await fetchViaHTTP(remotePort, '/')
    if (response.status !== 200) {
      throw new Error(`Remote server returned status ${response.status}`)
    }

    process.env.MF_REMOTE_URL = `http://localhost:${remotePort}/_next/static/chunks/nextRemote.js`
    await next.start()
  })

  afterAll(async () => {
    await killApp(remoteServer)
    delete process.env.MF_REMOTE_URL
  })

  it('loads a module exposed by another Next.js app', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Next.js'
      )
    }, 15_000)
  })
})
