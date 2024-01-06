import { createNextDescribe } from 'e2e-utils'
import { check, waitFor } from 'next-test-utils'
import path from 'path'

createNextDescribe(
  'multi-zone',
  {
    files: path.join(__dirname, 'app'),
    skipDeployment: true,
    buildCommand: 'pnpm build',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    packageJson: {
      scripts: {
        'post-build': 'echo done',
      },
    },
  },
  ({ next, isNextDev }) => {
    it.each([
      { pathname: '/first', content: ['hello from first app'] },
      { pathname: '/second', content: ['hello from second app'] },
      {
        pathname: '/first/blog/post-1',
        content: ['hello from first app /blog/[slug]'],
      },
      {
        pathname: '/second/blog/post-1',
        content: ['hello from second app /blog/[slug]'],
      },
      {
        pathname: '/second/another/post-1',
        content: ['hello from second app /another/[slug]'],
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
        const browser = await next.browser(`/${app}`)
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
        await runHMRTest('first')
        await runHMRTest('second')
      })
    }
  }
)
