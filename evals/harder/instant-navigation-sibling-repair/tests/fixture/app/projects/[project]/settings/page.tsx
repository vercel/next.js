import { headers } from 'next/headers'

export const instant = true

export default async function ProjectSettings({
  params,
}: PageProps<'/projects/[project]/settings'>) {
  const [{ project }, requestHeaders] = await Promise.all([params, headers()])
  const viewer = requestHeaders.get('x-viewer') ?? 'Guest'

  return (
    <main>
      <h1>{project === 'acme' ? 'Acme settings' : 'Project settings'}</h1>
      <section data-testid="viewer-settings">
        Settings visible to {viewer}
      </section>
    </main>
  )
}
