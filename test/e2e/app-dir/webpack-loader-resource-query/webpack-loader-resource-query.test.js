import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-resource-query', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  it('should pass query to loader', async () => {
    await next.render$('/')

    expect(next.cliOutput).toContain('resource query:  ?test=hi')
  })

  it('should apply loader based on resourceQuery', async () => {
    const $ = await next.render$('/')
    const text = $('#reversed').text()
    expect(text).toBe('dlroW olleH')
  })

  it('should apply loader based on resourceQuery regex', async () => {
    const $ = await next.render$('/')
    const text = $('#upper').text()
    expect(text).toBe('HELLO WORLD')
  })
})
