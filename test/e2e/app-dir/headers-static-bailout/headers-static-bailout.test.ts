import { nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'

describe('headers-static-bailout', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    dependencies: {
      nanoid: '4.0.1',
    },
  })

  if (!isNextStart) {
    it('should skip', () => {})
    return
  }

  it('should bailout when using an import from next/headers', async () => {
    const url = '/page-with-headers'
    const $ = await next.render$(url)
    expect($('h1').text()).toBe('Dynamic Page')

    // Check if the page is not statically generated.
    const id = $('#nanoid').text()
    const $2 = await next.render$(url)
    const id2 = $2('#nanoid').text()
    expect(id).not.toBe(id2)
  })

  it('should not bailout when not using headers', async () => {
    const url = '/page-without-headers'

    const $ = await next.render$(url)
    expect($('h1').text()).toBe('Static Page')

    // Check if the page is not statically generated.
    const id = $('#nanoid').text()
    const $2 = await next.render$(url)
    const id2 = $2('#nanoid').text()
    expect(id).toBe(id2)
  })

  it('it provides a helpful link in case static generation bailout is uncaught', async () => {
    await next.stop()
    await next.patchFile(
      'app/server-components-page/page.tsx',
      outdent`
        import { cookies } from 'next/headers'

        export default async function Page() {
          setTimeout(() => {
            cookies().then(c => c.getAll())
          }, 0)
          return <div>Hello World</div>
        }
        `
    )
    const { cliOutput } = await next.build()
    expect(cliOutput).toContain(
      'https://nextjs.org/docs/messages/dynamic-server-error'
    )
  })
})
