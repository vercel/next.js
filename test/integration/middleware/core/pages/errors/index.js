import Link from 'next/link'

export default function Errors() {
  return (
    <div>
      <Link href="/errors/throw-on-preflight?message=refreshed">
        <a id="throw-on-preflight">Throw on preflight</a>
      </Link>
    </div>
  )
}
