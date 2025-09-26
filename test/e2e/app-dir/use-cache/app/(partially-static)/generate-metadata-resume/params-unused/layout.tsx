import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { metadataBase: new URL('https://example.com/foo') }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>
}
