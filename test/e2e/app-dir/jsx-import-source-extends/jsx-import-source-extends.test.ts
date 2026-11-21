import { nextTestSetup } from 'e2e-utils'

describe('jsx-import-source-extends', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // `jsxImportSource` is only set in tsconfig.base.json, which tsconfig.json
  // extends. The custom runtime marks the host elements it creates.
  it('uses the jsxImportSource inherited from an extended tsconfig', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
    expect($('p').attr('data-custom-jsx')).toBe('')
  })
})
