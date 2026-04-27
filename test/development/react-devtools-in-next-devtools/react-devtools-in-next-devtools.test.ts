import { readdir } from 'fs/promises'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('react-devtools-in-next-devtools', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function getReactDevToolsChunkFiles() {
    const distDir = join(
      process.cwd(),
      'packages/next/dist/compiled/next-react-devtools'
    )

    return (await readdir(distDir)).filter(
      (file) => file.endsWith('.js') && file !== 'frontend.js'
    )
  }

  async function readReactDevToolsInfo(browser: any) {
    return browser.eval(() => {
      const frame = document.querySelector(
        'iframe[data-nextjs-react-devtools-frame]'
      ) as HTMLIFrameElement | null
      const iframeDocument = frame?.contentDocument ?? null
      const searchInput = iframeDocument?.querySelector(
        'input[placeholder="Search (text or /regex/)"]'
      ) as HTMLInputElement | null
      const frameText = iframeDocument?.body?.textContent ?? ''

      return {
        hasFrame: !!frame,
        right: frame ? getComputedStyle(frame).right : null,
        halfWidth: frame
          ? Math.abs(
              frame.getBoundingClientRect().width - window.innerWidth / 2
            ) < 2
          : false,
        fullHeight: frame
          ? Math.abs(
              frame.getBoundingClientRect().height - window.innerHeight
            ) < 2
          : false,
        hasSearchInput: !!searchInput,
        searchInputBoxSizing: searchInput
          ? getComputedStyle(searchInput).boxSizing
          : null,
        frameText,
        isLoadingElementTree: frameText.includes('Loading React Element Tree'),
      }
    })
  }

  async function expectReactDevToolsVisible(
    browser: any,
    expectedComponentPattern: RegExp
  ) {
    await retry(async () => {
      const info = await readReactDevToolsInfo(browser)

      expect(info.hasFrame).toBe(true)
      expect(info.right).toBe('0px')
      expect(info.halfWidth).toBe(true)
      expect(info.fullHeight).toBe(true)
      expect(info.hasSearchInput).toBe(true)
      expect(info.searchInputBoxSizing).toBe('border-box')
      expect(info.isLoadingElementTree).toBe(false)
      expect(info.frameText).toEqual(
        expect.stringMatching(expectedComponentPattern)
      )
    })
  }

  it('shows React DevTools on the App Router route', async () => {
    const browser = await next.browser('/app-route')

    await retry(async () => {
      expect(await browser.elementByCss('#app-ready').text()).toBe('app ready')
    })

    await expectReactDevToolsVisible(browser, /AppRoutePage/)
  })

  it('shows React DevTools on the Pages Router route', async () => {
    const browser = await next.browser('/pages-route')

    expect(await browser.elementByCss('#pages-ready').text()).toBe(
      'pages ready'
    )

    await expectReactDevToolsVisible(browser, /PagesRoutePage|PagesRouteMarker/)
  })

  it('serves lazy React DevTools chunks', async () => {
    const frontendRes = await next.fetch('/__nextjs_react_devtools/frontend.js')

    expect(frontendRes.status).toBe(200)
    expect(frontendRes.headers.get('content-type')).toContain(
      'application/javascript'
    )
    expect((await frontendRes.text()).length).toBeGreaterThan(0)

    const chunkFiles = await getReactDevToolsChunkFiles()

    expect(chunkFiles.length).toBeGreaterThan(0)

    for (const chunkFile of chunkFiles) {
      const res = await next.fetch(`/__nextjs_react_devtools/${chunkFile}`)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain(
        'application/javascript'
      )
      expect((await res.text()).length).toBeGreaterThan(0)
    }
  })
})
