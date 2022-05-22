import Link from 'next/link'

export default function Errors() {
  return (
    <div>
      <Link href="/error-throw?message=refreshed">
        <a id="throw-on-preflight">Throw on preflight</a>
      </Link>
    </div>
  )
}
