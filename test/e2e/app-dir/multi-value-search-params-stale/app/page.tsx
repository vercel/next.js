import Link from 'next/link'
import { Suspense } from 'react'

export default function Page({ searchParams }: PageProps<'/'>) {
  return (
    <main>
      <Link id="to-bar" href="/?foo=bar">
        foo=bar
      </Link>
      <Link id="to-bar-baz" href="/?foo=bar&foo=baz">
        foo=bar&foo=baz
      </Link>
      <Link id="to-baz" href="/?foo=baz">
        foo=baz
      </Link>
      <Suspense fallback={null}>
        {searchParams.then((params) => (
          <pre id="search-params">{JSON.stringify(params, null, 2)}</pre>
        ))}
      </Suspense>
    </main>
  )
}
