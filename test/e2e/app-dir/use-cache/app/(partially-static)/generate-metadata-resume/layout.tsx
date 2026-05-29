import { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL('https://example.com/foo'),
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>
}
