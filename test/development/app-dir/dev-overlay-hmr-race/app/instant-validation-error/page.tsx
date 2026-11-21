import { connection } from 'next/server'

export const instant = true

// Reading uncached data without a Suspense boundary fails instant validation.
// The server reports the error via HMR after the navigation has finished.
export default async function Page() {
  await connection()
  return <p id="instant-validation-error">instant validation error</p>
}
