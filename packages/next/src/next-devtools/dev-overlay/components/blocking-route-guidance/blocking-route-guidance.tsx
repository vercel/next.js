import { Collapsible } from '../collapsible/collapsible'
import { css } from '../../utils/css'
import {
  DocsLink,
  FixDiff,
  ErrorExplanation,
} from './shared-guidance-components'

const DOCS = 'https://nextjs.org/docs/messages/blocking-route'

function BlockingRouteExplanation({
  variant,
}: {
  variant: 'runtime' | 'navigation'
}) {
  return (
    <ErrorExplanation>
      {variant === 'runtime' ? (
        <>
          <p>
            <strong>What happened:</strong> A request-time API was called
            without a surrounding <code>{'<Suspense>'}</code> boundary. Next.js
            can&rsquo;t prerender any part of this page, so every navigation
            waits for a full server round-trip.
          </p>
          <p>
            <strong>Expected:</strong> Components that access request-time data
            are wrapped in <code>{'<Suspense>'}</code> so Next.js can prerender
            a static shell and stream the dynamic parts in.
          </p>
        </>
      ) : (
        <>
          <p>
            <strong>What happened:</strong> Data that isn&rsquo;t cached was
            accessed without a surrounding <code>{'<Suspense>'}</code> boundary.
            Next.js can&rsquo;t prerender any part of this page, so every
            navigation waits for the data to load.
          </p>
          <p>
            <strong>Expected:</strong> Data is cached with{' '}
            <code>{'"use cache"'}</code> so the page can be prerendered, or
            wrapped in <code>{'<Suspense>'}</code> so the static parts load
            instantly.
          </p>
        </>
      )}
    </ErrorExplanation>
  )
}

const SUSPENSE_WRAP_DIFF = `  import { Suspense } from 'react'

  export default function Page() {
    return (
      <div>
        <h1>Dashboard</h1>
+       <Suspense fallback={<p>Loading...</p>}>
+         <MyComponent />
+       </Suspense>
      </div>
    )
  }`

const MOVE_INTO_CHILD_DIFF = `  // Move cookies() into the child component
  // so it suspends independently

- import { cookies } from 'next/headers'

  export default function Page() {
-   const token = (await cookies()).get('token')
    return (
      <Suspense fallback="Loading...">
-       <Inbox token={token} />
+       <Inbox />
      </Suspense>
    )
  }`

const LOADING_JS_DIFF = `  // app/dashboard/loading.js
+ export default function Loading() {
+   return <p>Loading...</p>
+ }`

const PARAMS_DIFF = `  import { Suspense } from 'react'

  export default function Page({ params }) {
    return (
      <div>
        <Breadcrumbs />
+       <Suspense fallback={<p>Loading...</p>}>
+         <ProductDetails params={params} />
+       </Suspense>
      </div>
    )
  }

+ async function ProductDetails({ params }) {
+   const { id } = await params
+   return <h1>{product.name}</h1>
+ }`

const USE_CACHE_DIFF = `  async function getArticles() {
+   "use cache"
+   cacheTag("articles")
+   cacheLife("hours")
    return db.query(...)
  }`

const STREAM_WITH_SUSPENSE_DIFF = `  import { Suspense } from 'react'

  export default function Page() {
    return (
+     <Suspense fallback={<Skeleton />}>
+       <TransactionList />
+     </Suspense>
    )
  }`

const SHORT_LIVED_CACHE_DIFF = `  async function getData() {
    "use cache"
-   cacheLife("seconds")
+   cacheLife("minutes")
    return db.query(...)
  }`

export function BlockingRouteGuidance({
  variant,
}: {
  variant: 'runtime' | 'navigation'
}) {
  return (
    <div data-nextjs-blocking-route-guidance>
      <BlockingRouteExplanation variant={variant} />

      {variant === 'runtime' ? (
        <div data-nextjs-guidance-fixes>
          <Collapsible title="Wrap the component in <Suspense>" defaultOpen>
            <p>
              Move the dynamic part into its own component and wrap it in{' '}
              <code>{'<Suspense>'}</code>. Everything outside the boundary is
              prerendered as a static shell.
            </p>
            <FixDiff lines={SUSPENSE_WRAP_DIFF} />
            <DocsLink href={`${DOCS}#wrap-in-suspense`}>
              Wrap in Suspense
            </DocsLink>
          </Collapsible>

          <Collapsible title="Move the API call into a child component">
            <p>
              If you call <code>cookies()</code>, <code>headers()</code>, or
              similar in a parent, move it into the child that actually needs
              it. This keeps the parent prerenderable.
            </p>
            <FixDiff lines={MOVE_INTO_CHILD_DIFF} />
            <DocsLink href={`${DOCS}#move-the-access-into-a-child`}>
              Move the access into a child
            </DocsLink>
          </Collapsible>

          <Collapsible title="Using params or searchParams?">
            <p>
              Pass the params promise to a child component wrapped in{' '}
              <code>{'<Suspense>'}</code> and await it there. Use{' '}
              <code>generateStaticParams</code> to prerender known values at
              build time.
            </p>
            <FixDiff lines={PARAMS_DIFF} />
            <DocsLink href={`${DOCS}#params-and-searchparams`}>
              Params and searchParams
            </DocsLink>
          </Collapsible>

          <Collapsible title="Add a loading.js file">
            <p>
              The simplest fix. The whole page shows a loading state while data
              loads, but you lose granular control over what streams when.
            </p>
            <FixDiff lines={LOADING_JS_DIFF} />
            <DocsLink href={`${DOCS}#add-a-loadingjs-file`}>
              Add a loading.js file
            </DocsLink>
          </Collapsible>
        </div>
      ) : (
        <div data-nextjs-guidance-fixes>
          <Collapsible title={'Cache the data with "use cache"'} defaultOpen>
            <p>
              The page can be prerendered and served from a CDN. Use{' '}
              <code>cacheTag()</code> to revalidate when data changes.
            </p>
            <FixDiff lines={USE_CACHE_DIFF} />
            <DocsLink href={`${DOCS}#cache-data-with-use-cache`}>
              Cache data with &ldquo;use cache&rdquo;
            </DocsLink>
          </Collapsible>

          <Collapsible title="Stream it with <Suspense>">
            <p>
              If the data is personalized or real-time, wrap the component in{' '}
              <code>{'<Suspense>'}</code>. The static parts load instantly and
              the dynamic part streams in.
            </p>
            <FixDiff lines={STREAM_WITH_SUSPENSE_DIFF} />
            <DocsLink href={`${DOCS}#stream-dynamic-data`}>
              Stream dynamic data
            </DocsLink>
          </Collapsible>

          <Collapsible title="Use a longer cache lifetime">
            <p>
              If your cache is too short-lived (e.g.{' '}
              <code>{'cacheLife("seconds")'}</code>), Next.js won&rsquo;t
              prerender it. A slightly longer lifetime lets the page prerender.
            </p>
            <FixDiff lines={SHORT_LIVED_CACHE_DIFF} />
            <DocsLink href={`${DOCS}#short-lived-caches`}>
              Short-lived caches
            </DocsLink>
          </Collapsible>
        </div>
      )}
    </div>
  )
}

export const BLOCKING_ROUTE_GUIDANCE_STYLES = css`
  [data-nextjs-blocking-route-guidance] {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-gray-alpha-400);
  }
`
