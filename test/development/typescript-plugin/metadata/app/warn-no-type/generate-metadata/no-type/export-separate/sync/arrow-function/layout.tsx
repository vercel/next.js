export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export { generateMetadata }

const generateMetadata = () => {
  return {
    title: 'Generate Metadata',
  }
}
