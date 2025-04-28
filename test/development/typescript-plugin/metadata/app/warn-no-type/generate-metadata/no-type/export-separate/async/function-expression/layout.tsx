export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export { generateMetadata }

const generateMetadata = async function () {
  return {
    title: 'Generate Metadata',
  }
}
