type Metadata = { title: string }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function generateMetadata(): Metadata {
  return {
    title: 'Generate Metadata',
  }
}
