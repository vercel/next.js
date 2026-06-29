import { nextTestSetup } from 'e2e-utils'

describe('dedupes-scripts', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('Does not have duplicate script references', async () => {
    const $ = await next.render$('/')
    let foundDuplicate = false
    const srcs = new Set()

    for (const script of $('script').toArray()) {
      const { src } = script.attribs
      if (!src || !src.startsWith('/_next/static')) continue
      if (srcs.has(src)) {
        console.error(`Found duplicate script ${src}`)
        foundDuplicate = true
      }
      srcs.add(src)
    }
    expect(foundDuplicate).toBe(false)
  })
})
