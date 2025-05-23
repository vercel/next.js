export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

async function generateMetadata() {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
