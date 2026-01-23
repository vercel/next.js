import { headers } from 'next/headers'
import imported from '../../public/test.png'
const url = new URL('../../public/test.png', import.meta.url).toString()

export default async function Page() {
  // Use headers() to opt into dynamic rendering
  await headers()
  return (
    <main>
      <p id="imported-src">{imported.src}</p>
      <p id="new-url">{url}</p>
    </main>
  )
}
