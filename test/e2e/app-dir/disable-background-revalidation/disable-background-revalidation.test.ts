import {isNextStart, nextTestSetup} from 'e2e-utils'

import {findPort, retry} from 'next-test-utils'
import http from 'http'


describe('disable-background-revalidation', () => {
  if(isNextStart){
    const {next} = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      skipStart: true,
    })
  
    let externalServerPort: number
    let externalServer: http.Server
  
    beforeAll(async () => {
      externalServerPort = await findPort()
      externalServer = http.createServer((_req, res) => {
        res.end(`${Date.now()}`)
      })
  
      await new Promise<void>((resolve, reject) => {
        externalServer.listen(externalServerPort, () => {
          resolve()
        })
  
        externalServer.once('error', (err) => {
          reject(err)
        })
      })
  
      await next.patchFileFast(
        'next.config.js',
        `module.exports = {
          env: { TEST_SERVER_PORT: "${externalServerPort}" },
          experimental: { disableBackgroundRevalidation: true },
        }`
      )
  
      await next.build()
      await next.start()
    })
  
    afterAll(() => externalServer.close())
  
    const executeISRRevalidationRequest = async (url: string) => {
      const json = await next.readJSON('.next/prerender-manifest.json')
      const previewModeId = json.preview.previewModeId
      const response = await next.fetch(url, {
        method: 'HEAD',
        headers: {
          'x-prerender-revalidate': previewModeId,
          'x-next-isr': '1'
        }
      })
      return response
    }
    
    it('should disable background revalidation', async () => {
      const browser = await next.browser('/')
      const randomNumber = await browser.elementById('data').text()
      await browser.refresh()
  
      await retry(async () => {
        const randomNumber2 = await browser.elementById('data').text()
        expect(randomNumber2).toEqual(randomNumber)
        await browser.refresh()
      })
    })
  
    it('should revalidate on ISR revalidation request', async () => {
      const browser = await next.browser('/')
      const randomNumber = await browser.elementById('data').text()
      await browser.refresh()
      const randomNumber2 = await browser.elementById('data').text()
      expect(randomNumber2).toEqual(randomNumber)
  
      await executeISRRevalidationRequest('/')
  
      await browser.refresh()
      const randomNumber3 = await browser.elementById('data').text()
      expect(randomNumber3).not.toEqual(randomNumber2)
  
    })
  
    it('should use cache for fetch and ISR revalidation', async () => {
      const browser = await next.browser('/fetch')
      const time = await browser.elementById('data').text()
      const rand = await browser.elementById('rand').text()
      await browser.refresh()
      const time2 = await browser.elementById('data').text()
      const rand2 = await browser.elementById('rand').text()
      expect(time2).toEqual(time)
      expect(rand2).toEqual(rand)
  
      await executeISRRevalidationRequest('/fetch')
  
      await browser.refresh()
      const time3 = await browser.elementById('data').text()
      const rand3 = await browser.elementById('rand').text()
      expect(time3).toEqual(time)
      expect(rand3).not.toEqual(rand)
  
    })
  
    it('should use cache for unstable_cache', async () => {
  
      const browser = await next.browser('/unstable_cache')
      const time = await browser.elementById('data').text()
      const rand = await browser.elementById('rand').text()
      await browser.refresh()
      const time2 = await browser.elementById('data').text()
      const rand2 = await browser.elementById('rand').text()
      expect(time2).toEqual(time)
      expect(rand2).toEqual(rand)
  
      await executeISRRevalidationRequest('/unstable_cache')
  
      await browser.refresh()
      const time3 = await browser.elementById('data').text()
      const rand3 = await browser.elementById('rand').text()
      expect(time3).toEqual(time)
      expect(rand3).not.toEqual(rand)
    })
    return
  }
  it('should skip other scenarios', () => {})
  
})
  