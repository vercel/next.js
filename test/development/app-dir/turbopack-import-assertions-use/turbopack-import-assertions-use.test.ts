import { nextTestSetup } from 'e2e-utils'

describe('turbopack-import-assertions-use', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    // This test is Turbopack-only; turbopackUse is not supported in webpack
    skipDeployment: true,
  })

  if (!isTurbopack) {
    it('should skip for webpack', () => {})
    return
  }

  it('should apply raw loader via turbopackUse import assertion', async () => {
    const $ = await next.render$('/')
    expect($('#raw').text()).toBe('Hello from raw text file')
  })

  it('should apply replace loader with options via turbopackUse import assertion', async () => {
    const $ = await next.render$('/')
    expect($('#replaced').text()).toBe('Value is: turbopackUse works!')
  })

  it('should apply raw loader with turbopackModuleType ecmascript', async () => {
    const $ = await next.render$('/')
    expect($('#module-type').text()).toBe('Hello via module type')
  })

  it('should apply identity loader with turbopackModuleType json', async () => {
    const $ = await next.render$('/')
    expect($('#json-type').text()).toBe('Hello from JSON module type')
  })
})
