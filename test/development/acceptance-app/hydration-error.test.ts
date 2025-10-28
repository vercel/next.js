/* eslint-env jest */
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'
import {
  assertNoRedbox,
  getRedboxErrorLink,
  getToastErrorCount,
  retry,
} from 'next-test-utils'

describe('Error overlay for hydration errors in App router', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'hydration-errors')),
  })

  it('includes a React docs link when hydration error does occur', async () => {
    const browser = await next.browser('/text-mismatch', {
      pushErrorAsConsoleLog: true,
    })

    const logs = await browser.log()
    expect(logs).toEqual(
      expect.arrayContaining([
        {
          // TODO: Should probably link to https://nextjs.org/docs/messages/react-hydration-error instead.
          message: expect.stringContaining(
            'https://react.dev/link/hydration-mismatch'
          ),
          source: 'error',
        },
      ])
    )
  })

  it('should show correct hydration error when client and server render different text', async () => {
    const browser = await next.browser('/text-mismatch')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Mismatch params={Promise} searchParams={Promise}>
                                 <div className="parent">
                                   <main className="child">
     +                               client
     -                               server
                           ...
                         ...
               ...",
       "description": "Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/(default)/text-mismatch/page.tsx (8:7) @ Mismatch
     >  8 |       <main className="child">{isClient ? 'client' : 'server'}</main>
          |       ^",
       "stack": [
         "main <anonymous>",
         "Mismatch app/(default)/text-mismatch/page.tsx (8:7)",
       ],
     }
    `)

    expect(await getRedboxErrorLink(browser)).toMatchInlineSnapshot(
      `"See more info here: https://nextjs.org/docs/messages/react-hydration-error"`
    )

    await next.patchFile(
      'app/(default)/text-mismatch/page.tsx',
      outdent`
      'use client'
      export default function Mismatch() {
        return (
          <div className="parent">
            <main className="child">Value</main>
          </div>
        );
      }
    `,
      async () => {
        await assertNoRedbox(browser)
        expect(await browser.elementByCss('.child').text()).toBe('Value')
      }
    )
  })

  it('should show correct hydration error when client renders an extra element', async () => {
    const browser = await next.browser('/extra-element-client')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Mismatch params={Promise} searchParams={Promise}>
                                 <div className="parent">
     +                             <main className="only">
                           ...
                         ...
               ...",
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/(default)/extra-element-client/page.tsx (6:47) @ Mismatch
     > 6 |   return <div className="parent">{isClient && <main className="only" />}</div>
         |                                               ^",
       "stack": [
         "main <anonymous>",
         "Mismatch app/(default)/extra-element-client/page.tsx (6:47)",
       ],
     }
    `)
  })

  it('should show correct hydration error when extra attributes set on server', async () => {
    const browser = await next.browser('/extra-attributes')

    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "componentStack": "...
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Next.js Internal Component>
                               <script>
                               <script>
                               <Next.js Internal Component>
                                 <RootLayout params={Promise}>
                                   <html
       -                             className="server-html"
                                   >
                           ...
               ...",
         "description": "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/(extra-attributes)/layout.tsx (9:5) @ RootLayout
       >  9 |     <html {...(isServer ? { className: 'server-html' } : undefined)}>
            |     ^",
         "stack": [
           "html <anonymous>",
           "RootLayout app/(extra-attributes)/layout.tsx (9:5)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "componentStack": "...
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Next.js Internal Component>
                               <Next.js Internal Component>
                                 <RootLayout params={Promise}>
                                   <html
       -                             className="server-html"
                                   >
                           ...
               ...",
         "description": "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/(extra-attributes)/layout.tsx (9:5) @ RootLayout
       >  9 |     <html {...(isServer ? { className: 'server-html' } : undefined)}>
            |     ^",
         "stack": [
           "html <anonymous>",
           "RootLayout app/(extra-attributes)/layout.tsx (9:5)",
         ],
       }
      `)
    }
  })

  it('should show correct hydration error when client renders an extra text node', async () => {
    const browser = await next.browser('/extra-text-node-client')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Mismatch params={Promise} searchParams={Promise}>
                                 <div className="parent">
                                   <header>
     +                             second
     -                             <footer className="3">
                                   ...
                           ...
                         ...
               ...",
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/(default)/extra-text-node-client/page.tsx (7:5) @ Mismatch
     >  7 |     <div className="parent">
          |     ^",
       "stack": [
         "div <anonymous>",
         "Mismatch app/(default)/extra-text-node-client/page.tsx (7:5)",
       ],
     }
    `)
  })

  it('should show correct hydration error when server renders an extra element', async () => {
    const browser = await next.browser('/extra-element-server')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Mismatch params={Promise} searchParams={Promise}>
                                 <div className="parent">
     -                             <main className="only">
                           ...
                         ...
               ...",
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/(default)/extra-element-server/page.tsx (6:10) @ Mismatch
     > 6 |   return <div className="parent">{isServer && <main className="only" />}</div>
         |          ^",
       "stack": [
         "div <anonymous>",
         "Mismatch app/(default)/extra-element-server/page.tsx (6:10)",
       ],
     }
    `)
  })

  it('should show correct hydration error when server renders an extra text node', async () => {
    const browser = await next.browser('/extra-text-node-server')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Mismatch params={Promise} searchParams={Promise}>
                                 <div className="parent">
     -                             only
                           ...
                         ...
               ...",
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/(default)/extra-text-node-server/page.tsx (6:10) @ Mismatch
     > 6 |   return <div className="parent">{isServer && 'only'}</div>
         |          ^",
       "stack": [
         "div <anonymous>",
         "Mismatch app/(default)/extra-text-node-server/page.tsx (6:10)",
       ],
     }
    `)
  })

  it('should show correct hydration error when server renders an extra text node in an invalid place', async () => {
    const browser = await next.browser('/extra-text-node-invalid-place')

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(2)
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Page params={Promise} searchParams={Promise}>
                               <table>
                                 <tbody>
                                   <tr>
     >                               test
                         ...
                       ...
             ...",
         "description": "In HTML, text nodes cannot be a child of <tr>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/(default)/extra-text-node-invalid-place/page.tsx (7:9) @ Page
     >  7 |         <tr>test</tr>
          |         ^",
         "stack": [
           "tr <anonymous>",
           "Page app/(default)/extra-text-node-invalid-place/page.tsx (7:9)",
         ],
       },
       {
         "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Page params={Promise} searchParams={Promise}>
     +                           <table>
     -                           test
                           ...
                         ...
               ...",
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/(default)/extra-text-node-invalid-place/page.tsx (5:5) @ Page
     > 5 |     <table>
         |     ^",
         "stack": [
           "table <anonymous>",
           "Page app/(default)/extra-text-node-invalid-place/page.tsx (5:5)",
         ],
       },
     ]
    `)
  })

  it('should show correct hydration error when server renders an extra whitespace in an invalid place', async () => {
    const browser = await next.browser('/extra-whitespace-invalid-place')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Page params={Promise} searchParams={Promise}>
     >                           <table>
     >                             {" "}
                                   ...
                           ...
                         ...
               ...",
       "description": "In HTML, whitespace text nodes cannot be a child of <table>. Make sure you don't have any extra whitespace between tags on each line of your source code.
     This will cause a hydration error.",
       "environmentLabel": null,
       "label": "Console Error",
       "source": "app/(default)/extra-whitespace-invalid-place/page.tsx (5:5) @ Page
     > 5 |     <table>
         |     ^",
       "stack": [
         "table <anonymous>",
         "Page app/(default)/extra-whitespace-invalid-place/page.tsx (5:5)",
       ],
     }
    `)
  })

  it('should show correct hydration error when client renders an extra node inside Suspense content', async () => {
    const browser = await next.browser('/extra-node-suspense')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Mismatch params={Promise} searchParams={Promise}>
                             <div className="parent">
                               <Suspense fallback={<p>}>
                                 <header>
     +                           <main className="second">
     -                           <footer className="3">
                                 ...
                       ...
                     ...
           ...",
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "environmentLabel": null,
       "label": "Recoverable Error",
       "source": "app/(default)/extra-node-suspense/page.tsx (12:22) @ Mismatch
     > 12 |         {isClient && <main className="second" />}
          |                      ^",
       "stack": [
         "main <anonymous>",
         "Mismatch app/(default)/extra-node-suspense/page.tsx (12:22)",
       ],
     }
    `)
  })

  it('should not show a hydration error when using `useId` in a client component', async () => {
    const browser = await next.browser('/use-id', {
      pushErrorAsConsoleLog: true,
    })

    const logs = await browser.log()
    const errors = logs.filter((x) => x.source === 'error')
    expect(errors).toEqual([])
  })

  it('should only show one hydration error when bad nesting happened - p under p', async () => {
    const browser = await next.browser('/p-under-p')

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(2)
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Page params={Promise} searchParams={Promise}>
     >                           <p>
     >                             <p>
                           ...
                         ...
               ...",
         "description": "In HTML, <p> cannot be a descendant of <p>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/(default)/p-under-p/page.tsx (6:7) @ Page
     > 6 |       <p>Nested p tags</p>
         |       ^",
         "stack": [
           "p <anonymous>",
           "Page app/(default)/p-under-p/page.tsx (6:7)",
         ],
       },
       {
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/(default)/p-under-p/page.tsx (6:7) @ Page
     > 6 |       <p>Nested p tags</p>
         |       ^",
         "stack": [
           "p <anonymous>",
           "Page app/(default)/p-under-p/page.tsx (6:7)",
         ],
       },
     ]
    `)
  })

  it('should only show one hydration error when bad nesting happened - div under p', async () => {
    const browser = await next.browser('/div-under-p')

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(2)
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Page params={Promise} searchParams={Promise}>
                               <div>
                                 <div>
     >                             <p>
     >                               <div>
                         ...
                       ...
             ...",
         "description": "In HTML, <div> cannot be a descendant of <p>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/(default)/div-under-p/page.tsx (8:11) @ Page
     >  8 |           <div>Nested div under p tag</div>
          |           ^",
         "stack": [
           "div <anonymous>",
           "Page app/(default)/div-under-p/page.tsx (8:11)",
         ],
       },
       {
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/(default)/div-under-p/page.tsx (8:11) @ Page
     >  8 |           <div>Nested div under p tag</div>
          |           ^",
         "stack": [
           "div <anonymous>",
           "Page app/(default)/div-under-p/page.tsx (8:11)",
         ],
       },
     ]
    `)
  })

  it('should only show one hydration error when bad nesting happened - div > tr', async () => {
    const browser = await next.browser('/tr-under-div')

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(2)
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Page params={Promise} searchParams={Promise}>
     >                           <div>
     >                             <tr>
                           ...
                         ...
               ...",
         "description": "In HTML, <tr> cannot be a child of <div>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/(default)/tr-under-div/page.tsx (6:7) @ Page
     > 6 |       <tr></tr>
         |       ^",
         "stack": [
           "tr <anonymous>",
           "Page app/(default)/tr-under-div/page.tsx (6:7)",
         ],
       },
       {
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/(default)/tr-under-div/page.tsx (6:7) @ Page
     > 6 |       <tr></tr>
         |       ^",
         "stack": [
           "tr <anonymous>",
           "Page app/(default)/tr-under-div/page.tsx (6:7)",
         ],
       },
     ]
    `)
  })

  it('should show the highlighted bad nesting html snippet when bad nesting happened', async () => {
    const browser = await next.browser('/bad-nesting')

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(3)
    })

    await expect(browser).toDisplayCollapsedRedbox(`
     [
       {
         "componentStack": "...
         <Next.js Internal Component>
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Page params={Promise} searchParams={Promise}>
     >                           <p>
                                   <span>
                                     <span>
                                       <span>
                                         <span>
     >                                     <p>
                           ...
                         ...
               ...",
         "description": "In HTML, <p> cannot be a descendant of <p>.
     This will cause a hydration error.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/(default)/bad-nesting/page.tsx (10:15) @ Page
     > 10 |               <p>hello world</p>
          |               ^",
         "stack": [
           "p <anonymous>",
           "Page app/(default)/bad-nesting/page.tsx (10:15)",
         ],
       },
       {
         "description": "<p> cannot contain a nested <p>.
     See this log for the ancestor stack trace.",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/(default)/bad-nesting/page.tsx (5:5) @ Page
     > 5 |     <p>
         |     ^",
         "stack": [
           "p <anonymous>",
           "Page app/(default)/bad-nesting/page.tsx (5:5)",
         ],
       },
       {
         "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/(default)/bad-nesting/page.tsx (10:15) @ Page
     > 10 |               <p>hello world</p>
          |               ^",
         "stack": [
           "p <anonymous>",
           "Page app/(default)/bad-nesting/page.tsx (10:15)",
         ],
       },
     ]
    `)
  })

  it('should show error if script is directly placed under html instead of body', async () => {
    const browser = await next.browser('/script-under-html')

    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(
        // One error for "Cannot render a sync or defer <script>"
        3
      )
    })

    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       [
         {
           "description": "Cannot render a sync or defer <script> outside the main document without knowing its order. Try adding async="" or moving it into the root <head> tag.",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/(script-under-html)/layout.tsx (8:7) @ RootLayout
       >  8 |       <Script
            |       ^",
           "stack": [
             "RootLayout app/(script-under-html)/layout.tsx (8:7)",
           ],
         },
         {
           "componentStack": "...
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Next.js Internal Component>
                                 <Next.js Internal Component>
                                 <script>
                                 <script>
                                 <RootLayout>
       >                           <html>
                                     <body>
                                     <Script src="https://ex..." strategy="beforeInte...">
       >                               <script nonce={undefined} dangerouslySetInnerHTML={{__html:"(self.__ne..."}}>
                             ...
                 ...",
           "description": "In HTML, <script> cannot be a child of <html>.
       This will cause a hydration error.",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/(script-under-html)/layout.tsx (8:7) @ RootLayout
       >  8 |       <Script
            |       ^",
           "stack": [
             "script <anonymous>",
             "RootLayout app/(script-under-html)/layout.tsx (8:7)",
           ],
         },
         {
           "description": "<html> cannot contain a nested <script>.
       See this log for the ancestor stack trace.",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/(script-under-html)/layout.tsx (6:5) @ RootLayout
       > 6 |     <html>
           |     ^",
           "stack": [
             "html <anonymous>",
             "RootLayout app/(script-under-html)/layout.tsx (6:5)",
           ],
         },
       ]
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       [
         {
           "description": "Cannot render a sync or defer <script> outside the main document without knowing its order. Try adding async="" or moving it into the root <head> tag.",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/(script-under-html)/layout.tsx (8:7) @ RootLayout
       >  8 |       <Script
            |       ^",
           "stack": [
             "RootLayout app/(script-under-html)/layout.tsx (8:7)",
           ],
         },
         {
           "componentStack": "...
           <Next.js Internal Component>
             <Next.js Internal Component>
               <Next.js Internal Component>
                 <Next.js Internal Component>
                   <Next.js Internal Component>
                     <Next.js Internal Component>
                       <Next.js Internal Component>
                         <Next.js Internal Component>
                           <Next.js Internal Component>
                             <Next.js Internal Component>
                               <Next.js Internal Component>
                                 <Next.js Internal Component>
                                 <RootLayout>
       >                           <html>
                                     <body>
                                     <Script src="https://ex..." strategy="beforeInte...">
       >                               <script nonce={undefined} dangerouslySetInnerHTML={{__html:"(self.__ne..."}}>
                             ...
                 ...",
           "description": "In HTML, <script> cannot be a child of <html>.
       This will cause a hydration error.",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/(script-under-html)/layout.tsx (8:7) @ RootLayout
       >  8 |       <Script
            |       ^",
           "stack": [
             "script <anonymous>",
             "RootLayout app/(script-under-html)/layout.tsx (8:7)",
           ],
         },
         {
           "description": "<html> cannot contain a nested <script>.
       See this log for the ancestor stack trace.",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/(script-under-html)/layout.tsx (6:5) @ RootLayout
       > 6 |     <html>
           |     ^",
           "stack": [
             "html <anonymous>",
             "RootLayout app/(script-under-html)/layout.tsx (6:5)",
           ],
         },
       ]
      `)
    }
  })
})
