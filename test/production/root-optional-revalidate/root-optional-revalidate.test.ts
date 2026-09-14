import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('Root Optional Catch-all Revalidate', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

    const getProps = async (path: string) => {
      const html = await next.render(path)
      const $ = cheerio.load(html)
      return JSON.parse($('#props').text())
    }

    it('should render / correctly', async () => {
      const props = await getProps('/')
      expect(props.params).toEqual({})

      const outputIndex = next.cliOutput.length
      await waitFor(1000)
      await getProps('/')
      expect(next.cliOutput.slice(outputIndex)).toEqual(
        'getStaticProps({ revalidateReason: "stale" })\n'
      )

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

      const outputIndex = next.cliOutput.length
      await waitFor(1000)
      await getProps('/a')
      expect(next.cliOutput.slice(outputIndex)).toEqual(
        'getStaticProps({ revalidateReason: "stale" })\n'
      )

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

      const outputIndex = next.cliOutput.length
      await waitFor(1000)
      await getProps('/hello/world')
      expect(next.cliOutput.slice(outputIndex)).toEqual(
        'getStaticProps({ revalidateReason: "stale" })\n'
      )

      // Rendering takes time before the new cache entry is filled
      await retry(async () => {
        const newProps = await getProps('/hello/world')
        expect(newProps.params).toEqual({ slug: ['hello', 'world'] })
        expect(props.random).not.toBe(newProps.random)
      })
    })
  })
})
