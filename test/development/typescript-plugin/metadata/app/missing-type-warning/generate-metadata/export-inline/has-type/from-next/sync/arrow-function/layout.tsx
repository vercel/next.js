import type { Metadata } from 'next'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const generateMetadata = (): Metadata => {
  return {
    title: 'Generate Metadata',
  }
}
