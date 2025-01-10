import Link from 'next/link'
import { BackButton } from './back-button'

export default async function Page() {
  return (
    <>
      <p id="static-page">Static Page</p>
      <p>
        <Link href="/" id="to-home">
          To home
        </Link>
      </p>
      <p>
        <Link href="/static-page" prefetch>
          To Same Page
        </Link>
      </p>
      <p>
        <BackButton />
      </p>
    </>
  )
}
