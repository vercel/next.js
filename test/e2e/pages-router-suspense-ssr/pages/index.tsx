import { Suspense } from 'react'

// React outlines a Suspense boundary once its content grows past
// `progressiveChunkSize`, which defaults to 12.8 kB. This is comfortably past
// that limit, so the boundary is outlined unless the render opts out.
const largeContent = 'chunk-of-server-rendered-text '.repeat(1000)

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="fallback">Loading large content</p>}>
        <article id="content">{largeContent}</article>
      </Suspense>
    </main>
  )
}

export function getServerSideProps() {
  return { props: {} }
}
