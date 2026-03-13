import { DebugLinkAccordion } from '../../../components/link-accordion'

export default async function Page() {
  return (
    <main>
      <h1>Errors</h1>

      <h2>thrown errors</h2>
      <ul>
        <li>
          <DebugLinkAccordion href="/errors/error-after-cookies" />
        </li>
      </ul>

      <h2>sync IO</h2>
      <ul>
        <li>
          <DebugLinkAccordion href="/errors/sync-io-after-runtime-api/cookies" />
        </li>
        <li>
          <DebugLinkAccordion href="/errors/sync-io-after-runtime-api/headers" />
        </li>
        <li>
          <DebugLinkAccordion href="/errors/sync-io-after-runtime-api/dynamic-params/123" />
        </li>
        <li>
          <DebugLinkAccordion href="/errors/sync-io-after-runtime-api/search-params?foo=bar" />
        </li>
        <li>
          <DebugLinkAccordion href="/errors/sync-io-after-runtime-api/private-cache" />
        </li>
        <li>
          <DebugLinkAccordion href="/errors/sync-io-after-runtime-api/quickly-expiring-public-cache" />
        </li>
      </ul>
    </main>
  )
}
