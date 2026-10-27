#!/bin/bash
set -euo pipefail
cat > app/projects/'[project]'/settings/page.tsx <<'EOF'
import { Suspense } from 'react'
import { headers } from 'next/headers'

export const instant = true

export default function ProjectSettings({
  params,
}: PageProps<'/projects/[project]/settings'>) {
  return (
    <main>
      <h1>Acme settings</h1>
      <Suspense fallback={<SettingsSkeleton />}>
        <ViewerSettings params={params} />
      </Suspense>
    </main>
  )
}

function SettingsSkeleton() {
  return <p data-testid="settings-skeleton">Loading viewer settings…</p>
}

async function ViewerSettings({
  params,
}: Pick<PageProps<'/projects/[project]/settings'>, 'params'>) {
  const [{ project }, requestHeaders] = await Promise.all([params, headers()])
  const viewer = requestHeaders.get('x-viewer') ?? 'Guest'

  return (
    <section data-testid="viewer-settings">
      {project === 'acme' ? 'Settings' : 'Project settings'} visible to {viewer}
    </section>
  )
}
EOF
npm run typecheck
