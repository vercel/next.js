import { createNext } from 'e2e-utils'
import execa from 'execa'
import { NextInstance } from 'test/lib/next-modes/base'

describe('ES Check default output', () => {
  let next: NextInstance

  afterEach(() => next.destroy())

  it('should pass for ES5', async () => {
    next = await createNext({
      files: { 'pages/index.js': 'export default function Page() {}' },
      dependencies: { 'es-check': '7.0.0' },
    })

    const res = await execa(
      'pnpm',
      ['es-check', 'es5', '.next/static/**/*.js'],
      { cwd: next.testDir }
    )

    expect(res.stdout).toBe(
      'info: ES-Check: there were no ES version matching errors!  🎉'
    )
  })

  it('should pass for ES5 with SWC minify', async () => {
    next = await createNext({
      files: { 'pages/index.js': 'export default function Page() {}' },
      dependencies: { 'es-check': '7.0.0' },
      nextConfig: { swcMinify: true },
    })

    const res = await execa(
      'pnpm',
      ['es-check', 'es5', '.next/static/**/*.js'],
      { cwd: next.testDir }
    )

    expect(res.stdout).toBe(
      'info: ES-Check: there were no ES version matching errors!  🎉'
    )
  })
})
