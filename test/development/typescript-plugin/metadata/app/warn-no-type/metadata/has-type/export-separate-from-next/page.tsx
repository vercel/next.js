import type { Metadata } from 'next'

export default function Page() {
  return <p>hello world</p>
}

const metadata: Metadata = {
  title: 'Metadata',
}

export { metadata }
