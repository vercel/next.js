import type { Metadata } from 'next'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const metadata: Metadata = {
  title: 'Metadata',
}

export { metadata }
