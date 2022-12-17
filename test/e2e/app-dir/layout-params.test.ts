import path from 'path'
import { renderViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import cheerio from 'cheerio'

describe('app dir - layout params', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './layout-params')),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        typescript: 'latest',
        '@types/react': 'latest',
        '@types/node': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  describe('basic params', () => {
    it('check layout without params get no params', async () => {
      const html = await renderViaHTTP(next.url, '/base/something/another')

      const $ = cheerio.load(html)

      const ids = ['#root-layout', '#lvl1-layout']
      ids.forEach((divId) => {
        const params = $(`${divId} > div`)
        expect(params.length).toBe(0)
      })
    })

    it("check layout renders just it's params", async () => {
      const html = await renderViaHTTP(next.url, '/base/something/another')

      const $ = cheerio.load(html)

      expect($('#lvl2-layout > div').length).toBe(1)
      expect($('#lvl2-param1').text()).toBe('"something"')
    })

    it('check topmost layout renders all params', async () => {
      const html = await renderViaHTTP(next.url, '/base/something/another')

      const $ = cheerio.load(html)

      expect($('#lvl3-layout > div').length).toBe(2)
      expect($('#lvl3-param1').text()).toBe('"something"')
      expect($('#lvl3-param2').text()).toBe('"another"')
    })
  })

  describe('catchall params', () => {
    it('should give catchall params just to last layout', async () => {
      const html = await renderViaHTTP(next.url, '/catchall/something/another')

      const $ = cheerio.load(html)

      expect($(`#root-layout > div`).length).toBe(0)

      expect($('#lvl2-layout > div').length).toBe(1)
      expect($('#lvl2-params').text()).toBe('["something","another"]')
    })

    it('should give optional catchall params just to last layout', async () => {
      const html = await renderViaHTTP(
        next.url,
        '/optional-catchall/something/another'
      )

      const $ = cheerio.load(html)

      expect($(`#root-layout > div`).length).toBe(0)

      expect($('#lvl2-layout > div').length).toBe(1)
      expect($('#lvl2-params').text()).toBe('["something","another"]')
    })

    it("should give empty optional catchall params won't give params to any layout", async () => {
      const html = await renderViaHTTP(next.url, '/optional-catchall')

      const $ = cheerio.load(html)

      expect($(`#root-layout > div`).length).toBe(0)
      expect($('#lvl2-layout > div').length).toBe(0)
    })
  })
})
