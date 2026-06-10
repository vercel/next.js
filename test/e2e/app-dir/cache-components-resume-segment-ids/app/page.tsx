import { Suspense } from 'react'
import { DynamicFooter } from './dynamic-footer'
import { LongWidget } from './widget'

export default function Page() {
  return (
    <main>
      <h1>resume segment ids</h1>
      {[0, 1, 2].map((index) => (
        <Suspense
          fallback={<p className="long-widget-fallback">…</p>}
          key={index}
        >
          <LongWidget index={index} />
        </Suspense>
      ))}
      <Suspense fallback={<footer>footer fallback</footer>}>
        <DynamicFooter />
      </Suspense>
    </main>
  )
}
