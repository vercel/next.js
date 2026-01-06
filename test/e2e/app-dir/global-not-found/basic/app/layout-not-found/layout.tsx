import { notFound } from 'next/navigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  notFound()
  return <>{children}</>
}
