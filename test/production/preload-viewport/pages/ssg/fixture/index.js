import Link from 'next/link'

export default () => (
  <main>
    <h1>SSG Data Prefetch Fixtures</h1>
    <p>
      <Link href="/ssg/basic">Non-dynamic route</Link>: this is a normal Next.js
      page that does not use dynamic routing.
    </p>
    <p>
      <Link href="/ssg/dynamic/[slug]" as="/ssg/dynamic/one">
        Dynamic Route (one level) — Prerendered
      </Link>
      : this is a Dynamic Page with a single dynamic segment that{' '}
      <strong>was returned</strong> from <code>getStaticPaths</code>.<br />
      <Link href="/ssg/dynamic/[slug]" as="/ssg/dynamic/two">
        Dynamic Route (one level) — Not Prerendered
      </Link>
      : this is a Dynamic Page with a single dynamic segment that{' '}
      <strong>was not returned</strong> from <code>getStaticPaths</code>.
    </p>
    <p>
      <Link
        href="/ssg/dynamic-nested/[slug1]/[slug2]"
        as="/ssg/dynamic-nested/one/two"
      >
        Multi Dynamic Route (two levels) — Prerendered
      </Link>
      : this is a Dynamic Page with two dynamic segments that{' '}
      <strong>were returned</strong> from <code>getStaticPaths</code>.<br />
      <Link
        href="/ssg/dynamic-nested/[slug1]/[slug2]"
        as="/ssg/dynamic-nested/foo/bar"
      >
        Multi Dynamic Route (two levels) — Not Prerendered
      </Link>
      : this is a Dynamic Page with two dynamic segments that{' '}
      <strong>were not returned</strong> from <code>getStaticPaths</code>.
    </p>
    <p>
      <Link href="/ssg/catch-all/[...slug]" as="/ssg/catch-all/one">
        Catch-All Route (one level) — Prerendered
      </Link>
      : this is a Catch-All Page with one segment that{' '}
      <strong>was returned</strong> from <code>getStaticPaths</code>.<br />
      <Link href="/ssg/catch-all/[...slug]" as="/ssg/catch-all/foo">
        Catch-All Route (one level) — Not Prerendered
      </Link>
      : this is a Catch-All Page with one segment that{' '}
      <strong>was not returned</strong> from <code>getStaticPaths</code>.<br />
      <Link href="/ssg/catch-all/[...slug]" as="/ssg/catch-all/one/two">
        Catch-All Route (two levels) — Prerendered
      </Link>
      : this is a Catch-All Page with two segments that{' '}
      <strong>were returned</strong> from <code>getStaticPaths</code>.<br />
      <Link href="/ssg/catch-all/[...slug]" as="/ssg/catch-all/foo/bar">
        Catch-All Route (two levels) — Not Prerendered
      </Link>
      : this is a Catch-All Page with two segments that{' '}
      <strong>were not returned</strong> from <code>getStaticPaths</code>.
    </p>
  </main>
)
