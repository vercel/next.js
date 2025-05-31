export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const generateMetadata = function () {
  return {
    title: 'Generate Metadata',
  }
}
