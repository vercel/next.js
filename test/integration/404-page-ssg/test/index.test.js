/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  renderViaHTTP,
  fetchViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const gip404Err =
  /`pages\/404` can not have getInitialProps\/getServerSideProps/

let stdout
let stderr
let buildId
let appPort
let app

const runTests = (isDev) => {
  it('should respond to 404 correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/404')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('custom 404 page')
  })

  it('should render error correctly', async () => {
    const text = await renderViaHTTP(appPort, '/err')
    expect(text).toContain(isDev ? 'oops' : 'Internal Server Error')
  })

  it('should not show an error in the logs for 404 SSG', async () => {
    await renderViaHTTP(appPort, '/non-existent')
    expect(stderr).not.toMatch(gip404Err)
    expect(stdout).not.toMatch(gip404Err)
  })

  it('should render index page normal', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('hello from index')
  })

  if (!isDev) {
    it('should not revalidate custom 404 page', async () => {
      const res1 = await renderViaHTTP(appPort, '/non-existent')
      const res2 = await renderViaHTTP(appPort, '/non-existent')
      const res3 = await renderViaHTTP(appPort, '/non-existent')
      const res4 = await renderViaHTTP(appPort, '/non-existent')

      expect(res1 === res2 && res2 === res3 && res3 === res4).toBe(true)

      expect(res1).toContain('custom 404 page')
    })

    it('should set pages404 in routes-manifest correctly', async () => {
      const data = await fs.readJSON(join(appDir, '.next/routes-manifest.json'))
      expect(data.pages404).toBe(true)
    })

    it('should have 404 page in prerender-manifest', async () => {
      const data = await fs.readJSON(
        join(appDir, '.next/prerender-manifest.json')
      )
      expect(data.routes['/404']).toEqual({
        allowHeader: [
          'host',
          'x-matched-path',
          'x-prerender-revalidate',
          'x-prerender-revalidate-if-generated',
          'x-next-revalidated-tags',
          'x-next-revalidate-tag-token',
        ],
        initialRevalidateSeconds: false,
        srcRoute: null,
        dataRoute: `/_next/data/${buildId}/404.json`,
      })
    })
  }
}

describe('404 Page Support SSG', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      afterAll(() => killApp(app))

      it('should build successfully', async () => {
        const {
          code,
          stderr: buildStderr,
          stdout: buildStdout,
        } = await nextBuild(appDir, [], {
          stderr: true,
          stdout: true,
        })

        expect(code).toBe(0)
        expect(buildStderr).not.toMatch(gip404Err)
        expect(buildStdout).not.toMatch(gip404Err)

        appPort = await findPort()
        stderr = ''
        stdout = ''

        app = await nextStart(appDir, appPort, {
          onStdout(msg) {
            stdout += msg
          },
          onStderr(msg) {
            stderr += msg
          },
        })
        buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
      })

      runTests()
    }
  )
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        stderr = ''
        stdout = ''
        app = await launchApp(appDir, appPort, {
          onStdout(msg) {
            stdout += msg
          },
          onStderr(msg) {
            stderr += msg
          },
        })
      })
      afterAll(() => killApp(app))

      runTests(true)
    }
  )
})
