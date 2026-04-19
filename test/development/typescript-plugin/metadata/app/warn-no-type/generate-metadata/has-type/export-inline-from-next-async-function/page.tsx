import type { Metadata } from 'next'

export default function Page() {
  return <p>hello world</p>
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Generate Metadata',
  }
}
