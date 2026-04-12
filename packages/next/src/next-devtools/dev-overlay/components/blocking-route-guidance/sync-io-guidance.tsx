import { Collapsible } from '../collapsible/collapsible'
import { css } from '../../utils/css'
import {
  DocsLink,
  FixDiff,
  ErrorExplanation,
} from './shared-guidance-components'
import type { SyncIOErrorDetails } from './blocking-route-error-details'

const DOCS_MAP = {
  time: 'https://nextjs.org/docs/messages/next-prerender-current-time',
  random: 'https://nextjs.org/docs/messages/next-prerender-random',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-crypto',
} as const

const CLIENT_DOCS_MAP = {
  time: 'https://nextjs.org/docs/messages/next-prerender-current-time-client',
  random: 'https://nextjs.org/docs/messages/next-prerender-random-client',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-crypto-client',
} as const

const API_LABELS = {
  time: 'Date.now() / new Date()',
  random: 'Math.random()',
  crypto: 'crypto.randomUUID() / crypto.getRandomValues()',
} as const

const CLIENT_COMPONENT_DIFF_TIME = `+ "use client"

  export default function Timestamp() {
    return <time>{new Date().toLocaleString()}</time>
  }`

const CLIENT_COMPONENT_DIFF_RANDOM = `+ "use client"

  export default function RandomValue() {
    const value = Math.random()
    return <span>{value}</span>
  }`

const CLIENT_COMPONENT_DIFF_CRYPTO = `+ "use client"

  export default function UniqueToken() {
    const token = crypto.randomUUID()
    return <span>{token}</span>
  }`

const CACHE_DIFF_TIME = `  async function getServerTime() {
+   "use cache"
+   cacheLife("seconds")
    return new Date().toISOString()
  }`

const CACHE_DIFF_RANDOM = `  async function generateSeed() {
+   "use cache"
+   cacheLife("hours")
    return Math.random()
  }`

const CACHE_DIFF_CRYPTO = `  async function generateToken() {
+   "use cache"
+   cacheLife("hours")
    return crypto.randomUUID()
  }`

const CONNECTION_DIFF_TIME = `  import { connection } from 'next/server'

  export default async function Page() {
+   await connection()
    const value = Date.now()
    return <p>{value}</p>
  }`

const CONNECTION_DIFF_RANDOM = `  import { connection } from 'next/server'

  export default async function Page() {
+   await connection()
    const value = Math.random()
    return <p>{value}</p>
  }`

const CONNECTION_DIFF_CRYPTO = `  import { connection } from 'next/server'

  export default async function Page() {
+   await connection()
    const token = crypto.randomUUID()
    return <p>{token}</p>
  }`

const PERFORMANCE_NOW_DIFF = `  // For measuring elapsed time, use performance.now()
- const start = Date.now()
+ const start = performance.now()
  doExpensiveWork()
- const elapsed = Date.now() - start
+ const elapsed = performance.now() - start`

const CLIENT_SUSPENSE_DIFF = `  import { Suspense } from 'react'
  import { MyClientComponent } from './my-client-component'

  export default function Page() {
    return (
+     <Suspense fallback={<p>Loading...</p>}>
+       <MyClientComponent />
+     </Suspense>
    )
  }`

function SyncIOExplanation({
  apiType,
  context,
}: {
  apiType: SyncIOErrorDetails['apiType']
  context: SyncIOErrorDetails['context']
}) {
  const label = API_LABELS[apiType]

  return (
    <ErrorExplanation>
      {context === 'server' ? (
        <>
          <p>
            <strong>What happened:</strong> <code>{label}</code> was called
            before any uncached data or request-time API. Next.js can&rsquo;t
            determine whether this value should be prerendered or evaluated
            per-request.
          </p>
          <p>
            <strong>Expected:</strong> Access uncached data or{' '}
            <code>connection()</code> first, cache the result with{' '}
            <code>{'"use cache"'}</code>, or move it to a Client Component.
          </p>
        </>
      ) : (
        <>
          <p>
            <strong>What happened:</strong> <code>{label}</code> was used in a
            Client Component without a <code>{'<Suspense>'}</code> boundary
            above it. Next.js can&rsquo;t prerender this component.
          </p>
          <p>
            <strong>Expected:</strong> Add a <code>{'<Suspense>'}</code>{' '}
            boundary above the component so the rest of the page can be
            prerendered.
          </p>
        </>
      )}
    </ErrorExplanation>
  )
}

function ServerFixes({ apiType }: { apiType: SyncIOErrorDetails['apiType'] }) {
  const docsUrl = DOCS_MAP[apiType]

  const clientDiff =
    apiType === 'time'
      ? CLIENT_COMPONENT_DIFF_TIME
      : apiType === 'random'
        ? CLIENT_COMPONENT_DIFF_RANDOM
        : CLIENT_COMPONENT_DIFF_CRYPTO

  const cacheDiff =
    apiType === 'time'
      ? CACHE_DIFF_TIME
      : apiType === 'random'
        ? CACHE_DIFF_RANDOM
        : CACHE_DIFF_CRYPTO

  const connectionDiff =
    apiType === 'time'
      ? CONNECTION_DIFF_TIME
      : apiType === 'random'
        ? CONNECTION_DIFF_RANDOM
        : CONNECTION_DIFF_CRYPTO

  const clientComponentAnchor =
    apiType === 'time' ? '#moving-time-to-the-client' : ''

  const cacheDocsAnchor =
    apiType === 'time'
      ? '#cacheable-use-cases'
      : apiType === 'random'
        ? '#cache-the-random-value'
        : '#cache-the-token-value'

  const connectionAnchor =
    apiType === 'time'
      ? '#guarding-the-time-with-await-connection'
      : apiType === 'random'
        ? '#indicate-the-random-value-is-unique-per-request'
        : '#use-await-connection-at-request-time'

  return (
    <>
      <Collapsible title="Move to a Client Component" defaultOpen>
        <p>
          {apiType === 'time'
            ? 'Timestamps and formatted dates often belong in the client where they can use the user\u2019s timezone.'
            : 'If this value is only needed for display, move it to a Client Component so it runs in the browser.'}
        </p>
        <FixDiff lines={clientDiff} />
        <DocsLink href={`${docsUrl}${clientComponentAnchor}`}>
          Learn more
        </DocsLink>
      </Collapsible>

      <Collapsible title={'Cache the result with "use cache"'}>
        <p>
          If the value can be prerendered and doesn&rsquo;t need to change
          per-request, cache it so Next.js can include it in the static HTML.
        </p>
        <FixDiff lines={cacheDiff} />
        <DocsLink href={`${docsUrl}${cacheDocsAnchor}`}>Learn more</DocsLink>
      </Collapsible>

      <Collapsible title="Guard with await connection()">
        <p>
          If the value must be evaluated per-request on the server, call{' '}
          <code>await connection()</code> first to signal that this component is
          intentionally dynamic.
        </p>
        <FixDiff lines={connectionDiff} />
        <DocsLink href={`${docsUrl}${connectionAnchor}`}>Learn more</DocsLink>
      </Collapsible>

      {apiType === 'time' && (
        <Collapsible title="Use performance.now() for measurements">
          <p>
            If you&rsquo;re measuring elapsed time rather than displaying the
            current time, <code>performance.now()</code> is safe during
            prerendering.
          </p>
          <FixDiff lines={PERFORMANCE_NOW_DIFF} />
          <DocsLink href={`${docsUrl}#performance-use-case`}>
            Learn more
          </DocsLink>
        </Collapsible>
      )}
    </>
  )
}

function ClientFixes({ apiType }: { apiType: SyncIOErrorDetails['apiType'] }) {
  const docsUrl = CLIENT_DOCS_MAP[apiType]

  return (
    <Collapsible title="Add a <Suspense> boundary" defaultOpen>
      <p>
        Wrap the Client Component in <code>{'<Suspense>'}</code> so the rest of
        the page can be prerendered while this component renders on the client.
      </p>
      <FixDiff lines={CLIENT_SUSPENSE_DIFF} />
      <DocsLink href={`${docsUrl}#provide-fallback-ui`}>Learn more</DocsLink>
    </Collapsible>
  )
}

export function SyncIOGuidance({
  apiType,
  context,
}: {
  apiType: SyncIOErrorDetails['apiType']
  context: SyncIOErrorDetails['context']
}) {
  return (
    <div data-nextjs-sync-io-guidance>
      <SyncIOExplanation apiType={apiType} context={context} />

      <div data-nextjs-guidance-fixes>
        {context === 'server' ? (
          <ServerFixes apiType={apiType} />
        ) : (
          <ClientFixes apiType={apiType} />
        )}
      </div>
    </div>
  )
}

export const SYNC_IO_GUIDANCE_STYLES = css`
  [data-nextjs-sync-io-guidance] {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-gray-alpha-400);
  }
`
