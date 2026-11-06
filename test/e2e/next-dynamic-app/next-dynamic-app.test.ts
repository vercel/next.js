import { nextTestSetup } from 'e2e-utils'

describe('next/dynamic contained in /_app', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each(['/', '/slug'])(
    'should only reference emitted chunks on %s',
    async (pathname) => {
      const $ = await next.render$(pathname)
      expect($('#list').text()).toBe('next/dynamic contained in /_app')

      const chunks = new Set(
        $('link[rel="preload"][as="script"], script[src]')
          .toArray()
          .map((el) => el.attribs.href ?? el.attribs.src)
      )
      for (const chunk of chunks) {
        const { status } = await next.fetch(chunk)
        expect({ chunk, status }).toEqual({ chunk, status: 200 })
      }
    }
  )
})
