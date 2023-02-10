import type { Route } from 'next'
import Link from 'next/link'

function Card({ href }: { href: Route | URL }) {
  return (
    <Link href={href}>
      <div>My Card</div>
    </Link>
  )
}

export default function page() {
  const test = 'a/b'

  return (
    <>
      <Card href="/aaa" />
      <Card href="/dashboard" />
      <Link href="/aaa" />
      <Link href="/aaa?q=1" />
      <Link href="/typing" />
      <Link href="/button" />
      <Link href="/buttooon" />
      <Link href="/blog/" />
      <Link href="/blog/a/b" />
      <Link href="/blog/v/w" />
      <Link href="/dashboard/" />
      <Link href="/dashboard/123" />
      <Link href="/dashboard/user" />
      <Link href="/dashboard/user/" />
      <Link href="/dashboard/user/x" />
      <Link href={`/blog/${test}`} />
      <Link href={`/blog/a/${test}`} />
    </>
  )
}
