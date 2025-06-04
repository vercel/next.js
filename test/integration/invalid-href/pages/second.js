import Link from 'next/link'
import { useRouter } from 'next/router'

const invalidLink = 'https://vercel.com/solutions/nextjs'

export default function Page() {
  const { query, ...router } = useRouter()
  const { method } = query

  return method ? (
    <a
      id="click-me"
      onClick={(e) => {
        e.preventDefault()
        // this should throw an error on load since prefetch
        // receives the invalid href
        router[method](invalidLink)
      }}
    >
      invalid link :o
    </a>
  ) : (
    <Link href={invalidLink} id="click-me">
      valid link :o
    </Link>
  )
}
