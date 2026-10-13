import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { updateCookie } from './actions'

async function SharedContent() {
  await connection()
  const cookieStore = await cookies()
  return (
    <p id="shared-render">
      {cookieStore.has('query-test') ? 'Cookie updated' : 'Cookie absent'}
    </p>
  )
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={<p>Loading shared content</p>}>
          <SharedContent />
        </Suspense>
        <nav>
          <Link href="/article/two" prefetch={false}>
            Article two
          </Link>
          <Link
            href="/article/two?rscSuffix=first&rscSuffix=second&shellPrefix=user&term=example"
            prefetch={false}
          >
            Article two with search parameters
          </Link>
          <Link href="/en/posts/two" prefetch={false}>
            English article two
          </Link>
          <Link
            href="/en/posts/two?rscSuffix=first&rscSuffix=second&shellPrefix=user&term=example"
            prefetch={false}
          >
            English article two with search parameters
          </Link>
        </nav>
        <form action={updateCookie}>
          <button id="update-cookie">Update an ordinary cookie</button>
        </form>
        {children}
      </body>
    </html>
  )
}
