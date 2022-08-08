import { useRouter } from 'next/router'
import Link from 'next/link'
import { type PageConfig } from 'next'

export const config: PageConfig = {}

export default function Page() {
  // eslint-disable-next-line  @typescript-eslint/no-unused-vars
  const router = useRouter()
  return (
    <>
      <p>hello world</p>
      <Link href="/another">
        <a>to /another</a>
      </Link>
    </>
  )
}
