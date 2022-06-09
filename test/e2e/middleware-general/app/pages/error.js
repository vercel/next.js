import Link from 'next/link'

export default function Errors() {
  return (
    <div>
      <Link href="/error-throw?message=refreshed">
        <a id="throw-on-data">Throw on data</a>
      </Link>
    </div>
  )
}
