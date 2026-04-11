import { Suspense } from 'react'
import { cookies } from 'next/headers'

async function CookiesContent() {
  const cookieStore = await cookies()

  return <h1>{cookieStore.get('theme')?.value}</h1>
}

export default function CookiesPage() {
  return (
    <Suspense fallback={<p>loading</p>}>
      <CookiesContent />
    </Suspense>
  )
}
