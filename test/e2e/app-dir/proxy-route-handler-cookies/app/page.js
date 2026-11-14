import { Suspense } from 'react'
import { cookies } from 'next/headers'

async function Cookies() {
  const jar = await cookies()
  return (
    <p id="cookies">
      {jar
        .getAll()
        .map((cookie) => cookie.name + '=' + cookie.value)
        .join(',')}
    </p>
  )
}

export default function Page() {
  return (
    <Suspense>
      <Cookies />
    </Suspense>
  )
}
