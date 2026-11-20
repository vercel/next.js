import { cookies } from 'next/headers'

export async function RequestContent() {
  const cookieStore = await cookies()
  return (
    <p id="submitted-message">
      {cookieStore.get('mpa-message')?.value ?? 'none'}
    </p>
  )
}
