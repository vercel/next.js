export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const generateMetadata = () => {
  return {
    title: 'Generate Metadata',
  }
}
