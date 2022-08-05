import { createNext } from 'e2e-utils'
import { NextConfig } from 'packages/next'
import { NextInstance } from 'test/lib/next-modes/base'

describe('ES Check default output', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': 'export default function Page() { return "hello" }',
      },
      dependencies: { 'es-check': '7.0.0' },
      packageJson: {
        scripts: {
          build: 'next build && es-check es5 .next/static/**/*.js',
        },
      },
      buildCommand: 'yarn build',
    })
  })
  afterAll(() => next.destroy())

  it('should pass for ES5', async () => {
    expect(next.cliOutput).toContain(
      'info: ES-Check: there were no ES version matching errors!  🎉'
    )
  })

  it('should pass for ES5 with SWC minify', async () => {
    await next.stop()
    await next.deleteFile('.next')
    await next.patchFile(
      'next.config.js',
      `
      module.exports = ${JSON.stringify({ swcMinify: true } as NextConfig)}
    `
    )
    await next.start()

    expect(next.cliOutput).toContain(
      'info: ES-Check: there were no ES version matching errors!  🎉'
    )
  })
})
