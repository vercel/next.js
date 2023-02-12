import type { Route } from 'next'
import Link from 'next/link'

function Card<T extends string>({ href }: { href: Route<T> | URL }) {
  return (
    <Link<T> href={href}>
      <div>My Card</div>
    </Link>
  )
}

export default function page() {
  const test = 'a/b'

  const shouldFail = (
    <>
      <Card href="/dashboard" />
      <Card href="/blog/a/b/c/d" />
      <Link href="/typing">test</Link>
      <Link href="/button">test</Link>
      <Link href="/buttooon">test</Link>
      <Link href="/blog/">test</Link>
      <Link href="/blog/v/w/z">test</Link>
      <Link href="/dashboard/">test</Link>
      <Link href={`/blog/a/${test}`}>test</Link>
    </>
  )

  const shouldPass = (
    <>
      <Card href="/aaa" />
      <Link href="/about">test</Link>
      <Link href="/aaa#aaa">test</Link>
      <Link href="/aaa?q=1">test</Link>
      <Link href="/blog/a/b">test</Link>
      <Link href="/blog/v/w">test</Link>
      <Link href="/dashboard/123">test</Link>
      <Link href="/dashboard/user">test</Link>
      <Link href="/dashboard/user/">test</Link>
      <Link href="/dashboard/user/x">test</Link>
      <Link href={`/blog/${test}`}>test</Link>
      <Link href={('/blog/' + test) as Route}>test</Link>
    </>
  )

  return (
    <>
      {shouldFail}
      {shouldPass}
    </>
  )
}
