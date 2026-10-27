import Link from 'next/link'

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <nav aria-label="Project navigation">
        <Link href="/projects">All projects</Link>
      </nav>
      {children}
    </div>
  )
}
