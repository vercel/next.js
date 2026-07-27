import { nextTestSetup } from 'e2e-utils'

describe('app dir - layout params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('basic params', () => {
    it('check layout without params get no params', async () => {
      const $ = await next.render$('/base/something/another')
      const ids = ['#root-layout', '#lvl1-layout']
      ids.forEach((divId) => {
        const params = $(`${divId} > div`)
        expect(params.length).toBe(0)
      })
    })

    it("check layout renders just it's params", async () => {
      const $ = await next.render$('/base/something/another')

      expect($('#lvl2-layout > div').length).toBe(1)
      expect($('#lvl2-param1').text()).toBe('"something"')
    })

    it('check topmost layout renders all params', async () => {
      const $ = await next.render$('/base/something/another')

      expect($('#lvl3-layout > div').length).toBe(2)
      expect($('#lvl3-param1').text()).toBe('"something"')
      expect($('#lvl3-param2').text()).toBe('"another"')
    })
  })

  describe('catchall params', () => {
    it('should give catchall params just to last layout', async () => {
      const $ = await next.render$('/catchall/something/another')

      expect($(`#root-layout > div`).length).toBe(0)
      expect($('#lvl2-layout > div').length).toBe(1)
      expect($('#lvl2-params').text()).toBe('["something","another"]')
    })

    it('should give optional catchall params just to last layout', async () => {
      const $ = await next.render$('/optional-catchall/something/another')

      expect($(`#root-layout > div`).length).toBe(0)

      expect($('#lvl2-layout > div').length).toBe(1)
      expect($('#lvl2-params').text()).toBe('["something","another"]')
    })

    it("should give empty optional catchall params won't give params to any layout", async () => {
      const $ = await next.render$('/optional-catchall')

      expect($(`#root-layout > div`).length).toBe(0)
      expect($('#lvl2-layout > div').length).toBe(0)
    })
  })
})
