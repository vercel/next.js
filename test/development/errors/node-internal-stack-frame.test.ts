import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getStackFramesContent,
  toggleCollapseCallStackFrames,
} from 'next-test-utils'
import { outdent } from 'outdent'

describe('errors - node-internal-stack-frame', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.js': outdent`
      export default function Page() {}
      
      export function getServerSideProps() {
        new URL("/", "invalid");
        return { props: {} };
      }`,
    },
  })

  test('should hide unrelated frames in stack trace with node:internal calls', async () => {
    const browser = await next.browser('/')

    await assertHasRedbox(browser)

    const stack = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      // FIXME: ignore the next internal frames from node_modules
      expect(stack).toMatchInlineSnapshot(`
        "at getServerSideProps ()
        at spanContext ()
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
      expect(stack).toMatchInlineSnapshot(`
        "at eval ()
        at renderToHTMLImpl ()"
      `)
    }
    await toggleCollapseCallStackFrames(browser)

    // TODO: Since there're still the locations
    const expandedStack = await getStackFramesContent(browser)
    expect(expandedStack).toContain(`at new URL ()`)
  })
})
