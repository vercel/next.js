import type { ChildProcess } from 'child_process'
import { join } from 'path'
import cheerio from 'cheerio'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
  retry,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let app: ChildProcess | undefined
let appPort: number | undefined

const getProps = async (path) => {
  const html = await renderViaHTTP(appPort, path)
  const $ = cheerio.load(html)
  return JSON.parse($('#props').text())
}

const runTests = () => {
  it('should render / correctly', async () => {
    const props = await getProps('/')
    expect(props.params).toEqual({})

    let cliOutput = ''
    app.stdout.on('data', (chunk) => (cliOutput += chunk.toString()))
    await waitFor(1000)
    await getProps('/')
    expect(cliOutput).toEqual('getStaticProps({ revalidateReason: "stale" })\n')

    // Rendering takes time before the new cache entry is filled
    await retry(async () => {
      const newProps = await getProps('/')
      expect(newProps.params).toEqual({})
      expect(props.random).not.toBe(newProps.random)
    })
  })

  it('should render /a correctly', async () => {
    const props = await getProps('/a')
    expect(props.params).toEqual({ slug: ['a'] })

    let cliOutput = ''
    app.stdout.on('data', (chunk) => (cliOutput += chunk.toString()))
    await waitFor(1000)
    await getProps('/a')
    expect(cliOutput).toEqual('getStaticProps({ revalidateReason: "stale" })\n')

    // Rendering takes time before the new cache entry is filled
    await retry(async () => {
      const newProps = await getProps('/a')
      expect(newProps.params).toEqual({ slug: ['a'] })
      expect(props.random).not.toBe(newProps.random)
    })
  })

  it('should render /hello/world correctly', async () => {
    const props = await getProps('/hello/world')
    expect(props.params).toEqual({ slug: ['hello', 'world'] })

    let cliOutput = ''
    app.stdout.on('data', (chunk) => (cliOutput += chunk.toString()))
    await waitFor(1000)
    await getProps('/hello/world')
    expect(cliOutput).toEqual('getStaticProps({ revalidateReason: "stale" })\n')

    // Rendering takes time before the new cache entry is filled
    await retry(async () => {
      const newProps = await getProps('/hello/world')
      expect(newProps.params).toEqual({ slug: ['hello', 'world'] })
      expect(props.random).not.toBe(newProps.random)
    })
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
