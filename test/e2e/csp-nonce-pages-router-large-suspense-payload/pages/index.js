import { Suspense } from 'react'

function Big() {
  const items = []
  for (let i = 0; i < 500; i++) {
    items.push(
      'padding content to grow the payload past the stream chunk threshold '
    )
  }
  return <div>{items.join('')}</div>
}

export default function Page() {
  return (
    <Suspense fallback="suspense_fallback">
      <Big />
    </Suspense>
  )
}

export function getServerSideProps() {
  return { props: {} }
}
