import { nanoid } from 'nanoid'
import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1 id="render-id">{nanoid()}</h1>
      <h2 id="from-navigation">hello from /navigation</h2>
      <Link href="/hooks/use-cookies">
        <a id="use-cookies">useCookies</a>
      </Link>
      <Link href="/hooks/use-headers">
        <a id="use-headers">useHeaders</a>
      </Link>
    </>
  )
}
