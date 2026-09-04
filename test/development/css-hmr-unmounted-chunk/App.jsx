import { lazy, Suspense, useState } from 'react'

const routes = {
  R0: lazy(() => import('./routes/Route0')),
  R1: lazy(() => import('./routes/Route1')),
  R2: lazy(() => import('./routes/Route2')),
}

export default function App() {
  const [cur, setCur] = useState('R0')
  const Route = routes[cur]
  return (
    <main>
      <nav>
        {Object.keys(routes).map((k) => (
          <button key={k} id={'btn-' + k} onClick={() => setCur(k)}>
            {k}
          </button>
        ))}
      </nav>
      <div id="route">
        <Suspense fallback={<p>loading…</p>}>
          <Route />
        </Suspense>
      </div>
    </main>
  )
}
