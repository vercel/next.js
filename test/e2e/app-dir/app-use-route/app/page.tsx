import { RouteDisplay } from './components/route-display'
import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1>useRoute() Test Home</h1>
      <RouteDisplay testId="root-page" />

      <h2>Test Routes</h2>
      <nav>
        <ul>
          <li>
            <Link href="/about" id="link-about">
              Static: /about
            </Link>
          </li>
          <li>
            <Link href="/settings" id="link-settings">
              Route Group: /(app)/(dashboard)/settings
            </Link>
          </li>
          <li>
            <Link href="/blog/my-post" id="link-blog-post">
              Dynamic: /blog/[slug]
            </Link>
          </li>
          <li>
            <Link href="/docs/api/reference" id="link-docs">
              Catch-all: /docs/[...slug]
            </Link>
          </li>
          <li>
            <Link href="/wiki/advanced/routing" id="link-optional-catchall">
              Optional Catch-all: /wiki/[[...segments]]
            </Link>
          </li>
          <li>
            <Link href="/gallery/123" id="link-gallery">
              Parallel + Interception: /gallery/@modal/(group)/(.)[id]
            </Link>
          </li>
          <li>
            <Link href="/feed/photo/123" id="link-feed-photo">
              Interception: /feed/@modal/(.)photo/[id]
            </Link>
          </li>
          <li>
            <Link href="/app/dashboard/stats/line" id="link-nested-parallel">
              Nested Parallel: /app/dashboard/@panel/stats/@chart/line
            </Link>
          </li>
          <li>
            <Link href="/shop/electronics/laptop" id="link-shop">
              Dynamic + Route Groups: /(shop)/[category]/[product]
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  )
}
