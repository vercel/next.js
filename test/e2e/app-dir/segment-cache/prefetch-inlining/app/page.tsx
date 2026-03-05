import { LinkAccordion } from '../components/link-accordion'

export default function Home() {
  return (
    <div>
      <h1>Home</h1>
      <ul>
        <li>
          <LinkAccordion href="/shared/a/b/c">Route A</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/shared/a/d/e">Route B</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/shared/a/b/c" id="duplicate-a">
            Route A (duplicate)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic/hello">Dynamic Route</LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
