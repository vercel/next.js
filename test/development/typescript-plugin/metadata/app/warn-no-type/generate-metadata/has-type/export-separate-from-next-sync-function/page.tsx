import type { Metadata } from 'next'

export default function Page() {
  return <p>hello world</p>
}

function generateMetadata(): Metadata {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
