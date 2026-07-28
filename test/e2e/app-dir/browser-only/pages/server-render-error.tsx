import { Suspense } from 'react'

function ServerErrorContent() {
  if (typeof window === 'undefined') {
    throw new Error('expected Pages Router server render error')
  }

  return <p>client content</p>
}

export function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  return (
    <Suspense fallback={<p id="server-error-fallback">error fallback</p>}>
      <ServerErrorContent />
    </Suspense>
  )
}
