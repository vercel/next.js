import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Home</h1>
      <ul>
        <li>
          {/* prefetch={true} + no partial prefetching opt-in => should warn */}
          <LinkAccordion href="/default-route" prefetch={true}>
            /default-route
          </LinkAccordion>
        </li>
        <li>
          {/* prefetch={true} but the route opts into partial prefetching =>
              should NOT warn */}
          <LinkAccordion href="/partial-route" prefetch={true}>
            /partial-route
          </LinkAccordion>
        </li>
        <li>
          {/* default prefetch (not a "full" prefetch) => should NOT warn,
              even though the route has no partial prefetching opt-in */}
          <LinkAccordion href="/control-route">/control-route</LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
