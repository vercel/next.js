type Metadata = { title: string }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function generateMetadata(): Metadata {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
