import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-render-error-log', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  it('should log the correct values on app-render error', async () => {
    const outputIndex = next.cliOutput.length
    await next.fetch('/')

    await retry(async () => {
      expect(await next.cliOutput.slice(outputIndex)).toMatch(/at Page/)
    })
    const cliOutput = next.cliOutput.slice(outputIndex)

    await retry(async () => {
      expect(await cliOutput).toMatch(/digest:/)
    })
    expect(cliOutput).toInclude('Error: boom')
    expect(cliOutput).toInclude('at fn2 (./app/fn.ts')
    expect(cliOutput).toMatch(/at (Module\.)?fn1 \(\.\/app\/fn\.ts/)
    expect(cliOutput).toInclude('at Page (./app/page.tsx')

    expect(cliOutput).not.toInclude('webpack-internal')
  })

  it('should log the correct values on app-render error with edge runtime', async () => {
    const outputIndex = next.cliOutput.length
    await next.fetch('/edge')

    await retry(async () => {
      expect(await next.cliOutput.slice(outputIndex)).toMatch(/at EdgePage/)
    })
    const cliOutput = next.cliOutput.slice(outputIndex)

    await retry(async () => {
      expect(await cliOutput).toMatch(/digest:/)
    })
    expect(cliOutput).toInclude('Error: boom')
    expect(cliOutput).toInclude('at fn2 (./app/fn.ts')
    expect(cliOutput).toMatch(/at (Module\.)?fn1 \(\.\/app\/fn\.ts/)
    expect(cliOutput).toInclude('at EdgePage (./app/edge/page.tsx')

    expect(cliOutput).not.toInclude('webpack-internal')
  })
})
