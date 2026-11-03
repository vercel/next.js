import Link from 'next/link'

export default function Page() {
  return (
    <Link id="static" href="/items/static" prefetch={false}>
      Static
    </Link>
  )
}
