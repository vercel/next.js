import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <div>
      <h1 id="home">Prefetch inlining home</h1>
      <ul>
        <li>
          <LinkAccordion href="/test-small-chain">Small chain</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-deep/a/b/c">Deep chain</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-outlined">Outlined</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-restart/large-middle/after">
            Restart
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-parallel">Parallel</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-dynamic/hello">Dynamic</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-runtime-bailout">
            Runtime bailout
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-stale-hints/nested/deep">
            Stale hints
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-instant-false-root">
            Instant false root
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-runtime-passthrough/inner">
            Runtime passthrough
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-instant-false-passthrough/inner">
            Instant false passthrough
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-runtime-parallel/inner">
            Runtime parallel
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-independent-head/a">
            Independent head A
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-independent-head/b">
            Independent head B
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-not-found/exists">Not found</LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
