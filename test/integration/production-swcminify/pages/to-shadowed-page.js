import Link from 'next/link'

export default function ToShadowed() {
  return (
    <div id="shadowed-page-gateway">
      <Link href="/shadowed-page" id="to-shadowed-page">
        Shadowed Page
      </Link>
    </div>
  )
}
