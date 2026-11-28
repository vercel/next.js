import { nextTestSetup } from 'e2e-utils'

describe('turbopack-import-assertions-use', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
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

  it('should apply identity with loader rules', async () => {
    const $ = await next.render$('/')
    expect($('#json-type-2').text()).toBe('Hello from JSON module type 2')
  })

  describe('without turbopackLoader', () => {
    it('should override the built-in image handling with turbopackModuleType raw', async () => {
      const $ = await next.render$('/svg')
      expect($('#raw-svg').text()).toContain('data-marker="raw-svg-marker"')
    })

    it('should override the built-in image handling with turbopackModuleType text', async () => {
      const $ = await next.render$('/svg')
      expect($('#text-svg').text()).toContain('data-marker="raw-svg-marker"')
    })

    it('should keep the built-in image handling for imports without the attribute', async () => {
      const $ = await next.render$('/svg')
      expect(JSON.parse($('#image-svg').text())).toMatchObject({
        src: expect.stringContaining('.svg'),
        width: 24,
        height: 24,
      })
    })

    it('should apply turbopackModuleType raw to a file without a built-in rule', async () => {
      const $ = await next.render$('/txt')
      expect($('#raw-txt').text()).toBe(
        'Hello from a txt file without a loader\n'
      )
    })

    it('should apply turbopackAs', async () => {
      const $ = await next.render$('/as-only')
      expect($('#as-only').text()).toBe(
        'Hello from turbopackAs without a loader'
      )
    })

    it('should apply turbopackModuleType after turbopackAs', async () => {
      const $ = await next.render$('/as-and-type')
      expect($('#as-and-type').text()).toBe(
        'Hello from turbopackAs and turbopackModuleType'
      )
    })

    it('should keep a CSS module a CSS module with turbopackAs *.css', async () => {
      const $ = await next.render$('/as-css-module')
      expect($('#as-css-module').text()).toBe('string')
    })
  })
})
