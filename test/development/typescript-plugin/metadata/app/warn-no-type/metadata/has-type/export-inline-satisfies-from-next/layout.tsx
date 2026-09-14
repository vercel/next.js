import type { Metadata } from 'next'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const metadata = {
  title: 'Metadata',
} satisfies Metadata
