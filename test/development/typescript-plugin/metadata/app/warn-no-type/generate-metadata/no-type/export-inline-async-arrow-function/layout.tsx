export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const generateMetadata = async () => {
  return {
    title: 'Generate Metadata',
  }
}
