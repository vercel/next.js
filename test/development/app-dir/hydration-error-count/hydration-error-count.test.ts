import { nextTestSetup } from 'e2e-utils'
import {
  hasErrorToast,
  getToastErrorCount,
  retry,
  openRedbox,
  getRedboxDescription,
  getRedboxComponentStack,
  goToNextErrorView,
  getRedboxDescriptionWarning,
  getHighlightedDiffLines,
} from 'next-test-utils'
import { BrowserInterface } from 'next-webdriver'

describe('hydration-error-count', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have correct hydration error count for bad nesting', async () => {
    const browser = await next.browser('/bad-nesting')

    await retry(async () => {
      await hasErrorToast(browser)
      const totalErrorCount = await getToastErrorCount(browser)

      // One hydration error and one warning
      expect(totalErrorCount).toBe(2)
    })
  })

  it('should have correct hydration error count for html diff', async () => {
    const browser = await next.browser('/html-diff')

    await retry(async () => {
      await hasErrorToast(browser)
      const totalErrorCount = await getToastErrorCount(browser)

      // One hydration error and one warning
      expect(totalErrorCount).toBe(1)
    })
  })

  it('should display correct hydration info in each hydration error view', async () => {
    const browser = await next.browser('/two-issues')

    await openRedbox(browser)

    const firstError = await getHydrationErrorSnapshot(browser)
    await goToNextErrorView(browser)
    const secondError = await getHydrationErrorSnapshot(browser)

    // Hydration runtime error
    // - contains a diff
    // - has notes
    expect(firstError).toMatchInlineSnapshot(`
     {
       "description": "In HTML, <p> cannot be a descendant of <p>.
     This will cause a hydration error.",
       "diff": "...
         <OuterLayoutRouter parallelRouterKey="children" template={<RenderFromTemplateContext>}>
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/two-issues" tree={[...]} cacheNode={{lazyData:null, ...}} ...>
                             <ClientPageRoot Component={function Page} searchParams={{}} params={{}}>
                               <Page params={Promise} searchParams={Promise}>
     >                           <p className="client">
     >                             <p>
                             ...",
       "highlightedLines": [
         [
           "error",
           ">",
         ],
         [
           "error",
           ">",
         ],
       ],
       "notes": undefined,
     }
    `)

    // Hydration console.error
    // - contains a diff
    // - no notes
    expect(secondError).toMatchInlineSnapshot(`
     {
       "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
       "diff": "...
         <OuterLayoutRouter parallelRouterKey="children" template={<RenderFromTemplateContext>}>
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/two-issues" tree={[...]} cacheNode={{lazyData:null, ...}} ...>
                             <ClientPageRoot Component={function Page} searchParams={{}} params={{}}>
                               <Page params={Promise} searchParams={Promise}>
                                 <p
     +                             className="client"
     -                             className="server"
                                 >
                             ...",
       "highlightedLines": [
         [
           "add",
           "+",
         ],
         [
           "remove",
           "-",
         ],
       ],
       "notes": "- A server/client branch \`if (typeof window !== 'undefined')\`.
     - Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
     - Date formatting in a user's locale which doesn't match the server.
     - External changing data without sending a snapshot of it along with the HTML.
     - Invalid HTML tag nesting.

     It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.",
     }
    `)
  })
})

async function getHydrationErrorSnapshot(browser: BrowserInterface) {
  const description = await getRedboxDescription(browser)
  const notes = await getRedboxDescriptionWarning(browser)
  const diff = await getRedboxComponentStack(browser)
  const highlightedLines = await getHighlightedDiffLines(browser)

  return {
    description,
    notes,
    diff,
    highlightedLines,
  }
}
