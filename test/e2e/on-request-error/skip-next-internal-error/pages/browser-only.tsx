import { Suspense, use } from 'react'
import { browserOnly } from 'next/navigation'

function BrowserOnlyContent() {
  use(browserOnly())
  return <p>browser content</p>
}

export function getServerSideProps() {
  return { props: {} }
}

export default function Page() {
  return (
    <Suspense fallback={<p>browser fallback</p>}>
      <BrowserOnlyContent />
    </Suspense>
  )
}
