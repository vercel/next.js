import { nanoid } from 'nanoid'
import Link from './link.client.js'

export default function Page() {
  return (
    <>
      <h1 id="render-id">{nanoid()}</h1>
      <h2 id="from-navigation">hello from /navigation</h2>
      <Link href="/hooks/use-cookies" id="use-cookies">
        useCookies
      </Link>
      <Link href="/hooks/use-headers" id="use-headers">
        useHeaders
      </Link>
    </>
  )
}
