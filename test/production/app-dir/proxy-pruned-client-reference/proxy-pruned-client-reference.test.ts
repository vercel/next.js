import { nextTestSetup } from 'e2e-utils'

describe('pruned client-reference proxy', () => {
  const { next } = nextTestSetup({ files: __dirname })

  // The barrel also exports a client function. Expanding that export creates an RSC proxy, but
  // neither route uses it, so its locals module has no module ID in the chunk graph.
  it('builds when a dynamic barrel import only uses a server export', async () => {
    const page = await next.render$('/')
    expect(page('main').text()).toBe('bar')

    const notFound = await next.render$('/missing')
    expect(notFound('main').text()).toBe('bar not found')
  })
})
