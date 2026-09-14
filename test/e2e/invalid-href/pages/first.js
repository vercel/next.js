import Link from 'next/link'
import { useRouter } from 'next/router'

const invalidLink = 'mailto:idk@idk.com'

export default function Page() {
  const { query, ...router } = useRouter()
  const { method } = query

  return method ? (
    <a
      id="click-me"
      onClick={(e) => {
        e.preventDefault()
        router[method](invalidLink)
      }}
    >
      invalid link :o
    </a>
  ) : (
    // this should throw an error on load since prefetch
    // receives the invalid href
    <Link href={invalidLink} id="click-me">
      invalid link :o
    </Link>
  )
}
