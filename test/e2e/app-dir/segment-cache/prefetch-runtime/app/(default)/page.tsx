import { DebugLinkAccordion } from '../../components/link-accordion'

export default async function Page() {
  return (
    <main>
      <h1>Home</h1>

      <h2>directly in a page</h2>
      <ul>
        <li>
          cookies + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/in-page/cookies" />
            </li>
          </ul>
        </li>

        <li>
          headers + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/in-page/headers" />
            </li>
          </ul>
        </li>

        <li>
          search params + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/in-page/search-params?searchParam=123" />
            </li>
            <li>
              <DebugLinkAccordion href="/in-page/search-params?searchParam=456" />
            </li>
          </ul>
        </li>
        <li>
          dynamic params + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/in-page/dynamic-params/123" />
            </li>
            <li>
              <DebugLinkAccordion href="/in-page/dynamic-params/456" />
            </li>
          </ul>
        </li>
        <li>
          only cookies
          <ul>
            <li>
              <DebugLinkAccordion href="/in-page/cookies-only" />
            </li>
          </ul>
        </li>
      </ul>

      <h2>
        <code>use cache: private</code>
      </h2>
      <ul>
        <li>
          cookies in private cache + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/in-private-cache/cookies" />
            </li>
          </ul>
        </li>
        <li>
          headers in private cache + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/in-private-cache/headers" />
            </li>
          </ul>
        </li>
        <li>
          dynamic params in private cache + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/in-private-cache/dynamic-params/123" />
            </li>
            <li>
              <DebugLinkAccordion href="/in-private-cache/dynamic-params/456" />
            </li>
          </ul>
        </li>
        <li>
          search params in private cache + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/in-private-cache/search-params?searchParam=123" />
            </li>
            <li>
              <DebugLinkAccordion href="/in-private-cache/search-params?searchParam=456" />
            </li>
          </ul>
        </li>
        <li>
          only cookies in private cache
          <ul>
            <li>
              <DebugLinkAccordion href="/in-private-cache/cookies-only" />
            </li>
          </ul>
        </li>
        <li>
          Date.now() in private cache
          <ul>
            <li>
              <DebugLinkAccordion href="/in-private-cache/date-now" />
            </li>
          </ul>
        </li>
      </ul>

      <h2>
        <code>runtime promise passed to public cache</code>
      </h2>
      <ul>
        <li>
          cookies() promise passed to public cache + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/passed-to-public-cache/cookies" />
            </li>
          </ul>
        </li>
        <li>
          headers() promise passed to public cache + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/passed-to-public-cache/headers" />
            </li>
          </ul>
        </li>
        <li>
          dynamic params promise passed to public cache + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/passed-to-public-cache/dynamic-params/123" />
            </li>
            <li>
              <DebugLinkAccordion href="/passed-to-public-cache/dynamic-params/456" />
            </li>
          </ul>
        </li>
        <li>
          search params promise passed to public cache + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion href="/passed-to-public-cache/search-params?searchParam=123" />
            </li>
            <li>
              <DebugLinkAccordion href="/passed-to-public-cache/search-params?searchParam=456" />
            </li>
          </ul>
        </li>
        <li>
          only cookies passed to public cache (no dynamic content)
          <ul>
            <li>
              <DebugLinkAccordion href="/passed-to-public-cache/cookies-only" />
            </li>
          </ul>
        </li>
      </ul>

      <h2>short-lived caches</h2>
      <ul>
        <li>
          private, short stale
          <ul>
            <li>
              <DebugLinkAccordion
                href="/caches/private-short-stale"
                prefetch={'auto'}
              />
            </li>
            <li>
              <DebugLinkAccordion
                href="/caches/private-short-stale"
                prefetch={true}
              />
            </li>
          </ul>
        </li>
        <li>
          public, short expire, long enough stale
          <ul>
            <li>
              <DebugLinkAccordion
                href="/caches/public-short-expire-long-stale"
                prefetch={'auto'}
              />
            </li>
            <li>
              <DebugLinkAccordion
                href="/caches/public-short-expire-long-stale"
                prefetch={true}
              />
            </li>
          </ul>
        </li>
        <li>
          public, short expire, short stale
          <ul>
            <li>
              <DebugLinkAccordion
                href="/caches/public-short-expire-short-stale"
                prefetch={'auto'}
              />
            </li>
            <li>
              <DebugLinkAccordion
                href="/caches/public-short-expire-short-stale"
                prefetch={true}
              />
            </li>
          </ul>
        </li>
        <li>
          public, cacheLife("seconds")
          <ul>
            <li>
              <DebugLinkAccordion
                href="/caches/public-seconds"
                prefetch={'auto'}
              />
            </li>
            <li>
              <DebugLinkAccordion
                href="/caches/public-seconds"
                prefetch={true}
              />
            </li>
          </ul>
        </li>
        <li>
          private, cacheLife("seconds")
          <ul>
            <li>
              <DebugLinkAccordion
                href="/caches/private-seconds"
                prefetch={'auto'}
              />
            </li>
            <li>
              <DebugLinkAccordion
                href="/caches/private-seconds"
                prefetch={true}
              />
            </li>
          </ul>
        </li>
      </ul>

      <h2>misc</h2>
      <ul>
        <li>
          <DebugLinkAccordion href="/fully-static" />
        </li>
      </ul>
    </main>
  )
}
