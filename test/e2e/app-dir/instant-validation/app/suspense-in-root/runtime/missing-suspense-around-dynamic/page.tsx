import { cookies } from 'next/headers'
import { connection } from 'next/server'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

export default async function Page() {
  await cookies()
  return (
    <main>
      <div>
        <p>
          Dynamic content needs a Suspense boundary, but it's missing here, so
          we should error:
        </p>
        <Dynamic />
      </div>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content from page</div>
}
