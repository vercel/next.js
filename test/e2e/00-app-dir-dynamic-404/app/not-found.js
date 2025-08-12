import { cookies } from 'next/headers'

export default function Page() {
  cookies() // dynamic

  return (
    <>
      <h1>This Is The Not Found Page</h1>

      <div id="timestamp">{Date.now()}</div>
    </>
  )
}
