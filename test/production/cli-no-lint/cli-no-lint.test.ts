import { nextTestSetup } from 'e2e-utils'

describe('next build --no-lint', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('does not list the removed option in build help', async () => {
    const { code, stdout } = await next.runCommand(['build', '--help'])

    expect(code).toBe(0)
    expect(stdout).toMatch(/Creates an optimized production build/)
    expect(stdout).not.toContain('--no-lint')
  })

  it.each([
    { args: ['--no-lint'] },
    { args: ['.', '--no-lint'] },
    { args: ['--no-lint', '.'] },
  ])('explains the removal for $args', async ({ args }) => {
    const { code, stdout, stderr } = await next.runCommand(['build', ...args])

    expect(code).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).toContain('--no-lint option has been removed')
    expect(stderr).toContain('next build no longer runs linting')
    expect(stderr).toContain('Remove --no-lint from your build command')
    expect(stderr).toContain('run ESLint or Biome directly')
    expect(stderr).toContain(
      'https://nextjs.org/docs/app/guides/upgrading/version-16#next-lint-command'
    )
  })

  it('preserves the error for other unknown options', async () => {
    const { code, stderr } = await next.runCommand(['build', '--random'])

    expect(code).toBe(1)
    expect(stderr).toBe("error: unknown option '--random'\n")
  })
})
