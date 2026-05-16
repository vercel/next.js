import { Metadata } from 'next'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const metadata: Metadata = {
  title: 'Project Layout',
}
