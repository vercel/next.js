'use client'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const metadata = {
  title: 'Metadata',
}

export function generateMetadata() {
  return {
    title: 'Generate Metadata',
  }
}
