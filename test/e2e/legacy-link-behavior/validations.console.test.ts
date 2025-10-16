import { isNextDev, nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('Validations for <Link legacyBehavior>', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDeploy) {
    return it('should skip deploy', () => {})
  }
  let previousOutputIndex

  beforeEach(() => {
    previousOutputIndex = next.cliOutput.length
  })

  function newConsoleOutput() {
    return next.cliOutput.slice(previousOutputIndex)
  }

  describe('When rendering from a Server Component', () => {
    describe('Rendering <Link> directly', () => {
      it('warns if the child is a synchronous server component', async () => {
        const browser = await next.browser(
          '/validations/rsc-that-renders-link/synchronous'
        )

        if (isNextDev) {
          await expect(browser).toDisplayCollapsedRedbox(`
           [
             {
               "description": "Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/validations/rsc-that-renders-link/synchronous/page.tsx (7:7) @ Page
           >  7 |       <Link href="/about" legacyBehavior>
                |       ^",
               "stack": [
                 "Page app/validations/rsc-that-renders-link/synchronous/page.tsx (7:7)",
               ],
             },
             {
               "description": "\`legacyBehavior\` is deprecated and will be removed in a future release. A codemod is available to upgrade your components:

           npx @next/codemod@latest new-link .

           Learn more: https://nextjs.org/docs/app/building-your-application/upgrading/codemods#remove-a-tags-from-link-components",
               "environmentLabel": null,
               "label": "Console Error",
               "source": "app/validations/rsc-that-renders-link/synchronous/page.tsx (7:7) @ Page
           >  7 |       <Link href="/about" legacyBehavior>
                |       ^",
               "stack": [
                 "Page app/validations/rsc-that-renders-link/synchronous/page.tsx (7:7)",
               ],
             },
           ]
          `)
        } else {
          expect(newConsoleOutput()).toMatchInlineSnapshot(`
           "Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.
           "
          `)
        }
      })

      it('warns and throws an error if the child is an asynchronous server component', async () => {
        const browser = await next.browser(
          '/validations/rsc-that-renders-link/asynchronous'
        )

        if (isNextDev) {
          await expect(browser).toDisplayRedbox(`
           [
             {
               "description": "Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/validations/rsc-that-renders-link/asynchronous/page.tsx (7:7) @ Page
           >  7 |       <Link href="/about" legacyBehavior>
                |       ^",
               "stack": [
                 "Page app/validations/rsc-that-renders-link/asynchronous/page.tsx (7:7)",
               ],
             },
             {
               "description": "\`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag.",
               "environmentLabel": null,
               "label": "Runtime Error",
               "source": "app/validations/rsc-that-renders-link/asynchronous/page.tsx (7:7) @ Page
           >  7 |       <Link href="/about" legacyBehavior>
                |       ^",
               "stack": [
                 "Page app/validations/rsc-that-renders-link/asynchronous/page.tsx (7:7)",
               ],
             },
           ]
          `)
        } else {
          const output = getContentBetween({
            input: newConsoleOutput(),
            endContent: '   at',
          })

          expect(output).toMatchInlineSnapshot(`
           "Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.
            ⨯ Error: \`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag."
          `)
        }
      })

      if (!process.env.__NEXT_EXPERIMENTAL_DEBUG_CHANNEL) {
        it('does not warn or throw if you pass a client component', async () => {
          const browser = await next.browser(
            '/validations/rsc-that-renders-link/client'
          )

          if (isNextDev) {
            await assertNoRedbox(browser)
          } else {
            expect(newConsoleOutput()).toEqual('')
          }
        })

        it('does not warn or throw if you pass a server component into a client component', async () => {
          const browser = await next.browser(
            '/validations/rsc-that-renders-link/client-with-rsc-child'
          )

          if (isNextDev) {
            await assertNoRedbox(browser)
          } else {
            expect(newConsoleOutput()).toEqual('')
          }
        })
      }

      it('warns if the child is a lazy component', async () => {
        const browser = await next.browser(
          '/validations/rsc-that-renders-link/lazy'
        )

        if (isNextDev) {
          await expect(browser).toDisplayRedbox(`
           [
             {
               "description": "Using a Lazy Component as a direct child of \`<Link legacyBehavior>\` from a Server Component is not supported. If you need legacyBehavior, wrap your Lazy Component in a Client Component that renders the Link's \`<a>\` tag.",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/validations/rsc-that-renders-link/lazy/page.tsx (9:7) @ Page
           >  9 |       <Link href="/about" legacyBehavior passHref>
                |       ^",
               "stack": [
                 "Page app/validations/rsc-that-renders-link/lazy/page.tsx (9:7)",
               ],
             },
             {
               "description": "\`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag.",
               "environmentLabel": null,
               "label": "Runtime Error",
               "source": "app/validations/rsc-that-renders-link/lazy/page.tsx (9:7) @ Page
           >  9 |       <Link href="/about" legacyBehavior passHref>
                |       ^",
               "stack": [
                 "Page app/validations/rsc-that-renders-link/lazy/page.tsx (9:7)",
               ],
             },
           ]
          `)
        } else {
          const output = getContentBetween({
            input: newConsoleOutput(),
            endContent: '   at',
          })
          expect(output).toMatchInlineSnapshot(`
           "Using a Lazy Component as a direct child of \`<Link legacyBehavior>\` from a Server Component is not supported. If you need legacyBehavior, wrap your Lazy Component in a Client Component that renders the Link's \`<a>\` tag.
            ⨯ Error: \`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag."
          `)
        }
      })
    })

    describe('Rendering a Client Component that renders <Link>', () => {
      it('does not warn if the child is a synchronous server component', async () => {
        const browser = await next.browser(
          '/validations/rsc-that-renders-client/synchronous'
        )

        if (isNextDev) {
          await assertNoRedbox(browser)
        } else {
          expect(newConsoleOutput()).toEqual('')
        }
      })

      it('throws an error if the child is an asynchronous server component', async () => {
        const browser = await next.browser(
          '/validations/rsc-that-renders-client/asynchronous'
        )

        if (isNextDev) {
          await expect(browser).toDisplayRedbox(`
            {
              "description": "\`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag.",
              "environmentLabel": null,
              "label": "Runtime Error",
              "source": "app/validations/rsc-that-renders-client/client-link.tsx (7:10) @ ClientLink
            > 7 |   return <Link legacyBehavior passHref {...props} />
                |          ^",
              "stack": [
                "ClientLink app/validations/rsc-that-renders-client/client-link.tsx (7:10)",
                "Page app/validations/rsc-that-renders-client/asynchronous/page.tsx (7:7)",
              ],
            }
          `)
        } else {
          const output = getContentBetween({
            input: newConsoleOutput(),
            endContent: '   at',
          })

          expect(output).toMatchInlineSnapshot(
            `" ⨯ Error: \`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag."`
          )
        }
      })

      if (!process.env.__NEXT_EXPERIMENTAL_DEBUG_CHANNEL) {
        it('does not warn or throw if you pass a client component', async () => {
          const browser = await next.browser(
            '/validations/rsc-that-renders-client/client'
          )

          if (isNextDev) {
            await assertNoRedbox(browser)
          } else {
            expect(newConsoleOutput()).toEqual('')
          }
        })

        it('does not warn or throw if you pass a server component into a client component', async () => {
          const browser = await next.browser(
            '/validations/rsc-that-renders-client/client-with-rsc-child'
          )

          if (isNextDev) {
            await assertNoRedbox(browser)
          } else {
            expect(newConsoleOutput()).toEqual('')
          }
        })
      }
    })
  })

  describe('When rendering from a Client Component', () => {
    it('errors if there are no children', async () => {
      const browser = await next.browser('/validations/client/missing-child')

      if (isNextDev) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "No children were passed to <Link> with \`href\` of \`/about\` but one child is required https://nextjs.org/docs/messages/link-no-children",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/validations/client/missing-child/page.tsx (6:10) @ Page
         > 6 |   return <Link href="/about" legacyBehavior></Link>
             |          ^",
           "stack": [
             "Page app/validations/client/missing-child/page.tsx (6:10)",
           ],
         }
        `)
      } else {
        const output = getContentBetween({
          input: newConsoleOutput(),
          endContent: '   at',
        })

        expect(output).toMatchInlineSnapshot(
          `" ⨯ Error: React.Children.only expected to receive a single React element child."`
        )
      }
    })

    it('errors if there are multiple children', async () => {
      const browser = await next.browser(
        '/validations/client/multiple-children'
      )

      if (isNextDev) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Multiple children were passed to <Link> with \`href\` of \`/about\` but only one child is supported https://nextjs.org/docs/messages/link-multiple-children 
         Open your browser's console to view the Component stack trace.",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/validations/client/multiple-children/page.tsx (7:5) @ Page
         >  7 |     <Link href="/about" legacyBehavior>
              |     ^",
           "stack": [
             "Page app/validations/client/multiple-children/page.tsx (7:5)",
           ],
         }
        `)
      } else {
        const output = getContentBetween({
          input: newConsoleOutput(),
          endContent: '   at',
        })

        expect(output).toMatchInlineSnapshot(
          `" ⨯ Error: React.Children.only expected to receive a single React element child."`
        )
      }
    })

    it('does not warn or throw if you pass a child component', async () => {
      const browser = await next.browser('/validations/client/child-component')

      if (isNextDev) {
        await assertNoRedbox(browser)
      } else {
        expect(newConsoleOutput()).toEqual('')
      }
    })

    it('warns and throws an error if the child is lazy JSX', async () => {
      const browser = await next.browser('/validations/client/lazy-jsx')

      if (isNextDev) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "\`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag.",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/validations/client/lazy-jsx/page.tsx (9:7) @ Page
         >  9 |       <Link href="/about" legacyBehavior passHref>
              |       ^",
           "stack": [
             "Page app/validations/client/lazy-jsx/page.tsx (9:7)",
           ],
         }
        `)
      } else {
        const output = getContentBetween({
          input: newConsoleOutput(),
          endContent: '   at',
        })

        expect(output).toMatchInlineSnapshot(
          `" ⨯ Error: \`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag."`
        )
      }
    })
  })
})

function getContentBetween({
  input,
  startContent,
  endContent,
}: {
  input: string
  startContent?: string
  endContent?: string
}): string {
  const lines = input.split('\n')

  const startIdx = startContent
    ? lines.findIndex((line) => line.includes(startContent))
    : -1

  const endIdx = endContent
    ? lines.findIndex((line) => line.includes(endContent))
    : -1

  if (startContent && startIdx < 0) return ''
  if (endContent && endIdx >= 0 && endIdx <= startIdx) return ''

  const sliceStart = startIdx >= 0 ? startIdx + 1 : 0
  const sliceEnd = endIdx > sliceStart ? endIdx : undefined

  return lines.slice(sliceStart, sliceEnd).join('\n')
}
