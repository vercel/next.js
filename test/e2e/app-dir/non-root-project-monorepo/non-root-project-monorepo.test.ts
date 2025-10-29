import { nextTestSetup, FileRef } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxCallStack,
  getRedboxSource,
} from 'next-test-utils'
import * as path from 'path'

describe('non-root-project-monorepo', () => {
  const { next, skipped, isTurbopack, isNextDev } = nextTestSetup({
    files: {
      apps: new FileRef(path.resolve(__dirname, 'apps')),
      packages: new FileRef(path.resolve(__dirname, 'packages')),
      'pnpm-workspace.yaml': `packages:
      - 'apps/*'
      - 'packages/*'
      `,
    },
    packageJson: require('./package.json'),
    buildCommand: 'pnpm build',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    installCommand: 'pnpm i',
    skipDeployment: true,
  })
  const isRspack = !!process.env.NEXT_RSPACK

  if (skipped) {
    return
  }

  describe('monorepo-package', () => {
    it('should work during RSC', async () => {
      const $ = await next.render$('/monorepo-package-rsc')
      expect($('p').text()).toBe('Hello Typescript')
    })

    it('should work during SSR', async () => {
      const $ = await next.render$('/monorepo-package-ssr')
      expect($('p').text()).toBe('Hello Typescript')
    })

    it('should work on client-side', async () => {
      const browser = await next.browser('/monorepo-package-ssr')
      expect(await browser.elementByCss('p').text()).toBe('Hello Typescript')
      await assertNoRedbox(browser)
      expect(await browser.elementByCss('p').text()).toBe('Hello Typescript')
      await browser.close()
    })
  })

  describe('import.meta.url', () => {
    it('should work during RSC', async () => {
      const $ = await next.render$('/import-meta-url-rsc')
      expect($('p').text()).toMatch(
        /^file:\/\/.*\/next-install-[^/]+\/apps\/web\/app\/import-meta-url-rsc\/page.tsx$/
      )
    })

    it('should work during SSR', async () => {
      const $ = await next.render$('/import-meta-url-ssr')
      expect($('p').text()).toMatch(
        /^file:\/\/.*\/next-install-[^/]+\/apps\/web\/app\/import-meta-url-ssr\/page.tsx$/
      )
    })

    it('should work on client-side', async () => {
      const browser = await next.browser('/import-meta-url-ssr')
      await assertNoRedbox(browser)
      if (isTurbopack) {
        // Turbopack intentionally doesn't expose the full path to the browser bundles
        expect(await browser.elementByCss('p').text()).toBe(
          'file:///ROOT/apps/web/app/import-meta-url-ssr/page.tsx'
        )
      } else {
        expect(await browser.elementByCss('p').text()).toMatch(
          /^file:\/\/.*\/next-install-[^/]+\/apps\/web\/app\/import-meta-url-ssr\/page.tsx$/
        )
      }
      await browser.close()
    })
  })

  if (isNextDev) {
    describe('source-maps', () => {
      it('should work on RSC', async () => {
        const browser = await next.browser('/source-maps-rsc')
        await assertHasRedbox(browser)

        if (isTurbopack) {
          // TODO the function name should be hidden
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "app/separate-file.ts (1:7) @ module evaluation

           > 1 | throw new Error('Expected error')
               |       ^
             2 |"
          `)
          expect(await getRedboxCallStack(browser)).toMatchInlineSnapshot(`
           [
             "module evaluation app/separate-file.ts (1:7)",
             "innerArrowFunction app/source-maps-rsc/page.tsx (13:28)",
             "innerFunction app/source-maps-rsc/page.tsx (10:3)",
             "Page app/source-maps-rsc/page.tsx (4:5)",
           ]
          `)
        } else if (isRspack) {
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "app/separate-file.ts (1:11) @ eval

           > 1 | throw new Error('Expected error')
               |           ^
             2 |"
          `)
          expect(await getRedboxCallStack(browser)).toMatchInlineSnapshot(`
           [
             "eval app/separate-file.ts (1:11)",
             "<FIXME-file-protocol>",
             "<FIXME-file-protocol>",
             "innerArrowFunction app/source-maps-rsc/page.tsx (14:3)",
             "innerFunction app/source-maps-rsc/page.tsx (10:3)",
             "Page app/source-maps-rsc/page.tsx (4:5)",
           ]
          `)
        } else {
          // TODO the function name is incorrect
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "app/separate-file.ts (1:11) @ eval

           > 1 | throw new Error('Expected error')
               |           ^
             2 |"
          `)
          // TODO(veil): webpack runtime code shouldn't be included in stack trace (see https://linear.app/vercel/issue/NDX-509)
          // TODO(veil): https://linear.app/vercel/issue/NDX-677
          expect(await getRedboxCallStack(browser)).toMatchInlineSnapshot(`
           [
             "eval app/separate-file.ts (1:11)",
             "<FIXME-file-protocol>",
             "innerArrowFunction app/source-maps-rsc/page.tsx (14:3)",
             "innerFunction app/source-maps-rsc/page.tsx (10:3)",
             "Page app/source-maps-rsc/page.tsx (4:5)",
           ]
          `)
        }
        await browser.close()
      })

      it('should work on SSR', async () => {
        const browser = await next.browser('/source-maps-ssr')
        await assertHasRedbox(browser)

        if (isTurbopack) {
          // TODO the function name should be hidden
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "app/separate-file.ts (1:7) @ module evaluation

           > 1 | throw new Error('Expected error')
               |       ^
             2 |"
          `)
          expect(await getRedboxCallStack(browser)).toMatchInlineSnapshot(`
           [
             "module evaluation app/separate-file.ts (1:7)",
             "innerArrowFunction app/source-maps-ssr/page.tsx (15:28)",
             "innerFunction app/source-maps-ssr/page.tsx (12:3)",
             "Page app/source-maps-ssr/page.tsx (6:5)",
           ]
          `)
        } else if (isRspack) {
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "app/separate-file.ts (1:7) @ eval

           > 1 | throw new Error('Expected error')
               |       ^
             2 |"
          `)
          expect(await getRedboxCallStack(browser)).toMatchInlineSnapshot(`
           [
             "eval app/separate-file.ts (1:7)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "innerArrowFunction app/source-maps-ssr/page.tsx (16:3)",
             "innerFunction app/source-maps-ssr/page.tsx (12:3)",
             "Page app/source-maps-ssr/page.tsx (6:5)",
           ]
          `)
        } else {
          // TODO the function name should be hidden
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
            "app/separate-file.ts (1:7) @ eval

            > 1 | throw new Error('Expected error')
                |       ^
              2 |"
          `)
          // TODO(veil): webpack runtime code shouldn't be included in stack trace (see https://linear.app/vercel/issue/NDX-509)
          expect(await getRedboxCallStack(browser)).toMatchInlineSnapshot(`
           [
             "eval app/separate-file.ts (1:7)",
             "<FIXME-next-dist-dir>",
             "innerArrowFunction app/source-maps-ssr/page.tsx (16:3)",
             "innerFunction app/source-maps-ssr/page.tsx (12:3)",
             "Page app/source-maps-ssr/page.tsx (6:5)",
           ]
          `)
        }
        await browser.close()
      })

      it('should work on client-side', async () => {
        const browser = await next.browser('/source-maps-client')
        await assertHasRedbox(browser)

        if (isTurbopack) {
          // TODO the function name should be hidden
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "app/separate-file.ts (1:7) @ module evaluation

           > 1 | throw new Error('Expected error')
               |       ^
             2 |"
          `)
          expect(await getRedboxCallStack(browser)).toMatchInlineSnapshot(`
           [
             "module evaluation app/separate-file.ts (1:7)",
             "innerArrowFunction app/source-maps-client/page.tsx (16:28)",
             "innerFunction app/source-maps-client/page.tsx (13:3)",
             "effectCallback app/source-maps-client/page.tsx (7:5)",
           ]
          `)
        } else if (isRspack) {
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "app/separate-file.ts (1:7) @ eval

           > 1 | throw new Error('Expected error')
               |       ^
             2 |"
          `)
          expect(await getRedboxCallStack(browser)).toMatchInlineSnapshot(`
           [
             "eval app/separate-file.ts (1:7)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "innerArrowFunction app/source-maps-client/page.tsx (17:3)",
             "innerFunction app/source-maps-client/page.tsx (13:3)",
             "effectCallback app/source-maps-client/page.tsx (7:5)",
           ]
          `)
        } else {
          // TODO the function name should be hidden
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
            "app/separate-file.ts (1:7) @ eval

            > 1 | throw new Error('Expected error')
                |       ^
              2 |"
          `)
          // TODO(veil): webpack runtime code shouldn't be included in stack trace (see https://linear.app/vercel/issue/NDX-509)
          expect(await getRedboxCallStack(browser)).toMatchInlineSnapshot(`
           [
             "eval app/separate-file.ts (1:7)",
             "<FIXME-next-dist-dir>",
             "innerArrowFunction app/source-maps-client/page.tsx (17:3)",
             "innerFunction app/source-maps-client/page.tsx (13:3)",
             "effectCallback app/source-maps-client/page.tsx (7:5)",
           ]
          `)
        }
        await browser.close()
      })
    })
  }
})
