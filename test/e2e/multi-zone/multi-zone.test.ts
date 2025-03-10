import { nextTestSetup } from 'e2e-utils'
import { check, waitFor } from 'next-test-utils'
import path from 'path'

describe('multi-zone', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'app'),
    skipDeployment: true,
    buildCommand: 'pnpm build',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    serverReadyPattern: /Next mode: (production|development)/,
    packageJson: {
      scripts: {
        dev: 'node server.js',
        build: 'next build apps/host && next build apps/guest',
        start: 'NODE_ENV=production node server.js',
        'post-build': 'echo done',
      },
    },
    dependencies: require('./app/package.json').dependencies,
  })

  if (skipped) {
    return
  }

  it.each([
    { pathname: '/', content: ['hello from host app'] },
    { pathname: '/guest', content: ['hello from guest app'] },
    {
      pathname: '/blog/post-1',
      content: ['hello from host app /blog/[slug]'],
    },
    {
      pathname: '/guest/blog/post-1',
      content: ['hello from guest app /blog/[slug]'],
    },
    {
      pathname: '/guest/another/post-1',
      content: ['hello from guest app /another/[slug]'],
    },
  ])(
    'should correctly respond for $pathname',
    async ({ pathname, content }) => {
      const res = await next.fetch(pathname, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)

      const html = await res.text()

      for (const item of content) {
        expect(html).toContain(item)
      }
    }
  )

  if (isNextDev) {
    async function runHMRTest(app: string) {
      const isHostApp = app === 'host'
      const browser = await next.browser(isHostApp ? '/' : app)
      expect(await browser.elementByCss('body').text()).toContain(
        `hello from ${app} app`
      )
      const initialTimestamp = await browser.elementById('now').text()

      expect(await browser.elementByCss('body').text()).not.toContain(
        'hmr content'
      )

      await waitFor(1000)

      // verify that the page isn't unexpectedly reloading in the background
      const newTimestamp = await browser.elementById('now').text()
      expect(newTimestamp).toBe(initialTimestamp)

      // trigger HMR
      const filePath = `apps/${app}/pages/index.tsx`
      const content = await next.readFile(filePath)

      const patchedContent = content.replace(
        `const editedContent = ''`,
        `const editedContent = 'hmr content'`
      )
      await next.patchFile(filePath, patchedContent)

      await check(() => browser.elementByCss('body').text(), /hmr content/)

      // restore original content
      await next.patchFile(filePath, content)
    }

    it('should support HMR in both apps', async () => {
      await runHMRTest('host')
      await runHMRTest('guest')
    })
  }
})
