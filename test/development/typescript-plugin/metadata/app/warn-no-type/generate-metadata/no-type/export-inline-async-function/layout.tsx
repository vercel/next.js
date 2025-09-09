export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export async function generateMetadata() {
  return {
    title: 'Generate Metadata',
  }
}
