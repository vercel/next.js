import Link from 'next/link'
import { useRouter } from 'next/router'

import { DANGEROUS_JAVASCRIPT_URL } from '../../bad-url'

export default function Page() {
  const router = useRouter()
  return (
    <html>
      <body>
        <main>
          <p>
            Clicking this button should result in an error where Next.js blocks
            a javascript URL
          </p>
          <button onClick={() => router.push(DANGEROUS_JAVASCRIPT_URL)}>
            push javascript URL
          </button>
        </main>
        <footer>
          <Link href="/pages/safe">Safe Page</Link>
        </footer>
      </body>
    </html>
  )
}
