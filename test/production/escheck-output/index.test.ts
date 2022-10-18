import { createNext } from 'e2e-utils'
import { NextConfig } from 'packages/next'
import { NextInstance } from 'test/lib/next-modes/base'

describe('ES Check .next output', () => {
  let next: NextInstance
  afterEach(() => next.destroy())

  it('should emit ES2020 with default', async () => {
    next = await createNext({
      files: {
        'pages/index.js': 'export default function Page() { return "hi" }',
      },
      dependencies: { 'es-check': '7.0.1' },
      packageJson: {
        scripts: {
          build: 'next build && es-check es2020 .next/static/**/*.js',
        },
      },
      buildCommand: 'yarn build',
    })
    expect(next.cliOutput).toContain(
      'info: ES-Check: there were no ES version matching errors!  🎉'
    )
  })

  it('should emit ES5 with legacyBrowsers: true', async () => {
    const nextConfig: NextConfig = {
      experimental: {
        legacyBrowsers: true,
      },
    }
    next = await createNext({
      files: {
        'pages/index.js': 'export default function Page() { return "hi" }',
        'next.config.js': `module.exports = ${JSON.stringify(nextConfig)}`,
      },
      dependencies: { 'es-check': '7.0.1' },
      packageJson: {
        scripts: {
          build: 'next build && es-check es5 .next/static/**/*.js',
        },
      },
      buildCommand: 'yarn build',
    })

    expect(next.cliOutput).toContain(
      'info: ES-Check: there were no ES version matching errors!  🎉'
    )
  })
})
