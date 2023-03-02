/* eslint-env jest */
import {
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))
let app
const runDev = async (config: any) => {
  await nextConfig.write(`module.exports = ${JSON.stringify(config)}`)
  let stderr = ''
  app = await launchApp(appDir, await findPort(), {
    onStderr(msg: string) {
      stderr += msg || ''
    },
  })
  return stderr
}

describe('config-output-export', () => {
  afterEach(async () => {
    await nextConfig.restore()
    await killApp(app).catch(() => {})
  })

  it('should error with i18n', async () => {
    const stderr = await runDev({
      output: 'export',
      i18n: {
        locales: ['en'],
        defaultLocale: 'en',
      },
    })
    expect(stderr).toContain(
      'Specified "i18n" cannot but used with "output: export".'
    )
  })

  it('should error with rewrites', async () => {
    const stderr = await runDev({
      output: 'export',
      rewrites: [{ source: '/from', destination: '/to' }],
    })
    expect(stderr).toContain(
      'Specified "rewrites" cannot but used with "output: export".'
    )
  })

  it('should error with redirects', async () => {
    const stderr = await runDev({
      output: 'export',
      redirects: [{ source: '/from', destination: '/to', permanent: true }],
    })
    expect(stderr).toContain(
      'Specified "redirects" cannot but used with "output: export".'
    )
  })

  it('should error with headers', async () => {
    const stderr = await runDev({
      output: 'export',
      headers: [
        {
          source: '/foo',
          headers: [{ key: 'x-foo', value: 'val' }],
        },
      ],
    })
    expect(stderr).toContain(
      'Specified "headers" cannot but used with "output: export".'
    )
  })
})
