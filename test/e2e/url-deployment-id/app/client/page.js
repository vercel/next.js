'use client'
import imported from '../../public/test.png'
const url = new URL('../../public/test.png', import.meta.url).toString()

export default function Page() {
  return (
    <main>
      <p id="imported-src">{imported.src}</p>
      <p id="new-url">{url}</p>
    </main>
  )
}
