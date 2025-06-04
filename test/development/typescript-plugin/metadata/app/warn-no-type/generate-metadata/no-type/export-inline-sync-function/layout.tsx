export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function generateMetadata() {
  return {
    title: 'Generate Metadata',
  }
}
