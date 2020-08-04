/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import {
  findPort,
  renderViaHTTP,
  launchApp,
  waitFor,
  killApp,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')

const runApp = async (config) => {
  const port = await findPort()

  let stderr = ''
  const app = await launchApp(appDir, port, {
    onStderr(err) {
      stderr += err
    },
  })

  const html = await renderViaHTTP(port, '/post/1')
  const $ = cheerio.load(html)
  await waitFor(1000)

  await killApp(app)
  await fs.remove(nextConfig)

  expect(stderr).not.toMatch(
    /Cannot read property 'serverRuntimeConfig' of undefined/i
  )
  expect(JSON.parse($('#server-runtime-config').text())).toEqual(
    config.serverRuntimeConfig || {}
  )
  expect(JSON.parse($('#public-runtime-config').text())).toEqual(
    config.publicRuntimeConfig || {}
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

    await runApp({})
  })

  test('with runtime-config', async () => {
    const config = {
      serverRuntimeConfig: {
        mySecret: '**********',
      },
      publicRuntimeConfig: {
        staticFolder: '/static',
      },
    }

    await fs.writeFile(
      nextConfig,
      `
      module.exports = ${JSON.stringify(config)}
    `
    )

    await runApp(config)
  })
})
