import type { Metadata } from 'next'

export default function Page() {
  return <p>hello world</p>
}

const routeMetadata = {
  title: 'Metadata',
} satisfies Metadata

export { routeMetadata as metadata }
