import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('skip dev overlay', () => {
  const { next } = nextTestSetup({
    env: { NEXT_PRIVATE_DISABLE_DEV_OVERLAY_UX: '1' },
    nextConfig: {
      logging: {
        browserToTerminal: true,
      },
    },
    files: {
      'app/layout.js': `
        export default function RootLayout({ children }) {
          return (
            <html>
              <body>{children}</body>
            </html>
          )
        }
      `,
      'app/runtime-error/page.js': `
        import RuntimeError from './runtime-error'

        export default function Page() {
          return <RuntimeError />
        }
      `,
      'app/runtime-error/runtime-error.js': `
        'use client'

        import { useEffect, useState } from 'react'

        export default function RuntimeError() {
          const [shouldThrow, setShouldThrow] = useState(false)

          useEffect(() => {
            setShouldThrow(true)
          }, [])

          if (shouldThrow) {
            throw new Error('runtime-skip-dev-overlay')
          }

          return <p>runtime pending</p>
        }
      `,
      'app/build-error/page.js': `
        import Message from './message'

        export default function Page() {
          return <Message />
        }
      `,
      'app/build-error/message.js': `
        'use client'

        export default function Message() {
          return <p id="build-status">build ok</p>
        }
      `,
    },
  })

  it('does not render the overlay for a runtime error but still reports recovery', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/runtime-error')

    await check(
      () => next.cliOutput.slice(outputIndex),
      /\[browser\][\s\S]*runtime-skip-dev-overlay/
    )

    expect(
      await browser.eval(`Boolean(document.querySelector('nextjs-portal'))`)
    ).toBe(false)

    await next.patchFile(
      'app/runtime-error/runtime-error.js',
      `
        'use client'

        export default function RuntimeError() {
          return <p id="runtime-status">runtime recovered</p>
        }
      `
    )

    expect(await browser.waitForElementByCss('#runtime-status').text()).toBe(
      'runtime recovered'
    )

    await check(
      () => next.cliOutput.slice(outputIndex),
      /Fast Refresh had to perform a full reload due to a runtime error/
    )

    expect(
      await browser.eval(`Boolean(document.querySelector('nextjs-portal'))`)
    ).toBe(false)
  })

  it('does not render the overlay for an HMR build error and recovers', async () => {
    const browser = await next.browser('/build-error')
    expect(await browser.elementByCss('#build-status').text()).toBe('build ok')

    const outputIndex = next.cliOutput.length
    await next.patchFile(
      'app/build-error/message.js',
      `
        'use client'

        import missing from 'next-missing-dev-overlay-module'

        export default function Message() {
          return <p>{missing}</p>
        }
      `
    )

    await check(
      () => next.cliOutput.slice(outputIndex),
      /\[browser\][\s\S]*next-missing-dev-overlay-module/
    )

    expect(
      await browser.eval(`Boolean(document.querySelector('nextjs-portal'))`)
    ).toBe(false)

    await next.patchFile(
      'app/build-error/message.js',
      `
        'use client'

        export default function Message() {
          return <p id="build-status">build recovered</p>
        }
      `
    )

    expect(await browser.waitForElementByCss('#build-status').text()).toBe(
      'build recovered'
    )

    expect(
      await browser.eval(`Boolean(document.querySelector('nextjs-portal'))`)
    ).toBe(false)
  })
})
