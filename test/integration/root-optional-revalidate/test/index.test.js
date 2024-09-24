/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let app
let appPort

const getProps = async (path) => {
  const html = await renderViaHTTP(appPort, path)
  const $ = cheerio.load(html)
  return JSON.parse($('#props').text())
}

const runTests = () => {
  it('should render / correctly', async () => {
    const props = await getProps('/')
    expect(props.params).toEqual({})

    await waitFor(1000)
    await getProps('/')

    const newProps = await getProps('/')
    expect(newProps.params).toEqual({})
    expect(props.random).not.toBe(newProps.random)
  })

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
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
})
