type Metadata = { title: string }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const generateMetadata = function (): Metadata {
  return {
    title: 'Generate Metadata',
  }
}
