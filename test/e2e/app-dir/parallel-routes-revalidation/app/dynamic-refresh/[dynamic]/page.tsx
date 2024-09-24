import Link from 'next/link'
import { UpdateSearchParamsButton } from '../../components/UpdateSearchParamsButton'

export default function Home({ searchParams }) {
  return (
    <main>
      <Link href="/dynamic-refresh/foo/login">
        <button>Login button</button>
      </Link>
      <div>
        Random # from Root Page: <span id="random-number">{Math.random()}</span>
      </div>
      <UpdateSearchParamsButton searchParams={searchParams} />
    </main>
  )
}
