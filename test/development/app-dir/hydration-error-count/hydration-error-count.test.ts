import { nextTestSetup } from 'e2e-utils'

describe('hydration-error-count', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have correct hydration error count for bad nesting', async () => {
    const browser = await next.browser('/bad-nesting')

    if (process.env.__NEXT_CACHE_COMPONENTS) {
      await expect(browser).toDisplayCollapsedRedbox(`
       [
         {
           "componentStack": "...
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary name={undefined} loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/bad-nesting" tree={[...]} params={{}} cacheNode={{lazyData:null, ...}} ...>
                             <SegmentViewNode type="page" pagePath="bad-nestin...">
                               <SegmentTrieNode>
                               <ClientPageRoot Component={function Page} serverProvidedParams={null}>
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
           "source": "app/bad-nesting/page.tsx (6:7) @ Page
       > 6 |       <p>nest</p>
           |       ^",
           "stack": [
             "p <anonymous>",
             "Page app/bad-nesting/page.tsx (6:7)",
           ],
         },
         {
           "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
           "environmentLabel": null,
           "label": "Recoverable Error",
           "source": "app/bad-nesting/page.tsx (6:7) @ Page
       > 6 |       <p>nest</p>
           |       ^",
           "stack": [
             "p <anonymous>",
             "Page app/bad-nesting/page.tsx (6:7)",
           ],
         },
       ]
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       [
         {
           "componentStack": "...
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary name={undefined} loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/bad-nesting" tree={[...]} params={{}} cacheNode={{lazyData:null, ...}} ...>
                             <SegmentViewNode type="page" pagePath="bad-nestin...">
                               <SegmentTrieNode>
                               <ClientPageRoot Component={function Page} serverProvidedParams={{...}}>
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
           "source": "app/bad-nesting/page.tsx (6:7) @ Page
       > 6 |       <p>nest</p>
           |       ^",
           "stack": [
             "p <anonymous>",
             "Page app/bad-nesting/page.tsx (6:7)",
           ],
         },
         {
           "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
           "environmentLabel": null,
           "label": "Recoverable Error",
           "source": "app/bad-nesting/page.tsx (6:7) @ Page
       > 6 |       <p>nest</p>
           |       ^",
           "stack": [
             "p <anonymous>",
             "Page app/bad-nesting/page.tsx (6:7)",
           ],
         },
       ]
      `)
    }
  })

  it('should have correct hydration error count for html diff', async () => {
    const browser = await next.browser('/html-diff')

    if (process.env.__NEXT_CACHE_COMPONENTS) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "componentStack": "...
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary name={undefined} loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/html-diff" tree={[...]} params={{}} cacheNode={{lazyData:null, ...}} ...>
                             <SegmentViewNode type="page" pagePath="html-diff/...">
                               <SegmentTrieNode>
                               <ClientPageRoot Component={function Page} serverProvidedParams={null}>
                                 <Page params={Promise} searchParams={Promise}>
                                   <p>
       +                             client
       -                             server
                             ...
                           ...
                 ...",
         "description": "Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/html-diff/page.tsx (4:10) @ Page
       > 4 |   return <p>{typeof window === 'undefined' ? 'server' : 'client'}</p>
           |          ^",
         "stack": [
           "p <anonymous>",
           "Page app/html-diff/page.tsx (4:10)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "componentStack": "...
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary name={undefined} loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/html-diff" tree={[...]} params={{}} cacheNode={{lazyData:null, ...}} ...>
                             <SegmentViewNode type="page" pagePath="html-diff/...">
                               <SegmentTrieNode>
                               <ClientPageRoot Component={function Page} serverProvidedParams={{...}}>
                                 <Page params={Promise} searchParams={Promise}>
                                   <p>
       +                             client
       -                             server
                             ...
                           ...
                 ...",
         "description": "Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
         "environmentLabel": null,
         "label": "Recoverable Error",
         "source": "app/html-diff/page.tsx (4:10) @ Page
       > 4 |   return <p>{typeof window === 'undefined' ? 'server' : 'client'}</p>
           |          ^",
         "stack": [
           "p <anonymous>",
           "Page app/html-diff/page.tsx (4:10)",
         ],
       }
      `)
    }
  })

  it('should display correct hydration info in each hydration error view', async () => {
    const browser = await next.browser('/two-issues')

    if (process.env.__NEXT_CACHE_COMPONENTS) {
      await expect(browser).toDisplayCollapsedRedbox(`
       [
         {
           "componentStack": "...
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary name={undefined} loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/two-issues" tree={[...]} params={{}} cacheNode={{lazyData:null, ...}} ...>
                             <SegmentViewNode type="page" pagePath="two-issues...">
                               <SegmentTrieNode>
                               <ClientPageRoot Component={function Page} serverProvidedParams={null}>
                                 <Page params={Promise} searchParams={Promise}>
       >                           <p className="client">
       >                             <p>
                             ...
                           ...
                 ...",
           "description": "In HTML, <p> cannot be a descendant of <p>.
       This will cause a hydration error.",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/two-issues/page.tsx (10:7) @ Page
       > 10 |       <p>nest</p>
            |       ^",
           "stack": [
             "p <anonymous>",
             "Page app/two-issues/page.tsx (10:7)",
           ],
         },
         {
           "componentStack": "...
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary name={undefined} loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/two-issues" tree={[...]} params={{}} cacheNode={{lazyData:null, ...}} ...>
                             <SegmentViewNode type="page" pagePath="two-issues...">
                               <SegmentTrieNode>
                               <ClientPageRoot Component={function Page} serverProvidedParams={null}>
                                 <Page params={Promise} searchParams={Promise}>
                                   <p
       +                             className="client"
       -                             className="server"
                                   >
                             ...
                           ...
                 ...",
           "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
           "environmentLabel": null,
           "label": "Recoverable Error",
           "source": "app/two-issues/page.tsx (10:7) @ Page
       > 10 |       <p>nest</p>
            |       ^",
           "stack": [
             "p <anonymous>",
             "Page app/two-issues/page.tsx (10:7)",
           ],
         },
       ]
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       [
         {
           "componentStack": "...
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary name={undefined} loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/two-issues" tree={[...]} params={{}} cacheNode={{lazyData:null, ...}} ...>
                             <SegmentViewNode type="page" pagePath="two-issues...">
                               <SegmentTrieNode>
                               <ClientPageRoot Component={function Page} serverProvidedParams={{...}}>
                                 <Page params={Promise} searchParams={Promise}>
       >                           <p className="client">
       >                             <p>
                             ...
                           ...
                 ...",
           "description": "In HTML, <p> cannot be a descendant of <p>.
       This will cause a hydration error.",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/two-issues/page.tsx (10:7) @ Page
       > 10 |       <p>nest</p>
            |       ^",
           "stack": [
             "p <anonymous>",
             "Page app/two-issues/page.tsx (10:7)",
           ],
         },
         {
           "componentStack": "...
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary name={undefined} loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/two-issues" tree={[...]} params={{}} cacheNode={{lazyData:null, ...}} ...>
                             <SegmentViewNode type="page" pagePath="two-issues...">
                               <SegmentTrieNode>
                               <ClientPageRoot Component={function Page} serverProvidedParams={{...}}>
                                 <Page params={Promise} searchParams={Promise}>
                                   <p
       +                             className="client"
       -                             className="server"
                                   >
                             ...
                           ...
                 ...",
           "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
           "environmentLabel": null,
           "label": "Recoverable Error",
           "source": "app/two-issues/page.tsx (10:7) @ Page
       > 10 |       <p>nest</p>
            |       ^",
           "stack": [
             "p <anonymous>",
             "Page app/two-issues/page.tsx (10:7)",
           ],
         },
       ]
      `)
    }
  })

  it('should display runtime error separately from hydration errors', async () => {
    const browser = await next.browser('/hydration-with-runtime-errors')

    if (process.env.__NEXT_CACHE_COMPONENTS) {
      await expect(browser).toDisplayRedbox(`
       [
         {
           "componentStack": "...
           <RenderFromTemplateContext>
             <ScrollAndFocusHandler segmentPath={[...]}>
               <InnerScrollAndFocusHandler segmentPath={[...]} focusAndScrollRef={{apply:false, ...}}>
                 <ErrorBoundary errorComponent={undefined} errorStyles={undefined} errorScripts={undefined}>
                   <LoadingBoundary name={undefined} loading={null}>
                     <HTTPAccessFallbackBoundary notFound={undefined} forbidden={undefined} unauthorized={undefined}>
                       <RedirectBoundary>
                         <RedirectErrorBoundary router={{...}}>
                           <InnerLayoutRouter url="/hydration..." tree={[...]} params={{}} cacheNode={{lazyData:null, ...}} ...>
                             <SegmentViewNode type="page" pagePath="hydration-...">
                               <SegmentTrieNode>
                               <ClientPageRoot Component={function Page} serverProvidedParams={null}>
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
           "source": "app/hydration-with-runtime-errors/page.tsx (12:14) @ Page
       > 12 |       sneaky <p>very sneaky</p>
            |              ^",
           "stack": [
             "p <anonymous>",
             "Page app/hydration-with-runtime-errors/page.tsx (12:14)",
           ],
         },
         {
           "description": "Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:",
           "environmentLabel": null,
           "label": "Recoverable Error",
           "source": "app/hydration-with-runtime-errors/page.tsx (12:14) @ Page
       > 12 |       sneaky <p>very sneaky</p>
            |              ^",
           "stack": [
             "p <anonymous>",
             "Page app/hydration-with-runtime-errors/page.tsx (12:14)",
           ],
         },
         {
           "description": "runtime error",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/hydration-with-runtime-errors/page.tsx (7:11) @ Page.useEffect
       >  7 |     throw new Error('runtime error')
            |           ^",
           "stack": [
             "Page.useEffect app/hydration-with-runtime-errors/page.tsx (7:11)",
           ],
         },
       ]
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(
        `"Redbox is already open. Use \`toDisplayRedbox\` instead."`
      )
    }
  })
})
