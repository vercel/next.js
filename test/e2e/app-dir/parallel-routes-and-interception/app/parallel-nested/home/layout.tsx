import { Suspense } from 'react'

export default function Layout({ parallelB }: { parallelB: React.ReactNode }) {
  return (
    <main>
      <h3>{`(parallelB)`}</h3>
      <div>
        <Suspense fallback={<div id="timestamp">loading...</div>}>
          {parallelB}
        </Suspense>
      </div>
    </main>
  )
}
