import { isReact18, nextTestSetup, isNextDev } from 'e2e-utils'
import { join } from 'path'
import { retry } from 'next-test-utils'

function makeIndexPage(runtime: string) {
  return `import ReactDOM from 'react-dom'
import Image from 'next/image'

export default function Index() {
  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }
  console.log('__render__')
  return (
    <div>
      <p id="react-dom-version">{ReactDOM.version}</p>
      <Image
        id="priority-image"
        priority
        src="/noop.png"
        width={300}
        height={400}
      />
    </div>
  )
}

export const config = {
  runtime: ${JSON.stringify(runtime)}
}
`
}

describe('react-current-version', () => {
  describe('Basics', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(__dirname, 'app'),
    })

    it('should only render once in SSR', async () => {
      await next.render('/')
      expect([...next.cliOutput.matchAll(/__render__/g)].length).toBe(1)
    })

    it('no warnings for image related link props', async () => {
      await next.render('/')
      expect(next.cliOutput).not.toContain('Warning: Invalid DOM property')
      expect(next.cliOutput).not.toContain('Warning: React does not recognize')
    })

    it('hydrates correctly for normal page', async () => {
      const browser = await next.browser('/')
      expect(await browser.eval('window.didHydrate')).toBe(true)
      expect(await browser.elementById('react-dom-version').text()).toMatch(
        isReact18 ? /^18\./ : /^19\./
      )
    })

    it('useId() values should match on hydration', async () => {
      const $ = await next.render$('/use-id')
      const ssrId = $('#id').text()

      const browser = await next.browser('/use-id')
      const csrId = await browser.eval(
        'document.getElementById("id").innerText'
      )

      expect(ssrId).toEqual(csrId)
    })

    it('should contain dynamicIds in next data for dynamic imports', async () => {
      async function expectToContainPreload(page: string) {
        const $ = await next.render$(`/${page}`)
        const { dynamicIds } = JSON.parse($('#__NEXT_DATA__').html())

        if (isNextDev) {
          expect(
            dynamicIds.find((id: string) =>
              isTurbopack
                ? id.endsWith(
                    'components/foo.js [client] (ecmascript, next/dynamic entry)'
                  )
                : id === `pages/${page}.js -> ../components/foo`
            )
          ).toBeTruthy()
        } else {
          expect(dynamicIds.length).toBe(1)
        }
      }
      await expectToContainPreload('dynamic')
    })
  })

  function describeConcurrentMode(runtime: string) {
    describe(`Concurrent mode in the ${runtime} runtime`, () => {
      const { next } = nextTestSetup({
        files: join(__dirname, 'app'),
        overrideFiles: {
          'pages/index.js': makeIndexPage(runtime),
        },
      })

      it('flushes styled-jsx styles as the page renders', async () => {
        const html = await next.render('/use-flush-effect/styled-jsx')
        const stylesOccurrence = html.match(/color:(\s)*(?:blue|#00f)/g) || []
        expect(stylesOccurrence.length).toBe(1)

        const browser = await next.browser('/use-flush-effect/styled-jsx')
        await retry(async () => {
          const text = await browser
            .waitForElementByCss('style#__jsx-900f996af369fc74', {
              state: 'attached',
            })
            .text()
          expect(text).toMatch(/(?:blue|#00f)/)
        })
        await retry(async () => {
          const text = await browser
            .waitForElementByCss('style#__jsx-8b0811664c4e575e', {
              state: 'attached',
            })
            .text()
          expect(text).toMatch(/red/)
        })
      })

      describe('<RouteAnnouncer />', () => {
        it('should not have the initial route announced', async () => {
          const browser = await next.browser('/')
          const title = await browser
            .waitForElementByCss('#__next-route-announcer__', {
              state: 'attached',
            })
            .text()

          expect(title).toBe('')
        })
      })

      it('should not have invalid config warning', async () => {
        await next.render('/')
        expect(next.cliOutput).not.toContain('not exist in this version')
      })
    })
  }

  describeConcurrentMode('experimental-edge')
  describeConcurrentMode('nodejs')
})
