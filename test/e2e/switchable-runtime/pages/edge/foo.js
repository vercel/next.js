import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/edge/123">to /edge/[id]</Link>
    </div>
  )
}

export const config = {
  runtime: 'experimental-edge',
}
