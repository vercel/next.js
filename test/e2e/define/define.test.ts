import { nextTestSetup } from 'e2e-utils'

describe('compiler.define', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('compiler.define', () => {
    let loadedText
    beforeEach(async () => {
      let browser = await next.browser('/')
      loadedText = await browser.elementByCss('body').text()
    })

    it('should render the magic variable on server side', async () => {
      expect(loadedText).toContain('Server value: foobar')
      expect(loadedText).toContain('Client value: foobar')
    })

    it('should render the magic variable on client side', async () => {
      expect(loadedText).toContain('Server value: foobar')
      expect(loadedText).toContain('Client value: foobar')
    })

    it('should render the magic expression on server side', async () => {
      expect(loadedText).toContain('Server expr: barbaz')
      expect(loadedText).toContain('Client expr: barbaz')
    })

    it('should render the magic expression on client side', async () => {
      expect(loadedText).toContain('Server expr: barbaz')
      expect(loadedText).toContain('Client expr: barbaz')
    })
  })

  describe('compiler.defineServer', () => {
    let loadedText
    beforeEach(async () => {
      let browser = await next.browser('/with-server-only')
      loadedText = await browser.elementByCss('body').text()
    })

    it('should render the inlined variable on server side', async () => {
      expect(loadedText).toContain('Server value: server')
    })

    it('should not render the inlined variable on client side', async () => {
      expect(loadedText).toContain('Client value: not set')
    })

    it('should render the inlined expression on server side', async () => {
      expect(loadedText).toContain('Server expr: serverbarbaz')
    })

    it('should not render the inlined expression on client side', async () => {
      expect(loadedText).toContain('Client expr: not set')
    })
  })
})
