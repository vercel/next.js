import type { Metadata } from 'next'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const routeMetadata = {
  title: 'Metadata',
} satisfies Metadata

export { routeMetadata as metadata }
