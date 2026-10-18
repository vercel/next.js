import { DebugLinkAccordion } from '../components/link-accordion'

export default function Page() {
  const linkForSlug = (slug: string) => `/static-for-some-params/${slug}`
  return (
    <main>
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
            href={linkForSlug('not-prerendered_no-cookies_prefetch-auto')}
            prefetch="auto"
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={linkForSlug('not-prerendered_no-cookies_prefetch-true')}
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={
              linkForSlug('not-prerendered_no-cookies_ensure-static-shell') +
              '/ensure-static/shell'
            }
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={
              linkForSlug('not-prerendered_no-cookies_ensure-static-prefetch') +
              '/ensure-static/prefetch'
            }
            prefetch={true}
          />
        </li>
      </ul>

      <h2>Not prerendered, did use cookies</h2>
      <ul>
        <li>
          <DebugLinkAccordion
            href={linkForSlug('not-prerendered_yes-cookies_prefetch-auto')}
            prefetch="auto"
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={linkForSlug('not-prerendered_yes-cookies_prefetch-true')}
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={
              linkForSlug('not-prerendered_yes-cookies_ensure-static-shell') +
              '/ensure-static/shell'
            }
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href={
              linkForSlug(
                'not-prerendered_yes-cookies_ensure-static-prefetch'
              ) + '/ensure-static/prefetch'
            }
            prefetch={true}
          />
        </li>
      </ul>
    </main>
  )
}
