import { Suspense } from 'react'
import { DebugLinkAccordion } from '../components/link-accordion'
import { io } from 'next/cache'

type SearchParams = { unique?: string }
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Inner searchParams={searchParams} />
    </Suspense>
  )
}

async function Inner({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await io()
  const unique =
    (await searchParams).unique ?? (await io().then(() => Date.now()))

  const slugWithUnique = (slug: string) => `${slug}_u${unique}`
  const linkForSlug = (slug: string) => `/static-for-some-params/${slug}`

  return (
    <main>
      <div>
        Current unique seed: {unique} (
        <a href={`/unique=${unique}`}>Permalink</a>)
      </div>

      <h2>Prerendered, did not use cookies</h2>
      <ul>
        <li>
          <DebugLinkAccordion
            href={linkForSlug('no-cookies')}
            prefetch={true}
          />
        </li>
      </ul>

      <h2>Prerendered, did use cookies</h2>
      <ul>
        <li>
          <DebugLinkAccordion
            href={linkForSlug('yes-cookies')}
            prefetch="auto"
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={linkForSlug('yes-cookies')}
            prefetch={true}
          />
        </li>
      </ul>

      <h2>Not prerendered, did not use cookies</h2>
      <ul>
        <li>
          <DebugLinkAccordion
            href={linkForSlug(slugWithUnique('not-prerendered_no-cookies'))}
            prefetch="auto"
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={linkForSlug(slugWithUnique('not-prerendered_no-cookies'))}
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={
              linkForSlug(
                slugWithUnique('not-prerendered_no-cookies_es-shell')
              ) + '/ensure-static/shell'
            }
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={
              linkForSlug(
                slugWithUnique('not-prerendered_no-cookies_es-prefetch')
              ) + '/ensure-static/prefetch'
            }
            prefetch={true}
          />
        </li>
      </ul>

      <h2>Not prerendered, did use cookies</h2>

      <h3>Without ensureStatic</h3>
      <ul>
        <li>
          <DebugLinkAccordion
            href={linkForSlug(slugWithUnique('not-prerendered_yes-cookies'))}
            prefetch="auto"
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={linkForSlug(slugWithUnique('not-prerendered_yes-cookies'))}
            prefetch={true}
          />
        </li>
      </ul>
      <h3>with ensureStatic = "shell"</h3>
      <ul>
        <li>
          <DebugLinkAccordion
            href={
              linkForSlug(
                slugWithUnique('not-prerendered_yes-cookies_es-shell')
              ) + '/ensure-static/shell'
            }
            prefetch={true}
          />
        </li>
      </ul>
      <h3>with ensureStatic = "prefetch"</h3>
      <ul>
        <li>
          <DebugLinkAccordion
            href={
              linkForSlug(`not-prerendered_yes-cookies_es-prefetch`) +
              '/ensure-static/prefetch'
            }
            prefetch={true}
          />
        </li>
      </ul>
    </main>
  )
}
