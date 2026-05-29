import type { Metadata } from 'next'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Generate Metadata',
  }
}
