import Link from 'next/link'

export default function Index() {
  return (
    <div>
      <Link href="/asset">
        <a id="go-asset">Asset</a>
      </Link>
    </div>
  )
}
