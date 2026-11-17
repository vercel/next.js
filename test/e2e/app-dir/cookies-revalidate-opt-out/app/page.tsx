import { cookies } from 'next/headers'
import { Buttons } from './buttons'

export default async function Page() {
  const cookieStore = await cookies()
  // Note: a deleted cookie is still visible to a re-render within the same
  // request as an empty-string value, so use truthiness instead of `??`.
  const cookieValue = cookieStore.get('test-cookie')?.value || 'no-cookie'

  return (
    <main>
      <p id="render-id">{Math.random()}</p>
      <p id="rendered-cookie-value">{cookieValue}</p>
      <Buttons />
    </main>
  )
}
