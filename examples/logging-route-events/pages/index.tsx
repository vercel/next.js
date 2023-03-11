import Link from 'next/link'
import { useRouter } from 'next/router'

export default function IndexPage() {
  const { asPath } = useRouter()
  const hash = asPath.split('#')[1]

  return (
    <ul>
      <li>
        <Link href="/">Route To Index Page</Link>
      </li>
      <li>
        <Link href={`/1`}>Route To First Item Page</Link>
      </li>
      <li>
        <Link href={hash ? asPath.replace(`#${hash}`, '') : asPath + '#hash'}>
          {hash ? 'Remove hash' : 'Append hash'}
        </Link>
      </li>
    </ul>
  )
}
