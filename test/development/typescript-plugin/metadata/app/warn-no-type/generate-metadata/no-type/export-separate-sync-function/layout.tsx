export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function generateMetadata() {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
