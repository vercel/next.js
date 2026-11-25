import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import path from 'path'

const errorText = (value: string) =>
  `"NODE_ENV" is set to "${value}", but \`next build\` creates a production build.`

describe('build-node-env-development', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: { NODE_ENV: 'development' },
  })

  async function expectNoPrerenderedOutput() {
    expect(
      await fs.pathExists(
        path.join(next.testDir, next.distDir, 'server/app/index.html')
      )
    ).toBe(false)
  }

  async function buildWithNodeEnv(value: string) {
    next.env.NODE_ENV = value
    try {
      await fs.remove(path.join(next.testDir, next.distDir))
      return await next.build()
    } finally {
      next.env.NODE_ENV = 'development'
    }
  }

  it('should fail before compiling when NODE_ENV=development', async () => {
    const { exitCode, cliOutput } = await buildWithNodeEnv('development')

    expect(cliOutput).toContain(errorText('development'))
    expect(cliOutput).toContain(
      'https://nextjs.org/docs/messages/non-standard-node-env'
    )
    // The mismatch between the inlined and the runtime NODE_ENV used to crash
    // prerendering the built-in global error page.
    expect(cliOutput).not.toContain("reading 'useContext'")
    expect(cliOutput).not.toContain('Error occurred prerendering page')
    expect(cliOutput).not.toContain('Build error occurred')
    expect(exitCode).not.toBe(0)
    await expectNoPrerenderedOutput()
  })

  it('should fail before compiling with a non-standard NODE_ENV', async () => {
    const { exitCode, cliOutput } = await buildWithNodeEnv('abc')

    expect(cliOutput).toContain(errorText('abc'))
    expect(cliOutput).not.toContain('Build error occurred')
    expect(exitCode).not.toBe(0)
    await expectNoPrerenderedOutput()
  })

  it('should allow NODE_ENV=development with --debug-prerender', async () => {
    await fs.remove(path.join(next.testDir, next.distDir))
    const { exitCode, cliOutput } = await next.build({
      args: ['--debug-prerender'],
    })

    expect(cliOutput).toContain(
      `Prerendering is running in debug mode with NODE_ENV='development'.`
    )
    expect(cliOutput).not.toContain(errorText('development'))
    expect(exitCode).toBe(0)
  })

  it('should allow NODE_ENV=test', async () => {
    const { exitCode, cliOutput } = await buildWithNodeEnv('test')

    expect(cliOutput).not.toContain(errorText('test'))
    expect(exitCode).toBe(0)
    const html = await fs.readFile(
      path.join(next.testDir, next.distDir, 'server/app/index.html'),
      'utf8'
    )
    expect(html).toContain('hello world')
  })
})
