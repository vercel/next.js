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
          <LinkAccordion href="/test-stale-hints/nested/deep">
            Stale hints
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/test-instant-false-root">
            Instant false root
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
