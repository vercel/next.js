import { Suspense } from 'react'
import { cookies } from 'next/headers'

// A "use cache" entry makes the Resume Data Cache get persisted into the
// postponed state, together with the encrypted bound args of the inline Server
// Functions that were rendered during the prerender.
async function getGreeting() {
  'use cache'
  return 'Hello'
}

async function Greeting() {
  return <h1>{await getGreeting()}</h1>
}

// An inline Server Function that closes over a prop is compiled to
// `action.bind(null, encryptActionBoundArgs(id, locale))`. At request time the
// encrypted bound args are found in the Resume Data Cache.
function SearchForm({ locale }: { locale: string }) {
  async function onSubmit(formData: FormData) {
    'use server'
    console.log(locale, formData.get('q'))
  }

  return (
    <form action={onSubmit}>
      <input name="q" />
      <button type="submit">Go</button>
    </form>
  )
}

// Request-time data inside Suspense: the page gets a static shell and is
// resumed per request.
async function DynamicContent() {
  await cookies()
  return <p id="dynamic-content">Dynamic content</p>
}

export default function Page() {
  return (
    <main>
      <Greeting />
      <SearchForm locale="en" />
      <Suspense fallback={<p>Loading...</p>}>
        <DynamicContent />
      </Suspense>
    </main>
  )
}
