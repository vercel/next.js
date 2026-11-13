import Link from 'next/link'

const projects = [
  { slug: 'acme', name: 'Acme Storefront' },
  { slug: 'orbit', name: 'Orbit Analytics' },
]

export default function Dashboard() {
  return (
    <main>
      <h1>Projects</h1>
      <ul>
        {projects.map((project) => (
          <li key={project.slug}>
            <Link href={`/projects/${project.slug}`}>{project.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
