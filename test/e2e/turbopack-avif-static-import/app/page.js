import Image from 'next/image'
import avif from '../test.avif'

// The AVIF asset is 400x400. Turbopack currently cannot decode AVIF, so the
// static import metadata falls back to a placeholder size instead.
export default function Page() {
  return (
    <main>
      <p id="avif-meta">{JSON.stringify(avif)}</p>
      <Image id="avif-img" src={avif} alt="avif" />
    </main>
  )
}
