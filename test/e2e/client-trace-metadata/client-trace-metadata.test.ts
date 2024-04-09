import { nextTestSetup } from 'e2e-utils'

describe('client-trace-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
  })

  it('Should inject propagation data from registered OpenTelemetry propagator into meta tags', async () => {
    const $ = await next.render$('/')
    const headHtml = $.html('head')
    expect(headHtml).toContain(
      '<meta name="_next-trace-data-my-test-key-1" content="my-test-value-1">'
    )
    expect($.html('head')).toContain(
      '<meta name="_next-trace-data-my-test-key-2" content="my-test-value-2">'
    )
  })
})
