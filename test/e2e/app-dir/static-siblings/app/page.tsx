import Link from 'next/link'
import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main id="home-page">
      <h1>Static Siblings Test</h1>

      <section>
        <h2>About</h2>
        <p>
          This test verifies that when a dynamic route has static siblings at
          the same URL level, the client can correctly navigate to the static
          sibling even after the dynamic route has been visited/prefetched.
        </p>
        <h3>Manual testing instructions</h3>
        <ol>
          <li>Click the checkbox next to a dynamic route to reveal it</li>
          <li>Click the revealed link to navigate to the dynamic route</li>
          <li>Use the browser back button to return to this page</li>
          <li>Click the static sibling link (which has prefetch=false)</li>
          <li>Verify the static sibling page renders, not the dynamic route</li>
        </ol>
        <p>
          The key behavior being tested: when navigating to a URL that matches
          both a dynamic route (e.g., /products/[id]) and a static route (e.g.,
          /products/sale), the static route should take precedence. The route
          tree delivered by the server includes information about static
          siblings to facilitate this behavior.
        </p>
      </section>

      <hr />

      <section id="cross-route-group-test">
        <h2>Cross-Route-Group Siblings</h2>
        <p>/products/sale vs /products/[id] (in different route groups)</p>
        <div>
          <LinkAccordion href="/products/123">
            Dynamic route: /products/123
          </LinkAccordion>
        </div>
        <div>
          <Link href="/products/sale" prefetch={false} id="link-to-sale">
            Static sibling: /products/sale
          </Link>
        </div>
      </section>

      <section id="same-directory-test">
        <h2>Same-Directory Siblings</h2>
        <p>/items/featured vs /items/[id] (in the same directory)</p>
        <div>
          <LinkAccordion href="/items/456">
            Dynamic route: /items/456
          </LinkAccordion>
        </div>
        <div>
          <Link href="/items/featured" prefetch={false} id="link-to-featured">
            Static sibling: /items/featured
          </Link>
        </div>
      </section>

      <section id="parallel-route-test">
        <h2>Parallel Route Siblings</h2>
        <p>/dashboard/settings vs /dashboard/[id] (in @panel parallel route)</p>
        <div>
          <LinkAccordion href="/dashboard/789">
            Dynamic route: /dashboard/789
          </LinkAccordion>
        </div>
        <div>
          <Link
            href="/dashboard/settings"
            prefetch={false}
            id="link-to-settings"
          >
            Static sibling: /dashboard/settings
          </Link>
        </div>
      </section>

      <section id="deeply-nested-test">
        <h2>Deeply Nested Static Siblings</h2>
        <p>
          /categories/electronics/computers/laptops vs /categories/[slug]
          (static sibling with multiple layouts along its path)
        </p>
        <div>
          <LinkAccordion href="/categories/phones">
            Dynamic route: /categories/phones
          </LinkAccordion>
        </div>
        <div>
          <Link
            href="/categories/electronics/computers/laptops"
            prefetch={false}
            id="link-to-laptops"
          >
            Static sibling: /categories/electronics/computers/laptops
          </Link>
        </div>
      </section>
    </main>
  )
}
