import type { Metadata } from 'next'

export default function Page() {
  return <p>hello world</p>
}

async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
