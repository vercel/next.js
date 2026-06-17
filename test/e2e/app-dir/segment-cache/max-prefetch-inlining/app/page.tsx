// Test fixture for max prefetch inlining. With Infinity thresholds, all
// segments are bundled into a single response per route, similar to how
// prefetching worked before the Segment Cache (pre-Next 16).
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
