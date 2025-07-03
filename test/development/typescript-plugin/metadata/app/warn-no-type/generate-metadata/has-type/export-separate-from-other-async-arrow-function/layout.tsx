type Metadata = { title: string }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const generateMetadata = async (): Promise<Metadata> => {
  return {
    title: 'Generate Metadata',
  }
}

export { generateMetadata }
