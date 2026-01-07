/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '..')

let appPort
let app
const fileNames = ['1', '2.ext', '3.html']

describe('GS(S)P with file extension', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))
        const { code } = await nextBuild(appDir)
        if (code !== 0) throw new Error(`build failed with code ${code}`)

        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      it('should support slug with different extensions', async () => {
        const baseDir = join(appDir, '.next/server/pages')
        fileNames.forEach((name) => {
          const filePath = join(baseDir, name)
          expect(fs.existsSync(filePath + '.html')).toBe(true)
          expect(fs.existsSync(filePath + '.json')).toBe(true)
        })
      })

      it('should render properly for routes with extension', async () => {
        const paths = fileNames.map((name) => `/${name}`)
        const contentPromises = paths.map((path) =>
          renderViaHTTP(appPort, path)
        )
        const contents = await Promise.all(contentPromises)
        contents.forEach((content, i) =>
          expect(content).toContain(fileNames[i])
        )
      })

      it('should contain extension in name of json files in _next/data', async () => {
        const buildId = await fs.readFile(
          join(appDir, '.next/BUILD_ID'),
          'utf8'
        )
        const requests = fileNames.map((name) => {
          const pathname = `/_next/data/${buildId}/${name}.json`
          return fetchViaHTTP(appPort, pathname).then((r) => r.json())
        })
        const results = await Promise.all(requests)
        results.forEach((result, i) =>
          expect(result.pageProps.value).toBe(fileNames[i])
        )
      })
    }
  )
})
