import Link from 'next/link'

export default function Component() {
  return (
    <>
      <Link href="/" locale="en">
        <a id="to-home">to /</a>
      </Link>
      <Link href="/" locale="de">
        <a id="to-home-de">to /de</a>
      </Link>
    </>
  )
}
