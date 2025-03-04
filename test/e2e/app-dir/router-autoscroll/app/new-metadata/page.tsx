import type { Metadata } from 'next'

export const metadata: Metadata = {
  keywords: ['new-metadata'],
}
export default function Page() {
  return (
    <>
      {
        // Repeat 500 elements
        Array.from({ length: 500 }, (_, i) => (
          <div key={i}>{i}</div>
        ))
      }
    </>
  )
}
