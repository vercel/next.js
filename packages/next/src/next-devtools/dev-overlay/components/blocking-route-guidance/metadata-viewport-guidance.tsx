import { Collapsible } from '../collapsible/collapsible'
import { css } from '../../utils/css'
import {
  DocsLink,
  FixDiff,
  ErrorExplanation,
} from './shared-guidance-components'

const METADATA_DOCS =
  'https://nextjs.org/docs/messages/next-prerender-dynamic-metadata'
const VIEWPORT_DOCS =
  'https://nextjs.org/docs/messages/next-prerender-dynamic-viewport'

const CACHE_METADATA_DIFF = `  export async function generateMetadata() {
+   "use cache"
    const data = await fetch(...)
    return { title: data.title }
  }`

const REMOVE_RUNTIME_METADATA_DIFF = `  // Move the request-time API out of metadata
- import { cookies } from 'next/headers'

  export async function generateMetadata() {
-   const token = (await cookies()).get('token')
-   const data = await fetchWithToken(token)
+   const data = await getCachedData()
    return { title: data.title }
  }`

const MAKE_PAGE_DYNAMIC_DIFF = `  import { Suspense } from 'react'
  import { connection } from 'next/server'

  async function DynamicContent() {
+   await connection()
    return <div>...</div>
  }

  export default function Page() {
    return (
+     <Suspense fallback={<p>Loading...</p>}>
+       <DynamicContent />
+     </Suspense>
    )
  }`

const CACHE_VIEWPORT_DIFF = `  export async function generateViewport() {
+   "use cache"
    const config = await fetch(...)
    return { themeColor: config.color }
  }`

const REMOVE_RUNTIME_VIEWPORT_DIFF = `  export async function generateViewport() {
-   const prefs = await cookies()
+   // Use static values or cached data instead
    return {
-     themeColor: prefs.get('theme') ?? '#fff',
+     themeColor: '#fff',
    }
  }`

const SUSPENSE_BODY_DIFF = `  // app/layout.js
  import { Suspense } from 'react'

  export default function RootLayout({ children }) {
    return (
      <html>
+       <Suspense>
          <body>{children}</body>
+       </Suspense>
      </html>
    )
  }`

type MetadataViewportTarget = 'metadata' | 'viewport'

function MetadataViewportExplanation({
  target,
  variant,
}: {
  target: MetadataViewportTarget
  variant: 'runtime' | 'navigation'
}) {
  const fnName =
    target === 'metadata' ? 'generateMetadata()' : 'generateViewport()'

  return (
    <ErrorExplanation>
      {variant === 'navigation' ? (
        <>
          <p>
            <strong>What happened:</strong> <code>{fnName}</code> depends on
            uncached data, but the rest of the page is fully static. This makes{' '}
            {target === 'metadata' ? 'metadata' : 'viewport configuration'} the
            only dynamic part, so the entire page can&rsquo;t be prerendered.
          </p>
          <p>
            <strong>Expected:</strong> Cache the data with{' '}
            <code>{'"use cache"'}</code>, or mark another part of the page as
            dynamic to confirm this is intentional.
          </p>
        </>
      ) : (
        <>
          <p>
            <strong>What happened:</strong> <code>{fnName}</code> uses a
            request-time API (like <code>cookies()</code> or{' '}
            <code>headers()</code>), but the rest of the page is fully static.
            This makes{' '}
            {target === 'metadata' ? 'metadata' : 'viewport configuration'} the
            only dynamic part, so the entire page can&rsquo;t be prerendered.
          </p>
          <p>
            <strong>Expected:</strong> If the metadata needs request data for
            personalization, make the page explicitly dynamic. Otherwise,
            replace the request-time API with cached data.
          </p>
        </>
      )}
    </ErrorExplanation>
  )
}

export function MetadataViewportGuidance({
  target,
  variant,
}: {
  target: MetadataViewportTarget
  variant: 'runtime' | 'navigation'
}) {
  const docsUrl = target === 'metadata' ? METADATA_DOCS : VIEWPORT_DOCS
  const fnName =
    target === 'metadata' ? 'generateMetadata()' : 'generateViewport()'

  return (
    <div data-nextjs-metadata-viewport-guidance>
      <MetadataViewportExplanation target={target} variant={variant} />

      <div data-nextjs-guidance-fixes>
        {variant === 'navigation' ? (
          <>
            <Collapsible
              title={`Cache the data in ${fnName} with "use cache"`}
              defaultOpen
            >
              <p>
                Add <code>{'"use cache"'}</code> to the function so the data is
                cached and <code>{fnName}</code> can be prerendered.
              </p>
              <FixDiff
                lines={
                  target === 'metadata'
                    ? CACHE_METADATA_DIFF
                    : CACHE_VIEWPORT_DIFF
                }
              />
              <DocsLink href={`${docsUrl}#caching-external-data`}>
                Caching external data
              </DocsLink>
            </Collapsible>

            <Collapsible title="Make the page explicitly dynamic">
              <p>
                {target === 'metadata' ? (
                  <>
                    Add <code>connection()</code> inside a{' '}
                    <code>{'<Suspense>'}</code> boundary somewhere in the page.
                    This tells Next.js the page is intended to be partially
                    dynamic.
                  </>
                ) : (
                  <>
                    Wrap the document <code>{'<body>'}</code> in{' '}
                    <code>{'<Suspense>'}</code> in your root layout. This tells
                    Next.js you accept blocking navigations for all pages.
                  </>
                )}
              </p>
              <FixDiff
                lines={
                  target === 'metadata'
                    ? MAKE_PAGE_DYNAMIC_DIFF
                    : SUSPENSE_BODY_DIFF
                }
              />
              <DocsLink
                href={`${docsUrl}#if-you-must-access-request-data-or-your-external-data-is-uncacheable`}
              >
                Making the page dynamic
              </DocsLink>
            </Collapsible>
          </>
        ) : (
          <>
            <Collapsible title="Make the page explicitly dynamic" defaultOpen>
              <p>
                {target === 'metadata' ? (
                  <>
                    If the metadata needs request data (e.g.{' '}
                    <code>cookies()</code> for personalization), add{' '}
                    <code>connection()</code> inside a{' '}
                    <code>{'<Suspense>'}</code> boundary somewhere in the page.
                    This tells Next.js the page is intended to be partially
                    dynamic, so the static parts still prerender.
                  </>
                ) : (
                  <>
                    Wrap the document <code>{'<body>'}</code> in{' '}
                    <code>{'<Suspense>'}</code> in your root layout. This tells
                    Next.js you accept blocking navigations for all pages.
                  </>
                )}
              </p>
              <FixDiff
                lines={
                  target === 'metadata'
                    ? MAKE_PAGE_DYNAMIC_DIFF
                    : SUSPENSE_BODY_DIFF
                }
              />
              <DocsLink
                href={`${docsUrl}#if-you-must-access-request-data-or-your-external-data-is-uncacheable`}
              >
                Making the page dynamic
              </DocsLink>
            </Collapsible>

            <Collapsible title={`Remove the request-time API from ${fnName}`}>
              <p>
                If the metadata doesn&rsquo;t actually need request data, remove{' '}
                <code>cookies()</code>, <code>headers()</code>, or similar from{' '}
                <code>{fnName}</code> and use cached data or static values
                instead.
              </p>
              <FixDiff
                lines={
                  target === 'metadata'
                    ? REMOVE_RUNTIME_METADATA_DIFF
                    : REMOVE_RUNTIME_VIEWPORT_DIFF
                }
              />
              <DocsLink href={`${docsUrl}#caching-external-data`}>
                Caching external data
              </DocsLink>
            </Collapsible>
          </>
        )}
      </div>
    </div>
  )
}

export const METADATA_VIEWPORT_GUIDANCE_STYLES = css`
  [data-nextjs-metadata-viewport-guidance] {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-gray-alpha-400);
  }
`
