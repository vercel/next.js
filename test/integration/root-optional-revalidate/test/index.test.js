/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  killApp,
  findPort,
  File,
  nextBuild,
  nextStart,
  initNextServerScript,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))
let app
let appPort

const getProps = async (path, expected) => {
  const html = await renderViaHTTP(appPort, path)
  const $ = cheerio.load(html)
  return JSON.parse($('#props').text())
}

const runTests = (rawServerless = false) => {
  it('should render / correctly', async () => {
    const props = await getProps('/', { params: {} })
    expect(props.params).toEqual({})

    await waitFor(1000)
    await getProps('/')

    const newProps = await getProps('/', { params: {} })
    expect(newProps.params).toEqual({})
    expect(props.random).not.toBe(newProps.random)
  })

  if (rawServerless) {
    it('should render /index correctly', async () => {
      const props = await getProps('/index')
      expect(props.params).toEqual({})

      await waitFor(1000)
      await getProps('/index')

      const newProps = await getProps('/index')
      expect(newProps.params).toEqual({})
      expect(props.random).not.toBe(newProps.random)
    })
  }

  it('should render /a correctly', async () => {
    const props = await getProps('/a')
    expect(props.params).toEqual({ slug: ['a'] })

    await waitFor(1000)
    await getProps('/a')

    const newProps = await getProps('/a')
    expect(newProps.params).toEqual({ slug: ['a'] })
    expect(props.random).not.toBe(newProps.random)
  })

  it('should render /hello/world correctly', async () => {
    const props = await getProps('/hello/world')
    expect(props.params).toEqual({ slug: ['hello', 'world'] })

    await waitFor(1000)
    await getProps('/hello/world')

    const newProps = await getProps('/hello/world')
    expect(newProps.params).toEqual({ slug: ['hello', 'world'] })
    expect(props.random).not.toBe(newProps.random)
  })
}

describe('Root Optional Catch-all Revalidate', () => {
  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('raw serverless mode', () => {
    beforeAll(async () => {
      nextConfig.write(`
        module.exports = {
          target: 'experimental-serverless-trace'
        }
      `)
      await nextBuild(appDir)
      appPort = await findPort()

      app = await initNextServerScript(join(appDir, 'server.js'), /ready on/i, {
        ...process.env,
        PORT: appPort,
      })
    })
    afterAll(async () => {
      nextConfig.delete()
      await killApp(app)
    })

    runTests(true)
  })
})
