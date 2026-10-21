import type {
  File,
  Task,
  TaskMeta,
  TaskResult,
  Test,
  TestAnnotation,
  TestArtifact,
} from '../runner/tasks'

/** Actual collected declarations and current producer state, without runtime contexts. */
export interface ReporterTaskSnapshot {
  id: string
  type: Task['type']
  name: string
  fullName: string
  fullTestName?: string
  mode: Task['mode']
  meta: TaskMeta
  tags: string[]
  each?: boolean
  concurrent?: boolean
  shuffle?: boolean
  retry?: Test['retry']
  repeats?: number
  fails?: boolean
  timeout?: number
  result?: TaskResult
  tasks?: ReporterTaskSnapshot[]
  annotations?: TestAnnotation[]
  artifacts?: TestArtifact[]
  filepath?: string
  projectName?: string
}

/** Capture while the real logical-case or suite callback still owns its task tree. */
export function captureReporterTaskTree(
  file: File,
  packs?: ReadonlyMap<string, Pick<Task, 'result' | 'meta'>>
): ReporterTaskSnapshot {
  function visit(task: Task): ReporterTaskSnapshot {
    const pack = packs?.get(task.id) ?? task
    return {
      id: task.id,
      type: task.type,
      name: task.name,
      fullName: task.fullName,
      fullTestName: task.fullTestName,
      mode: task.mode,
      meta: pack.meta,
      tags: task.tags,
      each: 'each' in task ? (task.each as boolean | undefined) : undefined,
      concurrent: task.concurrent,
      shuffle: task.shuffle,
      ...(task.type === 'test'
        ? {
            retry: task.retry,
            repeats: task.repeats,
            fails: task.fails,
            timeout: task.timeout,
          }
        : {}),
      result: pack.result,
      ...(task.type === 'suite'
        ? { tasks: task.tasks.map(visit) }
        : { annotations: task.annotations, artifacts: task.artifacts }),
      ...(task === file
        ? { filepath: file.filepath, projectName: file.projectName }
        : {}),
    }
  }
  return structuredClone(visit(file))
}

/** Check the actual task graph carried by a result envelope, without interpreting metadata. */
export function assertReporterTaskTree(
  value: unknown,
  entryId: string,
  caseId?: string
): asserts value is ReporterTaskSnapshot {
  const ids = new Set<string>()
  let found = caseId === undefined
  function visit(input: unknown, root = false): void {
    if (!input || typeof input !== 'object')
      throw new Error('Invalid live reporter task graph.')
    const task = input as ReporterTaskSnapshot
    if (
      typeof task.id !== 'string' ||
      !task.id ||
      ids.has(task.id) ||
      !['suite', 'test'].includes(task.type) ||
      typeof task.name !== 'string' ||
      typeof task.fullName !== 'string' ||
      !['run', 'skip', 'todo', 'only', 'queued'].includes(task.mode) ||
      !task.meta ||
      typeof task.meta !== 'object' ||
      !Array.isArray(task.tags) ||
      task.tags.some((tag) => typeof tag !== 'string') ||
      (root &&
        (task.type !== 'suite' ||
          task.id !== entryId ||
          typeof task.filepath !== 'string' ||
          typeof task.projectName !== 'string'))
    )
      throw new Error('Invalid live reporter task graph.')
    if (
      task.result !== undefined &&
      (!task.result ||
        typeof task.result !== 'object' ||
        !['run', 'pass', 'fail', 'skip', 'only', 'todo', 'queued'].includes(
          task.result.state
        ))
    )
      throw new Error('Invalid live reporter task result.')
    ids.add(task.id)
    if (task.id === caseId && task.type === 'test') found = true
    if (task.type === 'suite') {
      if (!Array.isArray(task.tasks))
        throw new Error('Invalid live reporter suite children.')
      task.tasks.forEach((child) => visit(child))
    } else if (
      !Array.isArray(task.annotations) ||
      !Array.isArray(task.artifacts) ||
      task.tasks !== undefined
    )
      throw new Error('Invalid live reporter case fields.')
  }
  visit(value, true)
  if (!found)
    throw new Error('Live reporter result is missing its actual case.')
}
