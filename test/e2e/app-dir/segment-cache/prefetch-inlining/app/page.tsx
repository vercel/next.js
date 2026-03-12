import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <div>
      <h1 id="home">Home</h1>
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
      </ul>
    </div>
  )
}
