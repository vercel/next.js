/* eslint-env jest */

import { join } from 'path'
import { createServer } from 'http'
import {
  fetchViaHTTP,
  nextBuild,
  findPort,
  nextStart,
  launchApp,
  killApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')

let appPort
let app
let mockServer

describe('node-fetch-keep-alive', () => {
  describe('dev', () => {
    beforeAll(async () => {
      mockServer = createServer((req, res) => {
        // we can test request headers by sending them
        // back with the response
        const { connection } = req.headers
        res.end(JSON.stringify({ connection }))
      })
      mockServer.listen(44001)
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      mockServer.close()
    })

    runTests()
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        mockServer = createServer((req, res) => {
          // we can test request headers by sending them
          // back with the response
          const { connection } = req.headers
          res.end(JSON.stringify({ connection }))
        })
        mockServer.listen(44001)
        const { stdout, stderr } = await nextBuild(appDir, [], {
          stdout: true,
          stderr: true,
        })
        if (stdout) console.log(stdout)
        if (stderr) console.error(stderr)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
        mockServer.close()
      })

      runTests()
    }
  )

  function runTests() {
    it('should send keep-alive for json API', async () => {
      const res = await fetchViaHTTP(appPort, '/api/json')
      const obj = await res.json()
      expect(obj).toEqual({ connection: 'keep-alive' })
    })

    it('should send keep-alive for getStaticProps', async () => {
      const browser = await webdriver(appPort, '/ssg')
      const props = await browser.elementById('props').text()
      const obj = JSON.parse(props)
      expect(obj).toEqual({ connection: 'keep-alive' })
      await browser.close()
    })

    it('should send keep-alive for getStaticPaths', async () => {
      const browser = await webdriver(appPort, '/blog/first')
      const props = await browser.elementById('props').text()
      const obj = JSON.parse(props)
      expect(obj).toEqual({ slug: 'first' })
      await browser.close()
    })

    it('should send keep-alive for getServerSideProps', async () => {
      const browser = await webdriver(appPort, '/ssr')
      const props = await browser.elementById('props').text()
      const obj = JSON.parse(props)
      expect(obj).toEqual({ connection: 'keep-alive' })
      await browser.close()
    })
  }
})
