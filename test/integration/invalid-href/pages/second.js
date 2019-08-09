import Link from 'next/link'
import { useRouter } from 'next/router'

const invalidLink = 'https://google.com/another'

export default () => {
  const { query, ...router } = useRouter()
  const { method } = query

  return method ? (
    <a
      id='click-me'
      onClick={e => {
        e.preventDefault()
        router[method](invalidLink)
      }}
    >
      invalid link :o
    </a>
  ) : (
    // this should throw an error on load since prefetch
    // receives the invalid href
    <Link href={invalidLink}>
      <a id='click-me'>invalid link :o</a>
    </Link>
  )
}
