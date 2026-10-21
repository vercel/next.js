import type { TestProjectConfig } from './config'

/** Allocate compiler identities independently from authored Browser project names. */
export function assignBrowserInstanceIds(projects: TestProjectConfig[]): void {
  const identities = new Set(
    projects
      .filter((project) => !project.browserInstance)
      .map((project) => project.profile.id)
  )
  const names = new Set<string>()
  let ordinal = 0
  for (const project of projects) {
    const name = project.displayName ?? project.profile.id
    if (names.has(name)) throw new Error(`Duplicate project name "${name}".`)
    names.add(name)
    if (!project.browserInstance) continue
    let id: string
    do id = `browser-instance-${ordinal++}`
    while (identities.has(id))
    identities.add(id)
    project.profile = { ...project.profile, id }
  }
}
