import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'

describe('Error overlay - error message urls', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  it('should be possible to click url in build error', async () => {
    await using sandbox = await createSandbox(next)
    const { session, browser } = sandbox

    const content = await next.readFile('app/page.js')

    await session.patch(
      'app/page.js',
      content + '\nexport function getServerSideProps() {}'
    )

    await session.assertHasRedbox()

    const link = await browser.elementByCss(
      '[data-nextjs-terminal] a, [data-nextjs-codeframe] a'
    )
    const text = await link.text()
    const href = await link.getAttribute('href')
    expect(text).toEqual(
      'https://nextjs.org/docs/app/building-your-application/data-fetching'
    )
    expect(href).toEqual(
      'https://nextjs.org/docs/app/building-your-application/data-fetching'
    )
  })

  it('should be possible to click url in runtime error', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            export default function Page() {
              return typeof window === 'undefined' ? 'HELLO' : 'WORLD'
            }
          `,
        ],
      ])
    )
    const { session, browser } = sandbox
    await session.openRedbox()

    const link = await browser.elementByCss('#nextjs__container_errors__link a')
    const text = await link.text()
    const href = await link.getAttribute('href')
    expect(text).toEqual(
      'https://nextjs.org/docs/messages/react-hydration-error'
    )
    expect(href).toEqual(
      'https://nextjs.org/docs/messages/react-hydration-error'
    )
  })
})
