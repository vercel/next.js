import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import path from 'path'

describe('build-node-env-development', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: { NODE_ENV: 'development' },
  })

  it('should build in production mode and name NODE_ENV in a warning', async () => {
    const { exitCode, cliOutput } = await next.build()

    expect(cliOutput).toContain(
      `"NODE_ENV" is set to "development", but \`next build\` creates a production build by default. Using NODE_ENV=production for this build.`
    )
    // A mismatch between the inlined and the runtime NODE_ENV used to crash
    // prerendering the built-in global error page.
    expect(cliOutput).not.toContain("reading 'useContext'")
    expect(cliOutput).not.toContain('Error occurred prerendering page')
    expect(exitCode).toBe(0)

    const html = await fs.readFile(
      path.join(next.testDir, next.distDir, 'server/app/index.html'),
      'utf8'
    )
    expect(html).toContain('hello world')
  })

  it('should keep NODE_ENV=development with --debug-prerender', async () => {
    const { exitCode, cliOutput } = await next.build({
      args: ['--debug-prerender'],
    })

    expect(cliOutput).toContain(
      `Prerendering is running in debug mode with NODE_ENV='development'.`
    )
    expect(cliOutput).not.toContain('Using NODE_ENV=production for this build')
    expect(exitCode).toBe(0)
  })

  it('should not override NODE_ENV=test', async () => {
    next.env.NODE_ENV = 'test'
    try {
      const { exitCode, cliOutput } = await next.build()

      expect(cliOutput).not.toContain(
        'Using NODE_ENV=production for this build'
      )
      expect(exitCode).toBe(0)
    } finally {
      next.env.NODE_ENV = 'development'
    }
  })
})
