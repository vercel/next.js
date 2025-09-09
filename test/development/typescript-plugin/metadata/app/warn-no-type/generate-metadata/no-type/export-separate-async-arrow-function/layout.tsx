export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const generateMetadata = async () => {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
