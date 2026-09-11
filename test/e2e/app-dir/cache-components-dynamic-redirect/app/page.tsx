import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p id="home">home</p>
      <Link id="to-redirect-blocking" href="/redirect-blocking">
        /redirect-blocking
      </Link>
      <Link id="to-redirect-suspense" href="/redirect-suspense">
        /redirect-suspense
      </Link>
    </div>
  )
}
