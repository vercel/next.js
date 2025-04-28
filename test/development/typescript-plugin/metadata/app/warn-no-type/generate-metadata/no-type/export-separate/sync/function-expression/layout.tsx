export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export { generateMetadata }

const generateMetadata = function () {
  return {
    title: 'Generate Metadata',
  }
}
