import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="home">home</p>
      <Link id="to-action" href="/action/123#modal">
        to action
      </Link>
      <Link id="to-prefetch" href="/prefetch/123#modal">
        to prefetch
      </Link>
    </>
  )
}
