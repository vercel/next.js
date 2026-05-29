type Metadata = { title: string }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const generateMetadata = async function (): Promise<Metadata> {
  return {
    title: 'Generate Metadata',
  }
}
