export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const generateMetadata = async function () {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
