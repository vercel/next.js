import Link from 'next/link'
import { useRouter } from 'next/router'

export default function ItemPage() {
  const { query, asPath } = useRouter()
  const hash = asPath.split('#')[1]

  return (
    <ul>
      <li>
        <Link href="/">Route To Index Page</Link>
      </li>
      <li>
        <Link href={`/${Number(query.itemId) + 1}`}>
          Route To Next Item Page
        </Link>
      </li>
      <li>
        <Link href={hash ? asPath.replace(`#${hash}`, '') : asPath + '#hash'}>
          {hash ? 'Remove hash' : 'Append hash'}
        </Link>
      </li>
    </ul>
  )
}
