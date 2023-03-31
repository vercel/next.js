import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/suspensey-css/slow" id="slow">
        Go to /slow
      </Link>
      <br />
      <Link href="/suspensey-css/timeout" id="timeout">
        Go to /timeout
      </Link>
    </div>
  )
}
