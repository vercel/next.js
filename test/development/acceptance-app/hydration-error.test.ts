/* eslint-env jest */
import { sandbox } from './helpers'
import { createNextDescribe, FileRef } from 'e2e-utils'
import path from 'path'

// https://github.com/facebook/react/blob/main/packages/react-dom/src/__tests__/ReactDOMHydrationDiff-test.js
createNextDescribe(
  'Error Overlay for server components',
  {
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  },
  ({ next }) => {
    describe('text mismatch', () => {
      it('should show correct hydration errror when client and server render different text', async () => {
        const { cleanup, session } = await sandbox(
          next,
          new Map([
            [
              'app/page.js',
              `
        'use client'
        const isClient = typeof window !== 'undefined'
        export default function Mismatch() {
          return (
            <div className="parent">
              <main className="child">{isClient ? 'client' : 'server'}</main>
            </div>
          );
        }`,
            ],
          ])
        )

        await session.waitForAndOpenRuntimeError()

        expect(await session.getRedboxDescription()).toMatchInlineSnapshot(`
        "Error: Text content does not match server-rendered HTML. Server: \\"server\\" Client: \\"client\\"

        See more info here: https://nextjs.org/docs/messages/react-hydration-error"
      `)

        await cleanup()
      })

      it.skip('should show correct hydration errror when client and server render different html', async () => {
        const { cleanup, session } = await sandbox(
          next,
          new Map([
            [
              'app/page.js',
              `
        'use client'
        const isClient = typeof window !== 'undefined'
        export default function Mismatch() {
          return (
            <div className="parent">
              <main
                className="child"
                dangerouslySetInnerHTML={{
                  __html: isClient
                    ? '<span>client</span>'
                    : '<span>server</span>',
                }}
              />
            </div>
          );
        }`,
            ],
          ])
        )

        await session.waitForAndOpenRuntimeError()

        expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

        await cleanup()
      })
    })

    describe('attribute mismatch', () => {
      it.skip('should show correct hydration errror when client and server render different attributes', async () => {
        const { cleanup, session } = await sandbox(
          next,
          new Map([
            [
              'app/page.js',
              `
        'use client'
        const isClient = typeof window !== 'undefined'
        export default function Mismatch() {
          return (
            <div className="parent">
              <main
                className={isClient ? 'child client' : 'child server'}
                dir={isClient ? 'ltr' : 'rtl'}
              />
            </div>
          );
        }`,
            ],
          ])
        )

        await session.waitForAndOpenRuntimeError()

        expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

        await cleanup()
      })

      it.skip('should show correct hydration errror when client renders extra attributes', async () => {
        const { cleanup, session } = await sandbox(
          next,
          new Map([
            [
              'app/page.js',
              `
        'use client'
        const isClient = typeof window !== 'undefined'
        export default function Mismatch() {
          return (
            <div className="parent">
              <main
                className="child"
                tabIndex={isClient ? 1 : null}
                dir={isClient ? 'ltr' : null}
              />
            </div>
          );
        }`,
            ],
          ])
        )

        await session.waitForAndOpenRuntimeError()

        expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

        await cleanup()
      })

      it.skip('should show correct hydration errror when server renders extra attributes', async () => {
        const { cleanup, session } = await sandbox(
          next,
          new Map([
            [
              'app/page.js',
              `
        'use client'
        const isClient = typeof window !== 'undefined'
        export default function Mismatch({isClient}) {
          return (
            <div className="parent">
              <main
                className="child"
                tabIndex={isClient ? null : 1}
                dir={isClient ? null : 'rtl'}
              />
            </div>
          );
        }`,
            ],
          ])
        )

        await session.waitForAndOpenRuntimeError()

        expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

        await cleanup()
      })

      it.skip('should show correct hydration errror when both client and server render extra attributes', async () => {
        const { cleanup, session } = await sandbox(
          next,
          new Map([
            [
              'app/page.js',
              `
        'use client'
        const isClient = typeof window !== 'undefined'
        export default function Mismatch({isClient}) {
          return (
            <div className="parent">
              <main
                className="child"
                tabIndex={isClient ? 1 : null}
                dir={isClient ? null : 'rtl'}
              />
            </div>
          );
        }`,
            ],
          ])
        )

        await session.waitForAndOpenRuntimeError()

        expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

        await cleanup()
      })

      it.skip('should show correct hydration errror when client and server render different styles', async () => {
        const { cleanup, session } = await sandbox(
          next,
          new Map([
            [
              'app/page.js',
              `
        'use client'
        const isClient = typeof window !== 'undefined'
        export default function Mismatch({isClient}) {
          return (
            <div className="parent">
              <main
                className="child"
                style={{
                  opacity: isClient ? 1 : 0,
                }}
              />
            </div>
          );
        }`,
            ],
          ])
        )

        await session.waitForAndOpenRuntimeError()

        expect(await session.getRedboxDescription()).toMatchInlineSnapshot()

        await cleanup()
      })
    })

    // describe('extra nodes on the client', () => {
    //   describe('extra elements on the client', () => {
    //     // @gate __DEV__
    //     it('warns when client renders an extra element as only child', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {isClient && <main className="only" />}
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <main> in <div>.
    //             in main (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when client renders an extra element in the beginning', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {isClient && <header className="1" />}
    //             <main className="2" />
    //             <footer className="3" />
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <header> in <div>.
    //             in header (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when client renders an extra element in the middle', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <header className="1" />
    //             {isClient && <main className="2" />}
    //             <footer className="3" />
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <main> in <div>.
    //             in main (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when client renders an extra element in the end', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <header className="1" />
    //             <main className="2" />
    //             {isClient && <footer className="3" />}
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <footer> in <div>.
    //             in footer (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })
    //   })

    //   describe('extra text nodes on the client', () => {
    //     // @gate __DEV__
    //     it('warns when client renders an extra text node as only child', () => {
    //       function Mismatch({ isClient }) {
    //         return <div className="parent">{isClient && 'only'}</div>
    //       }
    //       if (gate((flags) => flags.enableClientRenderFallbackOnTextMismatch)) {
    //         expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Text content did not match. Server: \\"\\" Client: \\"only\\"
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Text content does not match server-rendered HTML.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //       } else {
    //         expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Text content did not match. Server: \\"\\" Client: \\"only\\"
    //             in div (at **)
    //             in Mismatch (at **)",
    //         ]
    //       `)
    //       }
    //     })

    //     // @gate __DEV__
    //     it('warns when client renders an extra text node in the beginning', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <header className="1" />
    //             {isClient && 'second'}
    //             <footer className="3" />
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching text node for \\"second\\" in <div>.
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when client renders an extra text node in the beginning', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {isClient && 'first'}
    //             <main className="2" />
    //             <footer className="3" />
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching text node for \\"first\\" in <div>.
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when client renders an extra text node in the end', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <header className="1" />
    //             <main className="2" />
    //             {isClient && 'third'}
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching text node for \\"third\\" in <div>.
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })
    //   })
    // })

    // describe('extra nodes on the server', () => {
    //   describe('extra elements on the server', () => {
    //     // @gate __DEV__
    //     it('warns when server renders an extra element as only child', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {!isClient && <main className="only" />}
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Did not expect server HTML to contain a <main> in <div>.
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra element in the beginning', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {!isClient && <header className="1" />}
    //             <main className="2" />
    //             <footer className="3" />
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <main> in <div>.
    //             in main (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra element in the middle', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <header className="1" />
    //             {!isClient && <main className="2" />}
    //             <footer className="3" />
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <footer> in <div>.
    //             in footer (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra element in the end', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <header className="1" />
    //             <main className="2" />
    //             {!isClient && <footer className="3" />}
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Did not expect server HTML to contain a <footer> in <div>.
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })
    //   })

    //   describe('extra text nodes on the server', () => {
    //     // @gate __DEV__
    //     it('warns when server renders an extra text node as only child', () => {
    //       function Mismatch({ isClient }) {
    //         return <div className="parent">{!isClient && 'only'}</div>
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Did not expect server HTML to contain the text node \\"only\\" in <div>.
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra text node in the beginning', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {!isClient && 'first'}
    //             <main className="2" />
    //             <footer className="3" />
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <main> in <div>.
    //             in main (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra text node in the middle', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <header className="1" />
    //             {!isClient && 'second'}
    //             <footer className="3" />
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <footer> in <div>.
    //             in footer (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra text node in the end', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <header className="1" />
    //             <main className="2" />
    //             {!isClient && 'third'}
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Did not expect server HTML to contain the text node \\"third\\" in <div>.
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })
    //   })
    // })

    // describe('special nodes', () => {
    //   describe('Suspense', () => {
    //     function Never() {
    //       throw new Promise((resolve) => {})
    //     }

    //     // @gate __DEV__
    //     it('warns when client renders an extra Suspense node in content mode', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {isClient && (
    //               <React.Suspense fallback={<p>Loading...</p>}>
    //                 <main className="only" />
    //               </React.Suspense>
    //             )}
    //           </div>
    //         )
    //       }
    //       // TODO: This message doesn't seem to have any useful details.
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra Suspense node in content mode', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {!isClient && (
    //               <React.Suspense fallback={<p>Loading...</p>}>
    //                 <main className="only" />
    //               </React.Suspense>
    //             )}
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Did not expect server HTML to contain a <main> in <div>.
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when client renders an extra Suspense node in fallback mode', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {isClient && (
    //               <React.Suspense fallback={<p>Loading...</p>}>
    //                 <main className="only" />
    //                 <Never />
    //               </React.Suspense>
    //             )}
    //           </div>
    //         )
    //       }
    //       // TODO: This message doesn't seem to have any useful details.
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra Suspense node in fallback mode', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {!isClient && (
    //               <React.Suspense fallback={<p>Loading...</p>}>
    //                 <main className="only" />
    //                 <Never />
    //               </React.Suspense>
    //             )}
    //           </div>
    //         )
    //       }

    //       // @TODO changes made to sending Fizz errors to client led to the insertion of templates in client rendered
    //       // suspense boundaries. This leaks in this test becuase the client rendered suspense boundary appears like
    //       // unhydrated tail nodes and this template is the first match. When we add special case handling for client
    //       // rendered suspense boundaries this test will likely change again
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Did not expect server HTML to contain a <template> in <div>.
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when client renders an extra node inside Suspense content', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <React.Suspense fallback={<p>Loading...</p>}>
    //               <header className="1" />
    //               {isClient && <main className="second" />}
    //               <footer className="3" />
    //             </React.Suspense>
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <main> in <div>.
    //             in main (at **)
    //             in Suspense (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating this Suspense boundary. Switched to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra node inside Suspense content', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <React.Suspense fallback={<p>Loading...</p>}>
    //               <header className="1" />
    //               {!isClient && <main className="second" />}
    //               <footer className="3" />
    //             </React.Suspense>
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <footer> in <div>.
    //             in footer (at **)
    //             in Suspense (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating this Suspense boundary. Switched to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when client renders an extra node inside Suspense fallback', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <React.Suspense
    //               fallback={
    //                 <>
    //                   <p>Loading...</p>
    //                   {isClient && <br />}
    //                 </>
    //               }
    //             >
    //               <main className="only" />
    //               <Never />
    //             </React.Suspense>
    //           </div>
    //         )
    //       }

    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Caught [The server did not finish this Suspense boundary: The server used \\"renderToString\\" which does not support Suspense. If you intended for this Suspense boundary to render the fallback content on the server consider throwing an Error somewhere within the Suspense boundary. If you intended to have the server wait for the suspended component please switch to \\"renderToPipeableStream\\" which supports Suspense on the server]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra node inside Suspense fallback', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             <React.Suspense
    //               fallback={
    //                 <>
    //                   <p>Loading...</p>
    //                   {!isClient && <br />}
    //                 </>
    //               }
    //             >
    //               <main className="only" />
    //               <Never />
    //             </React.Suspense>
    //           </div>
    //         )
    //       }

    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Caught [The server did not finish this Suspense boundary: The server used \\"renderToString\\" which does not support Suspense. If you intended for this Suspense boundary to render the fallback content on the server consider throwing an Error somewhere within the Suspense boundary. If you intended to have the server wait for the suspended component please switch to \\"renderToPipeableStream\\" which supports Suspense on the server]",
    //         ]
    //       `)
    //     })
    //   })

    //   describe('Fragment', () => {
    //     // @gate __DEV__
    //     it('warns when client renders an extra Fragment node', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {isClient && (
    //               <>
    //                 <header className="1" />
    //                 <main className="2" />
    //                 <footer className="3" />
    //               </>
    //             )}
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Expected server HTML to contain a matching <header> in <div>.
    //             in header (at **)
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })

    //     // @gate __DEV__
    //     it('warns when server renders an extra Fragment node', () => {
    //       function Mismatch({ isClient }) {
    //         return (
    //           <div className="parent">
    //             {!isClient && (
    //               <>
    //                 <header className="1" />
    //                 <main className="2" />
    //                 <footer className="3" />
    //               </>
    //             )}
    //           </div>
    //         )
    //       }
    //       expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //         Array [
    //           "Warning: Did not expect server HTML to contain a <header> in <div>.
    //             in div (at **)
    //             in Mismatch (at **)",
    //           "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //           "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //           "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //         ]
    //       `)
    //     })
    //   })
    // })

    // describe('misc cases', () => {
    //   // @gate __DEV__
    //   it('warns when client renders an extra node deeper in the tree', () => {
    //     function Mismatch({ isClient }) {
    //       return isClient ? <ProfileSettings /> : <MediaSettings />
    //     }

    //     function ProfileSettings() {
    //       return (
    //         <div className="parent">
    //           <input />
    //           <Panel type="profile" />
    //         </div>
    //       )
    //     }

    //     function MediaSettings() {
    //       return (
    //         <div className="parent">
    //           <input />
    //           <Panel type="media" />
    //         </div>
    //       )
    //     }

    //     function Panel({ type }) {
    //       return (
    //         <>
    //           <header className="1" />
    //           <main className="2" />
    //           {type === 'profile' && <footer className="3" />}
    //         </>
    //       )
    //     }

    //     expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //       Array [
    //         "Warning: Expected server HTML to contain a matching <footer> in <div>.
    //           in footer (at **)
    //           in Panel (at **)
    //           in div (at **)
    //           in ProfileSettings (at **)
    //           in Mismatch (at **)",
    //         "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //         "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //         "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //       ]
    //     `)
    //   })

    //   // @gate __DEV__
    //   it('warns when server renders an extra node deeper in the tree', () => {
    //     function Mismatch({ isClient }) {
    //       return isClient ? <ProfileSettings /> : <MediaSettings />
    //     }

    //     function ProfileSettings() {
    //       return (
    //         <div className="parent">
    //           <input />
    //           <Panel type="profile" />
    //         </div>
    //       )
    //     }

    //     function MediaSettings() {
    //       return (
    //         <div className="parent">
    //           <input />
    //           <Panel type="media" />
    //         </div>
    //       )
    //     }

    //     function Panel({ type }) {
    //       return (
    //         <>
    //           <header className="1" />
    //           <main className="2" />
    //           {type !== 'profile' && <footer className="3" />}
    //         </>
    //       )
    //     }

    //     expect(testMismatch(Mismatch)).toMatchInlineSnapshot(`
    //       Array [
    //         "Warning: Did not expect server HTML to contain a <footer> in <div>.
    //           in div (at **)
    //           in ProfileSettings (at **)
    //           in Mismatch (at **)",
    //         "Warning: An error occurred during hydration. The server HTML was replaced with client content in <div>.",
    //         "Caught [Hydration failed because the initial UI does not match what was rendered on the server.]",
    //         "Caught [There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.]",
    //       ]
    //     `)
    //   })
    // })
  }
)
