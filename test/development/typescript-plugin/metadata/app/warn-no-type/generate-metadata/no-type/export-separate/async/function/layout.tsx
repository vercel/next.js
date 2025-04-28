export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export { generateMetadata }

async function generateMetadata() {
  return {
    title: 'Generate Metadata',
  }
}
