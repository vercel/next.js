import Link from 'next/link'
import { PageConfig } from 'next'

export const config: PageConfig = {
  unstable_runtimeJS: false,
}

export default function Page() {
  return (
    <>
      <p>hello world</p>
      <Link href="/another">to /another</Link>
    </>
  )
}
