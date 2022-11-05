import { useRouter } from 'next/router'
import Link from 'next/link'
import { type PageConfig } from 'next'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'

export const config: PageConfig = {}

export default function Page() {
  // eslint-disable-next-line  @typescript-eslint/no-unused-vars
  const router = useRouter()
  return (
    <>
      <p>hello world</p>
      <Link
        href="/another"
        onClick={(e) => {
          console.log(e.currentTarget)
        }}
      >
        to /another
      </Link>
      <Link
        href="/another"
        onClick={(e) => {
          /** @ts-expect-error - foo does not exist on React.MouseEvent */
          console.log(e.foo)
        }}
      >
        to /another
      </Link>
    </>
  )
}
