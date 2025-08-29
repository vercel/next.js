// No `export const unstable_prefetch = ...` is needed, we default to static

export default function Page() {
  return (
    <main>
      <h1 style={{ color: 'green' }}>Fully statically prefetchable</h1>
      <p id="static-content-page">
        This page is a statically-prefetchable child of a runtime-prefetchable
        layout. We should not use a runtime prefetch for it.
      </p>
    </main>
  )
}
