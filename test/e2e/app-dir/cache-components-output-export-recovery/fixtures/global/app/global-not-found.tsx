import { Suspense } from 'react'
import { cookies } from 'next/headers'

async function Missing() {
  const value =
    (await cookies()).get('cc-output-export-global')?.value ?? 'missing'
  return <p>Global 404: {value}</p>
}

export default function GlobalNotFound() {
  return (
    <html>
      <body>
        <Suspense fallback={<p>Loading global 404</p>}>
          <Missing />
        </Suspense>
      </body>
    </html>
  )
}
