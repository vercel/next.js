/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  findPort,
  renderViaHTTP,
  launchApp,
  waitFor,
  killApp,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')

const runApp = async (dir) => {
  const port = await findPort()

  let stderr = ''
  const app = await launchApp(dir, port, {
    onStderr(err) {
      stderr += err
    },
  })

  await renderViaHTTP(port, '/post/1')
  await waitFor(1000)

  await killApp(app)

  await fs.remove(nextConfig)

  expect(stderr).not.toMatch(
    /Cannot read property 'serverRuntimeConfig' of undefined/i
  )
}

describe('should work with runtime-config in next.config.js', () => {
  test('empty runtime-config', async () => {
    await fs.writeFile(
      nextConfig,
      `
      module.exports = {
      }
    `
    )

    await runApp(appDir)
  })

  test('with runtime-config', async () => {
    await fs.writeFile(
      nextConfig,
      `
      module.exports = {
        serverRuntimeConfig: {
          mySecret: '**********'
        },
        publicRuntimeConfig: {
          staticFolder: '/static'
        }
      }
    `
    )

    await runApp(appDir)
  })
})
