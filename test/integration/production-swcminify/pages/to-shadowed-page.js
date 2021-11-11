import Link from 'next/link'

export default function ToShadowed() {
  return (
    <div id="shadowed-page-gateway">
      <Link href="/shadowed-page">
        <a id="to-shadowed-page">Shadowed Page</a>
      </Link>
    </div>
  )
}
