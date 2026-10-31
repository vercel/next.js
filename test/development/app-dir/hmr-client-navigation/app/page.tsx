import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="home">home</p>
      <Link id="to-plain" href="/plain">
        to plain
      </Link>
      <Link id="to-dynamic" href="/dynamic/first">
        to dynamic
      </Link>
    </>
  )
}
