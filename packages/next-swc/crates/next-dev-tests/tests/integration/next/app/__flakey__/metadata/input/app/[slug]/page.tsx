import type React from 'react'
import Test from '../test'

export default function Page(): React.ReactElement {
  return (
    <div>
      <Test />
    </div>
  )
}

export async function generateMetadata({ params }) {
  return {
    title: `Page(${params.slug})`,
    openGraph: {
      images: new URL('../triangle-black.png', import.meta.url).pathname,
    },
  }
}
