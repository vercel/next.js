'use client'
import type { Route } from 'next'
import Link from 'next/link'

export function Card<T extends string>({ href }: { href: Route<T> | URL }) {
  return (
    <Link href={href}>
      <div>My Card</div>
    </Link>
  )
}

export default function page() {
  const test = 'a/b'

  const shouldFail = (
    <>
      <Card href="/(newroot)/dashboard/another" />
      <Card href="/dashboard" />
      <Card href="/blog/a/b/c/d" />
      <Link href="/typing">test</Link>
      <Link href="/button">test</Link>
      <Link href="/buttooon">test</Link>
      <Link href="/blog/">test</Link>
      <Link href="/blog/a?1/b">test</Link>
      <Link href="/blog/a#1/b">test</Link>
      <Link href="/blog/v/w/z">test</Link>
      <Link href="/(newroot)/dashboard/another" />
      <Link href="/dashboard">test</Link>
      <Link href={`/blog/a/${test}`}>test</Link>
      <Link href="/rewrite-any">test</Link>
      <Link href="/rewrite-one-or-more">test</Link>
      <Link href="/rewrite-param/page">test</Link>
      <Link href="/rewrite-param/x/page1">test</Link>
      <Link href="/redirect/v2/guides/x/page">test</Link>
    </>
  )

  const shouldPass = (
    <>
      <Card href="/dashboard/another" />
      <Card href="/aaa" />
      <Card href="/blog/a/b?1" />
      <Link href="/about">test</Link>
      <Link href="/mdx-test" />
      <Link href="/aaa#aaa">test</Link>
      <Link href="/aaa?q=1">test</Link>
      <Link href="/blog/a/b">test</Link>
      <Link href="/blog/v/w">test</Link>
      <Link href="/dashboard/another" />
      <Link href="/dashboard/123">test</Link>
      <Link href="/dashboard/user">test</Link>
      <Link href="/dashboard/user/">test</Link>
      <Link href="/dashboard/user/x">test</Link>
      <Link href="/dashboard/x/x">test</Link>
      <Link href={`/blog/${test}`}>test</Link>
      <Link href={('/blog/' + test) as Route}>test</Link>
      <Link href="/rewrite">test</Link>
      <Link href="/rewrite-any/x">test</Link>
      <Link href="/rewrite-one-or-more/x/y">test</Link>
      <Link href="/rewrite-all/x/y/z">test</Link>
      <Link href="/rewrite-param/x/page?1">test</Link>
      <Link href="/redirect">test</Link>
      <Link href="/redirect/v1/guides/x/page">test</Link>
      <Link href="/redirect/guides/x/page">test</Link>
      <Link href={new URL('https://nextjs.org')}>test</Link>
      <Link href="https://nextjs.org">test</Link>
      <Link href="http://nextjs.org">test</Link>
      <Link href="#id">test</Link>
      <Link href="?page=1">test</Link>
      <Link href="mailto:foo@example.com">test</Link>
    </>
  )

  return (
    <>
      {shouldFail}
      {shouldPass}
    </>
  )
}
