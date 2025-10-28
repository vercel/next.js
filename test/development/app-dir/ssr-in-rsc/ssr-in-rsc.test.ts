import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

const isRspack = process.env.NEXT_RSPACK !== undefined

describe('react-dom/server in React Server environment', () => {
  const dependencies = (global as any).isNextDeploy
    ? // `link` is incompatible with the npm version used when this test is deployed
      {
        'internal-pkg': 'file:./internal-pkg',
      }
    : {
        'internal-pkg': 'link:./internal-pkg',
      }
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    dependencies,
    skipStart: true,
  })

  let isStarted = false
  beforeEach(async () => {
    // FIXME: next-custom-transforms RSC errors are not cleared during dev server livetime so we have to restart
    if (isStarted) {
      await next.stop()
    }
    await next.start()
    isStarted = true
  })

  it('explicit react-dom/server.browser usage in app code', async () => {
    const browser = await next.browser(
      '/exports/app-code/react-dom-server-browser-explicit'
    )

    await assertNoRedbox(browser)
    if (isTurbopack) {
      expect(await browser.elementByCss('main').text()).toMatchInlineSnapshot(`
        "{
          "default": [
            "renderToReadableStream",
            "renderToStaticMarkup",
            "renderToString",
            "resume",
            "version"
          ],
          "named": [
            "default",
            "renderToReadableStream",
            "renderToStaticMarkup",
            "renderToString",
            "resume",
            "version"
          ]
        }"
      `)
    } else {
      expect(await browser.elementByCss('main').text()).toMatchInlineSnapshot(`
        "{
          "default": [
            "renderToReadableStream",
            "renderToStaticMarkup",
            "renderToString",
            "resume",
            "version"
          ],
          "named": [
            "default",
            "renderToReadableStream",
            "renderToStaticMarkup",
            "renderToString",
            "resume",
            "version"
          ]
        }"
      `)
    }
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }
    if (isTurbopack) {
      expect(redbox).toMatchInlineSnapshot(`
        {
          "description": null,
          "source": null,
        }
      `)
    } else {
      expect(redbox).toMatchInlineSnapshot(`
        {
          "description": null,
          "source": null,
        }
      `)
    }
  })

  it('explicit react-dom/server.edge usage in app code', async () => {
    const browser = await next.browser(
      '/exports/app-code/react-dom-server-edge-explicit'
    )

    await assertNoRedbox(browser)
    if (isTurbopack) {
      expect(await browser.elementByCss('main').text()).toMatchInlineSnapshot(`
        "{
          "default": [
            "renderToReadableStream",
            "renderToStaticMarkup",
            "renderToString",
            "resume",
            "version"
          ],
          "named": [
            "default",
            "renderToReadableStream",
            "renderToStaticMarkup",
            "renderToString",
            "resume",
            "version"
          ]
        }"
      `)
    } else {
      expect(await browser.elementByCss('main').text()).toMatchInlineSnapshot(`
        "{
          "default": [
            "renderToReadableStream",
            "renderToStaticMarkup",
            "renderToString",
            "resume",
            "version"
          ],
          "named": [
            "default",
            "renderToReadableStream",
            "renderToStaticMarkup",
            "renderToString",
            "resume",
            "version"
          ]
        }"
      `)
    }
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }
    if (isTurbopack) {
      expect(redbox).toMatchInlineSnapshot(`
        {
          "description": null,
          "source": null,
        }
      `)
    } else {
      expect(redbox).toMatchInlineSnapshot(`
        {
          "description": null,
          "source": null,
        }
      `)
    }
  })

  it('implicit react-dom/server.edge usage in app code', async () => {
    const browser = await next.browser(
      '/exports/app-code/react-dom-server-edge-implicit'
    )

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Ecmascript file had an error",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/exports/app-code/react-dom-server-edge-implicit/page.js (3:1)
       Ecmascript file had an error
       > 3 | import ReactDOMServerEdgeDefault from 'react-dom/server'
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "<FIXME-nextjs-internal-source>
         × Module build failed:
         ╰─▶   × Error:   x You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
               │   | Learn more: https://nextjs.org/docs/app/building-your-application/rendering
               │    ,-[1:1]
               │  1 | import * as ReactDOMServerEdge from 'react-dom/server'
               │    : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
               │  2 | // Fine to drop once React is on ESM
               │  3 | import ReactDOMServerEdgeDefault from 'react-dom/server'
               │    \`----
               │   x You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
               │   | Learn more: https://nextjs.org/docs/app/building-your-application/rendering
               │    ,-[3:1]
               │  1 | import * as ReactDOMServerEdge from 'react-dom/server'
               │  2 | // Fine to drop once React is on ESM
               │  3 | import ReactDOMServerEdgeDefault from 'react-dom/server'
               │    : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
               │  4 |
               │  5 | export const runtime = 'edge'
               │    \`----
               │",
         "stack": [],
       }
      `)
    } else {
      // FIXME: the source map of source file path is not correct
      // Expected: `./app/exports/app-code/react-dom-server-edge-implicit/page.js`
      // Observed: `./node_modules/.pnpm/next@file+..+next-repo.../page.js?__next_edge_ssr_entry__
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "<FIXME-nextjs-internal-source>
       Error:   x You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
         | Learn more: https://nextjs.org/docs/app/building-your-application/rendering
          ,-[1:1]
        1 | import * as ReactDOMServerEdge from 'react-dom/server'
          : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        2 | // Fine to drop once React is on ESM
        3 | import ReactDOMServerEdgeDefault from 'react-dom/server'
          \`----
         x You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
         | Learn more: https://nextjs.org/docs/app/building-your-application/rendering
          ,-[3:1]
        1 | import * as ReactDOMServerEdge from 'react-dom/server'
        2 | // Fine to drop once React is on ESM
        3 | import ReactDOMServerEdgeDefault from 'react-dom/server'
          : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        4 |
        5 | export const runtime = 'edge'
          \`----",
         "stack": [],
       }
      `)
    }
  })

  it('explicit react-dom/server.node usage in app code', async () => {
    const browser = await next.browser(
      '/exports/app-code/react-dom-server-node-explicit'
    )

    await assertHasRedbox(browser)
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }
    if (isTurbopack) {
      if (isReact18) {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "Cannot read properties of undefined (reading 'ReactCurrentDispatcher')",
            "source": "app/exports/app-code/react-dom-server-node-explicit/page.js (1:1) @ module evaluation

          > 1 | import * as ReactDOMServerNode from 'react-dom/server.node'
              | ^
            2 | // Fine to drop once React is on ESM
            3 | import ReactDOMServerNodeDefault from 'react-dom/server.node'
            4 |",
          }
        `)
      } else {
        expect(redbox).toMatchInlineSnapshot(`
         {
           "description": "react-dom/server is not supported in React Server Components.",
           "source": "app/exports/app-code/react-dom-server-node-explicit/page.js (1:1) @ module evaluation

         > 1 | import * as ReactDOMServerNode from 'react-dom/server.node'
             | ^
           2 | // Fine to drop once React is on ESM
           3 | import ReactDOMServerNodeDefault from 'react-dom/server.node'
           4 |",
         }
        `)
      }
    } else {
      if (isReact18) {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "Cannot read properties of undefined (reading 'ReactCurrentDispatcher')",
            "source": null,
          }
        `)
      } else {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "react-dom/server is not supported in React Server Components.",
            "source": null,
          }
        `)
      }
    }
  })

  it('implicit react-dom/server.node usage in app code', async () => {
    const browser = await next.browser(
      '/exports/app-code/react-dom-server-node-implicit'
    )

    await assertHasRedbox(browser)
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }
    if (isTurbopack) {
      expect(redbox).toMatchInlineSnapshot(`
       {
         "description": "Ecmascript file had an error",
         "source": "./app/exports/app-code/react-dom-server-node-implicit/page.js (3:1)
       Ecmascript file had an error
         1 | import * as ReactDOMServerNode from 'react-dom/server'
         2 | // Fine to drop once React is on ESM
       > 3 | import ReactDOMServerNodeDefault from 'react-dom/server'
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         4 |
         5 | export const runtime = 'nodejs'
         6 |

       You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
       Learn more: https://nextjs.org/docs/app/building-your-application/rendering",
       }
      `)
    } else if (isRspack) {
      expect(redbox).toMatchInlineSnapshot(`
       {
         "description": "  × Module build failed:",
         "source": "./app/exports/app-code/react-dom-server-node-implicit/page.js
         × Module build failed:
         ╰─▶   × Error:   x You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
               │   | Learn more: https://nextjs.org/docs/app/building-your-application/rendering
               │    ,-[1:1]
               │  1 | import * as ReactDOMServerNode from 'react-dom/server'
               │    : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
               │  2 | // Fine to drop once React is on ESM
               │  3 | import ReactDOMServerNodeDefault from 'react-dom/server'
               │    \`----
               │   x You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
               │   | Learn more: https://nextjs.org/docs/app/building-your-application/rendering
               │    ,-[3:1]
               │  1 | import * as ReactDOMServerNode from 'react-dom/server'
               │  2 | // Fine to drop once React is on ESM
               │  3 | import ReactDOMServerNodeDefault from 'react-dom/server'
               │    : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
               │  4 |
               │  5 | export const runtime = 'nodejs'
               │    \`----
               │",
       }
      `)
    } else {
      expect(redbox).toMatchInlineSnapshot(`
       {
         "description": "  x You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.",
         "source": "./app/exports/app-code/react-dom-server-node-implicit/page.js
       Error:   x You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
         | Learn more: https://nextjs.org/docs/app/building-your-application/rendering
          ,-[1:1]
        1 | import * as ReactDOMServerNode from 'react-dom/server'
          : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        2 | // Fine to drop once React is on ESM
        3 | import ReactDOMServerNodeDefault from 'react-dom/server'
          \`----
         x You're importing a component that imports react-dom/server. To fix it, render or return the content directly as a Server Component instead for perf and security.
         | Learn more: https://nextjs.org/docs/app/building-your-application/rendering
          ,-[3:1]
        1 | import * as ReactDOMServerNode from 'react-dom/server'
        2 | // Fine to drop once React is on ESM
        3 | import ReactDOMServerNodeDefault from 'react-dom/server'
          : ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        4 | 
        5 | export const runtime = 'nodejs'
          \`----",
       }
      `)
    }
  })

  it('explicit react-dom/server.browser usage in library code', async () => {
    const browser = await next.browser(
      '/exports/library-code/react-dom-server-browser-explicit'
    )

    await assertHasRedbox(browser)
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }
    if (isTurbopack) {
      if (isReact18) {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "Cannot read properties of undefined (reading 'ReactCurrentDispatcher')",
            "source": "internal-pkg/server.node.js (1:1) @ module evaluation

          > 1 | import * as ReactDOMServerEdge from 'react-dom/server.node'
              | ^
            2 | // Fine to drop once React is on ESM
            3 | import ReactDOMServerEdgeDefault from 'react-dom/server.node'
            4 |",
          }
        `)
      } else {
        expect(redbox).toMatchInlineSnapshot(`
         {
           "description": "react-dom/server is not supported in React Server Components.",
           "source": "internal-pkg/server.node.js (1:1) @ module evaluation

         > 1 | import * as ReactDOMServerEdge from 'react-dom/server.node'
             | ^
           2 | // Fine to drop once React is on ESM
           3 | import ReactDOMServerEdgeDefault from 'react-dom/server.node'
           4 |",
         }
        `)
      }
    } else {
      if (isReact18) {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "Cannot read properties of undefined (reading 'ReactCurrentDispatcher')",
            "source": null,
          }
        `)
      } else {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "react-dom/server is not supported in React Server Components.",
            "source": null,
          }
        `)
      }
    }
  })

  it('explicit react-dom/server.edge usage in library code', async () => {
    const browser = await next.browser(
      '/exports/library-code/react-dom-server-edge-explicit'
    )

    await assertNoRedbox(browser)
    if (isTurbopack) {
      expect(await browser.elementByCss('main').text()).toMatchInlineSnapshot(`
        "{
          "default": {
            "default": [
              "renderToReadableStream",
              "renderToStaticMarkup",
              "renderToString",
              "resume",
              "version"
            ],
            "named": [
              "default",
              "renderToReadableStream",
              "renderToStaticMarkup",
              "renderToString",
              "resume",
              "version"
            ]
          }
        }"
      `)
    } else {
      expect(await browser.elementByCss('main').text()).toMatchInlineSnapshot(`
        "{
          "default": {
            "default": [
              "renderToReadableStream",
              "renderToStaticMarkup",
              "renderToString",
              "resume",
              "version"
            ],
            "named": [
              "default",
              "renderToReadableStream",
              "renderToStaticMarkup",
              "renderToString",
              "resume",
              "version"
            ]
          }
        }"
      `)
    }
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }
    if (isTurbopack) {
      expect(redbox).toMatchInlineSnapshot(`
        {
          "description": null,
          "source": null,
        }
      `)
    } else {
      expect(redbox).toMatchInlineSnapshot(`
        {
          "description": null,
          "source": null,
        }
      `)
    }
  })

  it('implicit react-dom/server.edge usage in library code', async () => {
    const browser = await next.browser(
      '/exports/library-code/react-dom-server-edge-implicit'
    )

    await assertNoRedbox(browser)
    if (isTurbopack) {
      expect(await browser.elementByCss('main').text()).toMatchInlineSnapshot(`
        "{
          "default": {
            "default": [
              "renderToReadableStream",
              "renderToStaticMarkup",
              "renderToString",
              "resume",
              "version"
            ],
            "named": [
              "default",
              "renderToReadableStream",
              "renderToStaticMarkup",
              "renderToString",
              "resume",
              "version"
            ]
          }
        }"
      `)
    } else {
      expect(await browser.elementByCss('main').text()).toMatchInlineSnapshot(`
        "{
          "default": {
            "default": [
              "renderToReadableStream",
              "renderToStaticMarkup",
              "renderToString",
              "resume",
              "version"
            ],
            "named": [
              "default",
              "renderToReadableStream",
              "renderToStaticMarkup",
              "renderToString",
              "resume",
              "version"
            ]
          }
        }"
      `)
    }
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }
    if (isTurbopack) {
      expect(redbox).toMatchInlineSnapshot(`
        {
          "description": null,
          "source": null,
        }
      `)
    } else {
      expect(redbox).toMatchInlineSnapshot(`
        {
          "description": null,
          "source": null,
        }
      `)
    }
  })

  it('explicit react-dom/server.node usage in library code', async () => {
    const browser = await next.browser(
      '/exports/library-code/react-dom-server-node-explicit'
    )

    await assertHasRedbox(browser)
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }
    if (isTurbopack) {
      if (isReact18) {
        expect(redbox).toMatchInlineSnapshot(`
         {
           "description": "Cannot read properties of undefined (reading 'ReactCurrentDispatcher')",
           "source": "internal-pkg/server.node.js (1:1) @ module evaluation

         > 1 | import * as ReactDOMServerEdge from 'react-dom/server.node'
             | ^
           2 | // Fine to drop once React is on ESM
           3 | import ReactDOMServerEdgeDefault from 'react-dom/server.node'
           4 |",
         }
        `)
      } else {
        expect(redbox).toMatchInlineSnapshot(`
         {
           "description": "react-dom/server is not supported in React Server Components.",
           "source": "internal-pkg/server.node.js (1:1) @ module evaluation

         > 1 | import * as ReactDOMServerEdge from 'react-dom/server.node'
             | ^
           2 | // Fine to drop once React is on ESM
           3 | import ReactDOMServerEdgeDefault from 'react-dom/server.node'
           4 |",
         }
        `)
      }
    } else {
      if (isReact18) {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "Cannot read properties of undefined (reading 'ReactCurrentDispatcher')",
            "source": null,
          }
        `)
      } else {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "react-dom/server is not supported in React Server Components.",
            "source": null,
          }
        `)
      }
    }
  })

  it('implicit react-dom/server.node usage in library code', async () => {
    const browser = await next.browser(
      '/exports/library-code/react-dom-server-node-implicit'
    )

    await assertHasRedbox(browser)
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }

    if (isTurbopack) {
      if (isReact18) {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "Cannot read properties of undefined (reading 'ReactCurrentDispatcher')",
            "source": "internal-pkg/server.node.js (1:1) @ module evaluation

          > 1 | import * as ReactDOMServerEdge from 'react-dom/server.node'
              | ^
            2 | // Fine to drop once React is on ESM
            3 | import ReactDOMServerEdgeDefault from 'react-dom/server.node'
            4 |",
          }
        `)
      } else {
        expect(redbox).toMatchInlineSnapshot(`
         {
           "description": "react-dom/server is not supported in React Server Components.",
           "source": "internal-pkg/server.node.js (1:1) @ module evaluation

         > 1 | import * as ReactDOMServerEdge from 'react-dom/server.node'
             | ^
           2 | // Fine to drop once React is on ESM
           3 | import ReactDOMServerEdgeDefault from 'react-dom/server.node'
           4 |",
         }
        `)
      }
    } else {
      if (isReact18) {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "Cannot read properties of undefined (reading 'ReactCurrentDispatcher')",
            "source": null,
          }
        `)
      } else {
        expect(redbox).toMatchInlineSnapshot(`
          {
            "description": "react-dom/server is not supported in React Server Components.",
            "source": null,
          }
        `)
      }
    }
  })
})
