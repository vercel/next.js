import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getStackFramesContent,
  toggleCollapseCallStackFrames,
} from 'next-test-utils'
import { outdent } from 'outdent'

describe('errors - node-internal-stack-frame', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: {
      'pages/index.js': outdent`
      export default function Page() {}
      
      function createURL() {
        new URL("/", "invalid")
      }

      export function getServerSideProps() {
        createURL()
        return { props: {} }
      }`,
    },
  })

  test('should hide nodejs internal stack frames from stack trace', async () => {
    const browser = await next.browser('/')

    await assertHasRedbox(browser)

    const stack = await getStackFramesContent(browser)
    if (isTurbopack) {
      // FIXME: ignore the next internal frames from node_modules
      expect(stack).toMatchInlineSnapshot(`
       "at new URL ()
       at getServerSideProps (pages/index.js (8:3))
       at NextTracerImpl.trace ()
       at async doRender ()
       at async responseGenerator ()
       at async DevServer.renderToResponseWithComponentsImpl ()
       at async DevServer.renderPageComponent ()
       at async DevServer.renderToResponseImpl ()
       at async DevServer.pipeImpl ()
       at async NextNodeServer.handleCatchallRenderRequest ()
       at async DevServer.handleRequestImpl ()
       at async Span.traceAsyncFn ()
       at async DevServer.handleRequest ()
       at async invokeRender ()
       at async handleRequest ()
       at async requestHandlerImpl ()
       at async Server.requestListener ()"
      `)
    } else {
      expect(stack).toMatchInlineSnapshot(
        `"at getServerSideProps (pages/index.js (8:3))"`
      )

      await toggleCollapseCallStackFrames(browser)
      const stackCollapsed = await getStackFramesContent(browser)
      expect(stackCollapsed).toContain('at new URL ()')
    }
  })
})
