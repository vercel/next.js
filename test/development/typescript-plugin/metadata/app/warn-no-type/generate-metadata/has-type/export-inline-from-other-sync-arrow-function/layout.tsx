type Metadata = { title: string }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const generateMetadata = (): Metadata => {
  return {
    title: 'Generate Metadata',
  }
}
