import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link id="prefetched" href="/items/expected-id">
        Open item
      </Link>
      <Link id="unprefetched" href="/items/another-id" prefetch={false}>
        Open another item
      </Link>
    </>
  )
}
