import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <ul>
      <li>
        {/* Prerendered at build time via generateStaticParams — the prefetch
            receives the concrete version, never a fallback. */}
        <LinkAccordion href="/static-posts/1">
          Static post 1 (concrete)
        </LinkAccordion>
      </li>
      <li>
        {/* Has generateStaticParams (for a different value), so this
            un-enumerated param is upgradeable: the server serves a fallback
            shell on first prefetch, then regenerates the concrete version in
            the background. Used by the recovery test. */}
        <LinkAccordion href="/posts/recovery">
          Post recovery (upgradeable fallback)
        </LinkAccordion>
      </li>
      <li>
        {/* No generateStaticParams — the fallback shell can never be upgraded,
            so the prefetch shell must NOT be flagged as a fallback (no retry). */}
        <LinkAccordion href="/no-static-params/1">
          No static params 1 (non-upgradeable fallback)
        </LinkAccordion>
      </li>
      <li>
        {/* Same upgradeable route as /posts/recovery, but with its own
            un-enumerated param so its ISR entry is independent of the recovery
            test's. Used by the retry-*limit* test, which forces every prefetch
            response to keep returning the fallback so the client retries to
            its cap and then stops. */}
        <LinkAccordion href="/posts/retry-limit">
          Post retry-limit (upgradeable fallback)
        </LinkAccordion>
      </li>
    </ul>
  )
}
