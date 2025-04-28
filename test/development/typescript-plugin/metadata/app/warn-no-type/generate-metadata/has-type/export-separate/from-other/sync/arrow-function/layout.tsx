type Metadata = { title: string }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const generateMetadata = (): Metadata => {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
