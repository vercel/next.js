import Link from 'next/link'
import { getPathname } from 'next/navigation'

export default function Home() {
  const pathname = getPathname()

  return (
    <>
      <p id="home-page">Home</p>
      <p>
        Pathname - <span id="pathname">{pathname}</span>
      </p>
      <p>
        <Link href="/get-pathname" id="home">
          Home
        </Link>
      </p>
      <p>
        <Link href="/get-pathname/static" id="static">
          Static
        </Link>
      </p>
      <p>
        <Link href="/get-pathname/dynamic" id="dynamic">
          Dynamic
        </Link>
      </p>
    </>
  )
}
