import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link id="static" href="/items/static" prefetch={false}>
        Static
      </Link>
      <Link id="becomes-partial" href="/items/becomes-partial" prefetch={false}>
        Becomes partial
      </Link>
      <Link id="concurrent" href="/items/concurrent" prefetch={false}>
        Concurrent
      </Link>
    </>
  )
}
