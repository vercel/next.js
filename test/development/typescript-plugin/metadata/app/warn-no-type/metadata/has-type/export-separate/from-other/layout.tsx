type Metadata = { title: string }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export { metadata }

const metadata: Metadata = {
  title: 'Metadata',
}
