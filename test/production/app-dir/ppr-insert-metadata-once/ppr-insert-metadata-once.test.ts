import { nextTestSetup } from 'e2e-utils'

function countSubstring(str: string, substr: string) {
  return str.split(substr).length - 1
}

describe('ppr-insert-metadata-once', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only has one description meta inserted', async () => {
    const $ = await next.render$('/')
    expect($('head meta[name="description"]').length).toBe(1)
    
    const html = $.html()
    // check if description only existed once in the whole html including the html tag and flight data
    expect(countSubstring(html, 'this-is-description')).toBe(1)

    const browser = await next.browser('/')
    expect(
      (await browser.elementsByCss('head meta[name="description"]')).length
    ).toBe(1)

    // TODO assert browser html only contain once
    // 
  })
})
