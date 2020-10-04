import Link from 'next/link'

export default () => (
  <main>
    <h1>SSG Data Prefetch Fixtures</h1>
    <p>
      <Link href="/ssg/basic">
        <a>Non-dynamic route</a>
      </Link>
      : this is a normal Next.js page that does not use dynamic routing.
    </p>
    <p>
      <Link href="/ssg/dynamic/[slug]" as="/ssg/dynamic/one">
        <a>Dynamic Route (one level) — Prerendered</a>
      </Link>
      : this is a Dynamic Page with a single dynamic segment that{' '}
      <strong>was returned</strong> from <code>getStaticPaths</code>.<br />
      <Link href="/ssg/dynamic/[slug]" as="/ssg/dynamic/two">
        <a>Dynamic Route (one level) — Not Prerendered</a>
      </Link>
      : this is a Dynamic Page with a single dynamic segment that{' '}
      <strong>was not returned</strong> from <code>getStaticPaths</code>.
    </p>
    <p>
      <Link
        href="/ssg/dynamic-nested/[slug1]/[slug2]"
        as="/ssg/dynamic-nested/one/two"
      >
        <a>Multi Dynamic Route (two levels) — Prerendered</a>
      </Link>
      : this is a Dynamic Page with two dynamic segments that{' '}
      <strong>were returned</strong> from <code>getStaticPaths</code>.<br />
      <Link
        href="/ssg/dynamic-nested/[slug1]/[slug2]"
        as="/ssg/dynamic-nested/foo/bar"
      >
        <a>Multi Dynamic Route (two levels) — Not Prerendered</a>
      </Link>
      : this is a Dynamic Page with two dynamic segments that{' '}
      <strong>were not returned</strong> from <code>getStaticPaths</code>.
    </p>
    <p>
      <Link href="/ssg/catch-all/[...slug]" as="/ssg/catch-all/one">
        <a>Catch-All Route (one level) — Prerendered</a>
      </Link>
      : this is a Catch-All Page with one segment that{' '}
      <strong>was returned</strong> from <code>getStaticPaths</code>.<br />
      <Link href="/ssg/catch-all/[...slug]" as="/ssg/catch-all/foo">
        <a>Catch-All Route (one level) — Not Prerendered</a>
      </Link>
      : this is a Catch-All Page with one segment that{' '}
      <strong>was not returned</strong> from <code>getStaticPaths</code>.<br />
      <Link href="/ssg/catch-all/[...slug]" as="/ssg/catch-all/one/two">
        <a>Catch-All Route (two levels) — Prerendered</a>
      </Link>
      : this is a Catch-All Page with two segments that{' '}
      <strong>were returned</strong> from <code>getStaticPaths</code>.<br />
      <Link href="/ssg/catch-all/[...slug]" as="/ssg/catch-all/foo/bar">
        <a>Catch-All Route (two levels) — Not Prerendered</a>
      </Link>
      : this is a Catch-All Page with two segments that{' '}
      <strong>were not returned</strong> from <code>getStaticPaths</code>.
    </p>
  </main>
)
