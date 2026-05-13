import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Babel custom - babel-env', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/babel-env'),
    skipStart: true,
  })

  it('should allow setting babelrc env', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })
})

describe('Babel custom - targets-browsers', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/targets-browsers'),
    skipStart: true,
  })

  it('should allow setting targets.browsers', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })
})

describe('Babel custom - targets-string', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/targets-string'),
    skipStart: true,
  })

  it('should allow setting targets to a string', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })
})

describe('Babel custom - babel-json5', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/babel-json5'),
    skipStart: true,
  })

  it('should allow babelrc JSON5 syntax', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })
})
