import { lang, locale } from 'next/root-params'
import { connection } from 'next/server'
import { cookies } from 'next/headers'
import { Suspense } from 'react'

export default async function Page() {
  const currentLang = await lang()
  const currentLocale = await locale()
  return (
    <main>
      <div>
        Root params are{' '}
        <span id="root-params">
          {currentLang} {currentLocale}
        </span>
      </div>
      <Suspense fallback="Loading...">
        <Timestamp />
      </Suspense>
      <form
        action={async () => {
          'use server'
          // rerender the page and return it alongside the action result
          const cookieStore = await cookies()
          cookieStore.set('my-cookie', Date.now() + '')
        }}
      >
        <button type="submit">Submit form</button>
      </form>
    </main>
  )
}

async function Timestamp() {
  await connection()
  return <div id="timestamp">{Date.now()}</div>
}
