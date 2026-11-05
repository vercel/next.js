import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { gate } from 'next-test-utils'

describe('Babel custom - babel-env', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/babel-env'),
    skipStart: true,
  })

  it('should allow setting babelrc env', async () => {
    const { exitCode, cliOutput } = await next.build()
    if (await gate((c) => c.futureCompat && !c.turbopack)) {
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain("code: 'DEP0111'")
      expect(cliOutput).toContain(
        'DeprecationWarning: process.binding() is deprecated. Please use public APIs instead.'
      )
      return
    }
    expect(exitCode).toBe(0)
  })
})

describe('Babel custom - targets-browsers', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/targets-browsers'),
    skipStart: true,
  })

  it('should allow setting targets.browsers', async () => {
    const { exitCode, cliOutput } = await next.build()
    if (await gate((c) => c.futureCompat && !c.turbopack)) {
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain("code: 'DEP0111'")
      expect(cliOutput).toContain(
        'DeprecationWarning: process.binding() is deprecated. Please use public APIs instead.'
      )
      return
    }
    expect(exitCode).toBe(0)
  })
})

describe('Babel custom - targets-string', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/targets-string'),
    skipStart: true,
  })

  it('should allow setting targets to a string', async () => {
    const { exitCode, cliOutput } = await next.build()
    if (await gate((c) => c.futureCompat && !c.turbopack)) {
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain("code: 'DEP0111'")
      expect(cliOutput).toContain(
        'DeprecationWarning: process.binding() is deprecated. Please use public APIs instead.'
      )
      return
    }
    expect(exitCode).toBe(0)
  })
})

describe('Babel custom - babel-json5', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/babel-json5'),
    skipStart: true,
  })

  it('should allow babelrc JSON5 syntax', async () => {
    const { exitCode, cliOutput } = await next.build()
    if (await gate((c) => c.futureCompat && !c.turbopack)) {
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain("code: 'DEP0111'")
      expect(cliOutput).toContain(
        'DeprecationWarning: process.binding() is deprecated. Please use public APIs instead.'
      )
      return
    }
    expect(exitCode).toBe(0)
  })
})
