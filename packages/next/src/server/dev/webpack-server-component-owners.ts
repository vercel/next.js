import type { Module, ModuleGraph } from 'webpack'

export type WebpackServerComponentOwners =
  | { type: 'all' }
  | { type: 'owners'; owners: Set<string> }

export function findWebpackServerComponentOwners(
  moduleGraph: ModuleGraph,
  changedModule: Module,
  ownerFileRegex: RegExp
): WebpackServerComponentOwners {
  const owners = new Set<string>()
  const visited = new Set<Module>()
  const pending = [changedModule]
  let complete = true

  while (pending.length > 0) {
    const module = pending.pop()!
    if (visited.has(module)) {
      continue
    }
    visited.add(module)

    const resource = (module as Module & { resource?: string }).resource
    if (resource && ownerFileRegex.test(resource)) {
      owners.add(resource)
      continue
    }

    let foundParent = false
    for (const connection of moduleGraph.getIncomingConnections(module)) {
      if (connection.originModule !== null) {
        foundParent = true
        pending.push(connection.originModule)
      }
    }
    if (!foundParent) {
      complete = false
    }
  }

  return complete && owners.size > 0
    ? { type: 'owners', owners }
    : { type: 'all' }
}
