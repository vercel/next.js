import { isNextDev, nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('Validations for <Link legacyBehavior>', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('When rendering from a Server Component', () => {
    describe('Rendering <Link> directly', () => {
      it('warns if the child is synchronous server component', async () => {
        const previousOutputIndex = next.cliOutput.length
        const browser = await next.browser('/rsc/synchronous')

        if (isNextDev) {
          await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.",
           "environmentLabel": "Server",
           "label": "Console Error",
           "source": "app/rsc/synchronous/page.tsx (7:7) @ Page
         >  7 |       <Link href="/about" legacyBehavior>
              |       ^",
           "stack": [
             "Page app/rsc/synchronous/page.tsx (7:7)",
           ],
         }
        `)
        } else {
          const output = next.cliOutput.slice(previousOutputIndex)

          expect(output).toMatchInlineSnapshot(`
           "Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.
           "
          `)
        }
      })

      it('warns and throws an error if the child is asynchronous server component', async () => {
        const previousOutputIndex = next.cliOutput.length
        const browser = await next.browser('/rsc/asynchronous')

        if (isNextDev) {
          await expect(browser).toDisplayRedbox(`
         [
           {
             "description": "Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/rsc/asynchronous/page.tsx (7:7) @ Page
         >  7 |       <Link href="/about" legacyBehavior>
              |       ^",
             "stack": [
               "Page app/rsc/asynchronous/page.tsx (7:7)",
             ],
           },
           {
             "description": "\`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag.",
             "environmentLabel": null,
             "label": "Runtime Error",
             "source": "app/rsc/asynchronous/page.tsx (7:7) @ Page
         >  7 |       <Link href="/about" legacyBehavior>
              |       ^",
             "stack": [
               "Page app/rsc/asynchronous/page.tsx (7:7)",
             ],
           },
         ]
        `)
        } else {
          const output = getContentBetween({
            input: next.cliOutput.slice(previousOutputIndex),
            endContent: '   at',
          })

          // TODO: Need to exclude "at q" for webpack, "at "
          expect(output).toMatchInlineSnapshot(`
           "Using a Server Component as a direct child of \`<Link legacyBehavior>\` is not supported. If you need legacyBehavior, wrap your Server Component in a Client Component that renders the Link's \`<a>\` tag.
            ⨯ Error: \`<Link legacyBehavior>\` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's \`<a>\` tag."
          `)
        }
      })

      it('does not warn or throw if you pass a client component', async () => {
        const previousOutputIndex = next.cliOutput.length
        const browser = await next.browser('/rsc/client')

        if (isNextDev) {
          await assertNoRedbox(browser)
        } else {
          expect(
            next.cliOutput.slice(previousOutputIndex)
          ).toMatchInlineSnapshot(`""`)
        }
      })

      it('does not warn or throw if you pass a server component into a client component', async () => {
        const previousOutputIndex = next.cliOutput.length
        const browser = await next.browser('/rsc/client-with-rsc-child')

        if (isNextDev) {
          await assertNoRedbox(browser)
        } else {
          expect(
            next.cliOutput.slice(previousOutputIndex)
          ).toMatchInlineSnapshot(`""`)
        }
      })
    })

    describe('Rendering a Client Component that renders <Link>', () => {
      it.todo('doesnt warn if the child is synchronous server component')
      it.todo('throws an error if the child is asynchronous server component')
      it.todo('does not warn or throw if you pass a client component 2')
      it.todo(
        'does not warn or throw if you pass a server component into a client component into Link 2'
      )
    })
  })

  describe('When rendering from a Client Component', () => {
    it.todo('does not warn or throw if you pass a child component')
    it.todo('warns and throws an error if the child is lazy JSX')
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
