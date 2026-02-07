type Metadata = { title: string }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const metadata: Metadata = {
  title: 'Metadata',
}

export { metadata }
