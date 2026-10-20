import { nextTestSetup } from 'e2e-utils'

// React owner stacks are a development-only diagnostic.
// @force-gate dev
describe('dynamic rendering validation owner stacks', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each([
    ['Node RSC', '/', 'nodejs', 'rsc', 'ServerComponentOwner'],
    ['Node SSR', '/', 'nodejs', 'ssr', 'ClientComponentOwner'],
    ['Edge RSC', '/edge', 'edge-runtime', 'rsc', 'ServerComponentOwner'],
    ['Edge SSR', '/edge', 'edge-runtime', 'ssr', 'ClientComponentOwner'],
  ])(
    'uses the React owner stack during %s',
    async (_, pathname, runtime, kind, owner) => {
      // Read server HTML without hydration, so browser React cannot supply
      // the owner stack or replace the server-rendered diagnostic.
      const $ = await next.render$(pathname)
      expect($(`#${kind}-runtime`).text()).toBe(runtime)
      const stack = $(`#${kind}-stack`)
        .text()
        .split('\n')
        .filter((line) => line.startsWith('    at '))
        // Locations vary between bundlers, operating systems, and runtimes.
        .map((line) => line.replace(/ \(.*\)$/, ''))
      expect(stack).toEqual([`    at ${owner}`, '    at Page'])
    }
  )
})
