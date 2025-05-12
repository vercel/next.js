import { Metadata } from 'next'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const generateMetadata = async function (): Promise<Metadata> {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
