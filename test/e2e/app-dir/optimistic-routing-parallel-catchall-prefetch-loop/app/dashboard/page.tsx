import { LinkAccordion } from '../../components/link-accordion'

export default function DashboardPage() {
  const projectIds = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']

  return (
    <main>
      <h1 id="dashboard-heading">Dashboard</h1>
      {projectIds.map((id) => (
        <section key={id}>
          <LinkAccordion href={`/projects/${id}`} prefetch={true}>
            Project {id}
          </LinkAccordion>
          <LinkAccordion href={`/projects/${id}/edit`}>Edit {id}</LinkAccordion>
        </section>
      ))}
    </main>
  )
}
