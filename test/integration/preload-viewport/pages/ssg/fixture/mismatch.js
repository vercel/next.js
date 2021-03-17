import Link from 'next/link'

export default () => (
  <main>
    <h1>Mismatched SSG Data Prefetch Fixtures</h1>
    <p>
      <Link href="/ssg/dynamic/[slug]?slug=one" as="/ssg/fixture/mismatch">
        <a>Dynamic Route (one level) — Prerendered</a>
      </Link>
      : this is a Dynamic Page with a single dynamic segment that{' '}
      <strong>was returned</strong> from <code>getStaticPaths</code>.<br />
      <Link href="/ssg/dynamic/[slug]?slug=two" as="/ssg/fixture/mismatch">
        <a>Dynamic Route (one level) — Not Prerendered</a>
      </Link>
      : this is a Dynamic Page with a single dynamic segment that{' '}
      <strong>was not returned</strong> from <code>getStaticPaths</code>.
    </p>
    <p>
      <Link
        href={{
          pathname: '/ssg/dynamic-nested/[slug1]/[slug2]',
          query: { slug1: 'one', slug2: 'two' },
        }}
        as="/ssg/fixture/mismatch"
      >
        <a>Multi Dynamic Route (two levels) — Prerendered</a>
      </Link>
      : this is a Dynamic Page with two dynamic segments that{' '}
      <strong>were returned</strong> from <code>getStaticPaths</code>.<br />
      <Link
        href={{
          pathname: '/ssg/dynamic-nested/[slug1]/[slug2]',
          query: { slug1: 'foo', slug2: 'bar' },
        }}
        as="/ssg/fixture/mismatch"
      >
        <a>Multi Dynamic Route (two levels) — Not Prerendered</a>
      </Link>
      : this is a Dynamic Page with two dynamic segments that{' '}
      <strong>were not returned</strong> from <code>getStaticPaths</code>.
    </p>
    <p>
      <Link
        href={{
          pathname: '/ssg/catch-all/[...slug]',
          query: { slug: ['one'] },
        }}
        as="/ssg/fixture/mismatch"
      >
        <a>Catch-All Route (one level) — Prerendered</a>
      </Link>
      : this is a Catch-All Page with one segment that{' '}
      <strong>was returned</strong> from <code>getStaticPaths</code>.<br />
      <Link
        href={{
          pathname: '/ssg/catch-all/[...slug]',
          query: { slug: ['foo'] },
        }}
        as="/ssg/fixture/mismatch"
      >
        <a>Catch-All Route (one level) — Not Prerendered</a>
      </Link>
      : this is a Catch-All Page with one segment that{' '}
      <strong>was not returned</strong> from <code>getStaticPaths</code>.<br />
      <Link
        href={{
          pathname: '/ssg/catch-all/[...slug]',
          query: { slug: ['one', 'two'] },
        }}
        as="/ssg/fixture/mismatch"
      >
        <a>Catch-All Route (two levels) — Prerendered</a>
      </Link>
      : this is a Catch-All Page with two segments that{' '}
      <strong>were returned</strong> from <code>getStaticPaths</code>.<br />
      <Link
        href={{
          pathname: '/ssg/catch-all/[...slug]',
          query: { slug: ['foo', 'bar'] },
        }}
        as="/ssg/fixture/mismatch"
      >
        <a>Catch-All Route (two levels) — Not Prerendered</a>
      </Link>
      : this is a Catch-All Page with two segments that{' '}
      <strong>were not returned</strong> from <code>getStaticPaths</code>.
    </p>
  </main>
)
