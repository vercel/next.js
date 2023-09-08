import { cookies } from 'next/headers'
import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link id="back" href="/mutate-cookie">
        back
      </Link>
      <p id="value">{cookies().get('test-cookie2')?.value}</p>
    </>
  )
}
