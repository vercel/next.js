import { useEffect, useState } from 'react'
import Loading from '../components/Loading'

function useMounted() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return mounted
}

export default function HomePage() {
  const isMounted = useMounted()

  return (
    <main>
      <section>
        <h1>This section is server-side rendered.</h1>
      </section>

      {isMounted ? (
        <section>
          <h2>
            This section is <em>only</em> client-side rendered.
          </h2>
        </section>
      ) : (
        <Loading />
      )}

      <style jsx>{`
        section {
          align-items: center;
          display: flex;
          height: 50vh;
          justify-content: center;
        }
      `}</style>
    </main>
  )
}
