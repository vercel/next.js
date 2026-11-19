import path from 'path'
import { instant } from '@next/playwright'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { launchStandaloneSession } from './test-utils'

describe('MCP navigation inspection', () => {
  const { next } = nextTestSetup({
    files: new FileRef(
      path.join(
        __dirname,
        '../../e2e/app-dir/instant-navigation-testing-api/fixtures/default'
      )
    ),
  })

  async function inspect(
    action: 'status' | 'arm' | 'release',
    pageId?: string
  ) {
    const response = await next.fetch('/_next/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'inspect_navigation', arguments: { action, pageId } },
      }),
    })
    const data = (await response.text())
      .split('\n')
      .find((line) => line.startsWith('data: '))!
    const { result } = JSON.parse(data.slice(6))
    if (result.isError) throw new Error(result.content[0].text)
    return JSON.parse(result.content[0].text)
  }

  it('reports the same lock used by the Playwright helper', async () => {
    const browser = await launchStandaloneSession(next.url, '/')
    try {
      const id = await retry(async () => {
        const { pages } = await inspect('status')
        expect(pages).toHaveLength(1)
        return pages[0].pageId
      })
      await instant(browser.page, async () => {
        expect(await inspect('status', id)).toMatchObject({ state: 'armed' })
      })
      expect(await inspect('status', id)).toMatchObject({ state: 'idle' })
    } finally {
      await browser.close()
    }
  })

  it('pauses the selected browser, releases the shell and rediscovers a reloaded page', async () => {
    expect(await inspect('status')).toEqual({ pages: [] })
    const first = await launchStandaloneSession(next.url, '/')
    try {
      const second = await launchStandaloneSession(next.url, '/target-page')
      try {
        await retry(async () =>
          expect((await inspect('status')).pages).toHaveLength(2)
        )
        const { pages } = await inspect('status')
        const id = pages.find((p: { url: string }) => p.url === '/').pageId
        const otherId = pages.find(
          (p: { url: string }) => p.url === '/target-page'
        ).pageId
        await expect(inspect('arm')).rejects.toThrow('choose a pageId')
        expect(await inspect('arm', id)).toMatchObject({ state: 'armed' })
        expect(await inspect('status', otherId)).toMatchObject({
          state: 'idle',
        })

        const page = first.page
        const documents: string[] = []
        page.on('request', (req) => {
          if (req.isNavigationRequest() && req.frame() === page.mainFrame())
            documents.push(req.url())
        })
        await page.locator('#link-to-target').click()
        await page.waitForURL('**/target-page')
        await page.getByTestId('loading-shell').waitFor()
        await retry(async () =>
          expect(await inspect('status', id)).toMatchObject({
            state: 'client-navigation',
            url: '/target-page',
          })
        )
        expect(await page.getByTestId('dynamic-content').isVisible()).toBe(
          false
        )
        await inspect('release', id)
        await page.getByTestId('dynamic-content').waitFor()
        expect(documents).toHaveLength(0)

        await inspect('arm', id)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByTestId('loading-shell').waitFor()
        const reloadedId = await retry(async () => {
          const current = (await inspect('status')).pages.find(
            (p: { state: string }) => p.state === 'page-load'
          )
          expect(current).toBeDefined()
          return current.pageId
        })
        expect(reloadedId).not.toBe(id)
        await expect(inspect('release', id)).rejects.toThrow(
          'no longer connected'
        )
        // Before hydration, the router intentionally falls back to a full reload.
        await page.waitForFunction(
          () => '__NEXT_HYDRATED' in window && window.__NEXT_HYDRATED === true
        )
        await inspect('release', reloadedId)
        await page.getByTestId('dynamic-content').waitFor()
        expect(documents).toHaveLength(1)
      } finally {
        await second.close()
      }
    } finally {
      await first.close()
    }
  })
})
