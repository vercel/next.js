import Link from 'next/link'

export default function FooPage() {
  return (
    <main>
      <p>Foo page (sibling of inner route group)</p>
      <Link href="/suspense-in-root/static/route-group-shared-boundary">
        ./
      </Link>
    </main>
  )
}
