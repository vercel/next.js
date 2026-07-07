import { LinkAccordion } from '../components/link-accordion'

export default function Home() {
  return (
    <div>
      <h1>Optimistic Routing Test</h1>
      <p>
        This test verifies that route prediction works correctly. When a route
        pattern is learned from one URL, navigating to a different URL with the
        same pattern should show the loading state instantly.
      </p>

      <h2>Basic Dynamic Route</h2>
      <ul>
        <li>
          <LinkAccordion href="/blog/post-1">Blog Post 1</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/blog/post-2" prefetch={false}>
            Blog Post 2 (prefetch disabled)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/blog/post-3" prefetch={false}>
            Blog Post 3 (prefetch disabled)
          </LinkAccordion>
        </li>
      </ul>

      <h2>Nested Dynamic Route</h2>
      <ul>
        <li>
          <LinkAccordion href="/products/electronics/phone-1">
            Electronics - Phone 1
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/products/electronics/phone-2" prefetch={false}>
            Electronics - Phone 2 (prefetch disabled)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/products/clothing/shirt-1" prefetch={false}>
            Clothing - Shirt 1 (prefetch disabled)
          </LinkAccordion>
        </li>
      </ul>

      <h2>Optional Catch-All Route</h2>
      <ul>
        <li>
          <LinkAccordion href="/docs">Docs Index</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/docs/intro">Docs Intro</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/docs/guide/getting-started" prefetch={false}>
            Docs Guide - Getting Started (prefetch disabled)
          </LinkAccordion>
        </li>
      </ul>

      <h2>Required Catch-All Route</h2>
      <ul>
        <li>
          <LinkAccordion href="/files/documents/report.pdf">
            Files - Report
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/files/images/photo.jpg" prefetch={false}>
            Files - Photo (prefetch disabled)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/files/a/b/c/d" prefetch={false}>
            Files - Deep Path (prefetch disabled)
          </LinkAccordion>
        </li>
      </ul>

      <h2>Static Route with Catch-All Sibling</h2>
      <p>
        Tests that navigating to a sub-route of a static path does not
        incorrectly match the catch-all sibling at the parent level.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/dashboard/settings">
            Dashboard Settings (static route, learns pattern)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dashboard/settings/profile" prefetch={false}>
            Profile Settings (sub-route of static, prefetch disabled)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dashboard/anything/here">
            Dashboard Catch-All (learns catch-all pattern)
          </LinkAccordion>
        </li>
      </ul>

      <h2>Static Sibling Detection</h2>
      <ul>
        <li>
          <LinkAccordion href="/blog/featured" prefetch={false}>
            Featured (static sibling, prefetch disabled)
          </LinkAccordion>
        </li>
      </ul>

      <h2>Rewrite Detection (Route Params)</h2>
      <p>
        These URLs are rewritten by proxy to /actual/[slug]. The route should be
        marked as having a dynamic rewrite since the URL doesn&apos;t match the
        route structure.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/rewritten/first">
            Rewritten First (learns pattern, marks as dynamic rewrite)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/rewritten/second" prefetch={false}>
            Rewritten Second (should not use cached pattern)
          </LinkAccordion>
        </li>
      </ul>

      <h2>Rewrite Detection (Search Params)</h2>
      <p>
        These URLs are rewritten based on search params. /search-rewrite?v=X
        becomes /rewrite-target?content=X. Since the page is static, if we
        incorrectly use a cached pattern, we&apos;d show wrong content.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/search-rewrite?v=alpha">
            Search Rewrite Alpha (v=alpha → content=alpha)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/search-rewrite?v=beta" prefetch={false}>
            Search Rewrite Beta (v=beta → content=beta)
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
