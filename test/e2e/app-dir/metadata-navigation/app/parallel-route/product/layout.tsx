import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Product Layout',
}

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
