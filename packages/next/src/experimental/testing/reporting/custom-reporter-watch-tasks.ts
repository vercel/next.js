import { assertReporterTaskTree, type ReporterTaskSnapshot } from './live-tasks'

type WatchTask = Omit<ReporterTaskSnapshot, 'tasks' | 'parentSuiteId'> & {
  tasks?: WatchTask[]
  file: WatchTask
  suite?: WatchTask
}

/** Reconnect only the file and lexical-suite references from actual producer facts. */
export function createCustomReporterWatchFile(tree: ReporterTaskSnapshot) {
  assertReporterTaskTree(tree, tree.id)
  const nodes = new Map<string, WatchTask>()
  const parents = new Map<string, string | null>()
  function visit(
    task: ReporterTaskSnapshot,
    physicalParent: string | null
  ): WatchTask {
    const { tasks, parentSuiteId, ...fields } = task
    const value = { ...fields } as WatchTask
    nodes.set(task.id, value)
    parents.set(
      task.id,
      parentSuiteId === undefined ? physicalParent : parentSuiteId
    )
    if (tasks)
      value.tasks = tasks.map((child) =>
        visit(child, task === tree ? null : task.id)
      )
    return value
  }
  const file = visit(tree, null)
  for (const [id, task] of nodes) {
    task.file = file
    const parent = parents.get(id)!
    if (parent !== null) task.suite = nodes.get(parent)!
  }
  return file
}
