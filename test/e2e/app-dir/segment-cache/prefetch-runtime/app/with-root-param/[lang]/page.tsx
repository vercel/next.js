import { lang } from 'next/root-params'
import { DebugLinkAccordion } from '../../../components/link-accordion'

export default async function Page() {
  const currentLang = await lang()
  const otherLang = currentLang === 'en' ? 'de' : 'en'
  return (
    <main>
      <h1>Home - with root param ({currentLang})</h1>

      <h2>directly in a page</h2>
      <ul>
        <li>
          root params + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion
                href={`/with-root-param/${currentLang}/in-page/root-params`}
              />
            </li>
            <li>
              <DebugLinkAccordion
                href={`/with-root-param/${otherLang}/in-page/root-params`}
              />
            </li>
          </ul>
        </li>
      </ul>

      <h2>
        <code>use cache: private</code>
      </h2>
      <ul>
        <li>
          root params + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion
                href={`/with-root-param/${currentLang}/in-private-cache/root-params`}
              />
            </li>
            <li>
              <DebugLinkAccordion
                href={`/with-root-param/${otherLang}/in-private-cache/root-params`}
              />
            </li>
          </ul>
        </li>
      </ul>

      <h2>
        <code>promise passed to public cache</code>
      </h2>
      <ul>
        <li>
          root params + dynamic content
          <ul>
            <li>
              <DebugLinkAccordion
                href={`/with-root-param/${currentLang}/passed-to-public-cache/root-params`}
              />
            </li>
            <li>
              <DebugLinkAccordion
                href={`/with-root-param/${otherLang}/passed-to-public-cache/root-params`}
              />
            </li>
          </ul>
        </li>
      </ul>
    </main>
  )
}
