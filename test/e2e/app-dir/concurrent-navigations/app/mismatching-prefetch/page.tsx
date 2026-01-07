import { LinkAccordion } from '../../components/link-accordion'

export default function Page() {
  return (
    <div>
      <p>
        Tests what happens if a navigation resolves to a different route than
        the one that was prefetched.
      </p>
      <div>
        <ul>
          <li>
            <LinkAccordion href="/mismatching-prefetch/dynamic-page/a?mismatch-redirect=./b">
              <code>{`/mismatching-prefetch/dynamic-page/a ──[ redirects to ]──→ /mismatching-prefetch/dynamic-page/b`}</code>
            </LinkAccordion>
          </li>
          <li>
            <LinkAccordion href="/mismatching-prefetch/dynamic-page/a?mismatch-rewrite=./b">
              <code>{`/mismatching-prefetch/dynamic-page/a ──[ rewrites to ]──→ /mismatching-prefetch/dynamic-page/b`}</code>
            </LinkAccordion>
          </li>
        </ul>
      </div>
    </div>
  )
}
