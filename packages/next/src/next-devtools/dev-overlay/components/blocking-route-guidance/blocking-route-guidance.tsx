import { Collapsible } from '../collapsible/collapsible'
import { css } from '../../utils/css'

const DOCS = 'https://nextjs.org/docs/messages/blocking-route'

function DocsLink({ hash, children }: { hash: string; children: string }) {
  return (
    <a data-nextjs-guidance-fix-link href={`${DOCS}#${hash}`}>
      {children} &rarr;
    </a>
  )
}

export function BlockingRouteGuidance({
  variant,
}: {
  variant: 'runtime' | 'navigation'
}) {
  return (
    <div data-nextjs-blocking-route-guidance>
      <p data-nextjs-guidance-prompt>Which fix is right for you?</p>

      <div data-nextjs-guidance-fixes>
        {variant === 'runtime' ? (
          <>
            <Collapsible title="I want the rest of the page to load instantly">
              <p>
                Wrap the component that uses this data in{' '}
                <code>{'<Suspense fallback={...}>'}</code>. The page shell will
                be prerendered and this part will stream in after.
              </p>
              <DocsLink hash="headers">See example</DocsLink>
            </Collapsible>

            <Collapsible title="I can move this into a smaller component">
              <p>
                Move this into a child component and wrap only that child in{' '}
                <code>{'<Suspense>'}</code>. Everything outside the boundary
                stays prerendered.
              </p>
              <DocsLink hash="headers">See example</DocsLink>
            </Collapsible>

            <Collapsible title="I'm using params or searchParams">
              <p>
                Pass the params promise to a child component wrapped in{' '}
                <code>{'<Suspense>'}</code> and await it there, or add a{' '}
                <code>loading.js</code> file. Use{' '}
                <code>generateStaticParams</code> to prerender known values at
                build time.
              </p>
              <DocsLink hash="params-and-searchparams">See example</DocsLink>
            </Collapsible>

            <Collapsible title="I just want the simplest fix">
              <p>
                Add a <code>loading.js</code> file to this route segment. The
                whole page will show a loading state while the data loads.
              </p>
              <DocsLink hash="possible-ways-to-fix-it">Learn more</DocsLink>
            </Collapsible>
          </>
        ) : (
          <>
            <Collapsible title="This data doesn't change often">
              <p>
                Add <code>{'"use cache"'}</code> to the data-fetching function
                so the page can be prerendered and served from a CDN. Use{' '}
                <code>cacheTag()</code> to revalidate when data changes.
              </p>
              <DocsLink hash="accessing-data">See example</DocsLink>
            </Collapsible>

            <Collapsible title="This data is personalized or real-time">
              <p>
                Wrap the component in <code>{'<Suspense fallback={...}>'}</code>
                . The page shell loads instantly and the dynamic part streams
                in.
              </p>
              <DocsLink hash="accessing-data">See example</DocsLink>
            </Collapsible>

            <Collapsible title="This data can be slightly stale">
              <p>
                Add <code>{'"use cache"'}</code> with a short{' '}
                <code>{'cacheLife("minutes")'}</code>. Even a brief cache lets
                the page prerender and the client router can reuse it.
              </p>
              <DocsLink hash="short-lived-caches">See example</DocsLink>
            </Collapsible>
          </>
        )}
      </div>
    </div>
  )
}

export const BLOCKING_ROUTE_GUIDANCE_STYLES = css`
  [data-nextjs-blocking-route-guidance] {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-gray-alpha-400);
  }

  [data-nextjs-guidance-prompt] {
    margin: 0 0 8px;
    color: var(--color-gray-1000);
    font-size: var(--size-14);
    font-weight: 600;
    line-height: var(--size-20);
  }

  [data-nextjs-guidance-fixes] {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  a[data-nextjs-guidance-fix-link] {
    display: inline-block;
    margin-top: 8px;
    color: var(--color-blue-900, #0070f3);
    font-size: var(--size-13);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`
