type Metadata = { title: string }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
