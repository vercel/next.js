import Link from 'next/link'

export default function ProjectsPage() {
  return (
    <main>
      <h1>Projects</h1>
      <Link href="/projects/acme/settings">Configure Acme</Link>
    </main>
  )
}
