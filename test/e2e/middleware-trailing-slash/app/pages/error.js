import Link from 'next/link'

export default function Errors() {
  return (
    <div>
      <Link href="/error-throw?message=refreshed" id="throw-on-data">
        Throw on data
      </Link>
    </div>
  )
}
