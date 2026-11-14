import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-input-source-map', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('passes the previous rule source map to the next loader', async () => {
    const $ = await next.render$('/')
    expect(JSON.parse($('#split').text())).toEqual({
      source: 'fixture.split.js',
      line: 2,
      column: 1,
      content: "export default 'INPUT_MAP'",
    })
  })

  it('preserves source maps within a single loader chain', async () => {
    const $ = await next.render$('/')
    expect(JSON.parse($('#chain').text())).toEqual({
      source: 'fixture.chain.js',
      line: 2,
      column: 1,
      content: "export default 'INPUT_MAP'",
    })
  })

  it('does not invent a source map for an untransformed file', async () => {
    const $ = await next.render$('/')
    expect(JSON.parse($('#plain').text())).toBeNull()
  })
})
