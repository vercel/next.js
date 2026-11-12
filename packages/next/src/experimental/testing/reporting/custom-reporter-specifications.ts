import { isAbsolute } from 'node:path'
import type { DiscoveredTestProject } from '../discovery'
import { orderTestSpecifications } from './task-order'

/** Facts from the selected Next specification before setup or compilation. */
export interface ReporterRunSpecification {
  entryId: string
  moduleId: string
  projectId: string
  projectName: string
  root: string
  pool: 'forks'
}

/** This first producer owns isolated ordinary Node files, not other pools. */
export function selectReporterRunSpecifications(
  root: string,
  projects: readonly DiscoveredTestProject[],
  specificationOrder: readonly string[]
): ReporterRunSpecification[] {
  if (
    !isAbsolute(root) ||
    projects.some(
      (project) =>
        project.entries.length > 0 &&
        (project.isolate === false ||
          project.typecheck?.enabled ||
          project.profile.environment !== 'node' ||
          project.profile.route !== undefined ||
          project.profile.browserClient !== undefined ||
          (project.executionEnvironment &&
            project.executionEnvironment.name !== 'node') ||
          project.entries.some(
            (entry) =>
              entry.typecheck ||
              (entry.executionEnvironment &&
                entry.executionEnvironment.name !== 'node')
          ))
    )
  )
    throw new Error(
      'Run Start reporters require one-shot isolated ordinary Node execution.'
    )
  const entries = projects.flatMap((project) =>
    project.entries.map((entry) => {
      if (
        !entry.id ||
        !isAbsolute(entry.file) ||
        entry.profile.id !== project.profile.id ||
        entry.profile.environment !== project.profile.environment ||
        entry.profile.mode !== project.profile.mode
      )
        throw new Error('Run Start requires actual selected project entries.')
      return {
        entryId: entry.id,
        moduleId: entry.file,
        projectId: project.profile.id,
        projectName: entry.projectName ?? '',
        root,
        pool: 'forks' as const,
      }
    })
  )
  const ids = new Set(entries.map((entry) => entry.entryId))
  if (
    ids.size !== entries.length ||
    new Set(specificationOrder).size !== specificationOrder.length ||
    specificationOrder.length !== entries.length ||
    specificationOrder.some((id) => !ids.has(id))
  )
    throw new Error(
      'Run Start requires its actual selected specification order.'
    )
  return orderTestSpecifications(
    entries,
    specificationOrder,
    (entry) => entry.entryId
  )
}

function projectView(name: string, root: string) {
  const unavailable = <T extends object>(label: string, value: T): T =>
    new Proxy(value, {
      get(target, key, receiver) {
        if (Reflect.has(target, key)) return Reflect.get(target, key, receiver)
        if (typeof key === 'symbol' || key === 'then' || key === 'toJSON')
          return undefined
        throw new Error(
          `Custom reporter ${label}.${String(key)} needs a broader Next tooling adapter and is not implemented.`
        )
      },
    })
  return unavailable('specification.project', {
    name,
    config: unavailable('specification.project.config', { name, root }),
  })
}

export interface ReporterSpecificationView {
  readonly taskId: string
  readonly project: ReturnType<typeof projectView>
  readonly moduleId: string
  readonly pool: 'forks'
  testLines: number[] | undefined
  testNamePattern: RegExp | undefined
  testIds: string[] | undefined
  testTagsFilter: string[] | undefined
  readonly testModule: unknown
  toJSON(): [
    { name: string; root: string },
    string,
    {
      pool: 'forks'
      testLines: number[] | undefined
      testIds: string[] | undefined
      testNamePattern: RegExp | undefined
      testTagsFilter: string[] | undefined
    },
  ]
}
export interface ReporterSpecificationViews {
  specifications: ReporterSpecificationView[]
  matchesEntry(entry: {
    id: string
    file: string
    projectName?: string
  }): boolean
  projectForEntry(entryId: string): ReturnType<typeof projectView> | undefined
  assertUnchangedSelection(): void
}

/** A reporter's controller view refers only to actual selected file identities. */
export function createReporterRunSpecifications(
  facts: readonly ReporterRunSpecification[],
  getModule: (entryId: string) => unknown
): ReporterSpecificationViews {
  const projects = new Map<string, ReturnType<typeof projectView>>()
  const entries = new Map<string, ReporterRunSpecification>()
  for (const fact of facts) {
    if (
      !fact ||
      typeof fact.entryId !== 'string' ||
      !fact.entryId ||
      typeof fact.moduleId !== 'string' ||
      !isAbsolute(fact.moduleId) ||
      typeof fact.projectId !== 'string' ||
      !fact.projectId ||
      typeof fact.projectName !== 'string' ||
      typeof fact.root !== 'string' ||
      !isAbsolute(fact.root) ||
      fact.pool !== 'forks' ||
      entries.has(fact.entryId)
    )
      throw new Error('Invalid selected Run Start specification.')
    const project = projects.get(fact.projectId)
    if (
      project &&
      (project.name !== fact.projectName || project.config.root !== fact.root)
    )
      throw new Error('Run Start project identity changed.')
    projects.set(
      fact.projectId,
      project ?? projectView(fact.projectName, fact.root)
    )
    entries.set(fact.entryId, fact)
  }
  class TestSpecification {
    taskId: string
    project: ReturnType<typeof projectView>
    moduleId: string
    pool: 'forks'
    testLines: number[] | undefined
    testNamePattern: RegExp | undefined
    testIds: string[] | undefined
    testTagsFilter: string[] | undefined
    #fact: ReporterRunSpecification
    constructor(fact: ReporterRunSpecification) {
      this.#fact = fact
      this.taskId = fact.entryId
      this.project = projects.get(fact.projectId)!
      this.moduleId = fact.moduleId
      this.pool = fact.pool
      this.testLines = undefined
      this.testNamePattern = undefined
      this.testIds = undefined
      this.testTagsFilter = undefined
    }
    get testModule() {
      return getModule(this.#fact.entryId)
    }
    toJSON(): ReturnType<ReporterSpecificationView['toJSON']> {
      return [
        { name: this.project.config.name, root: this.project.config.root },
        this.moduleId,
        {
          pool: this.pool,
          testLines: this.testLines,
          testIds: this.testIds,
          testNamePattern: this.testNamePattern,
          testTagsFilter: this.testTagsFilter,
        },
      ]
    }
  }
  const specifications = facts.map((fact) => new TestSpecification(fact))
  return {
    specifications,
    matchesEntry(entry: { id: string; file: string; projectName?: string }) {
      const fact = entries.get(entry.id)
      return (
        fact !== undefined &&
        entry.file === fact.moduleId &&
        (entry.projectName ?? '') === fact.projectName
      )
    },
    projectForEntry(entryId: string) {
      const fact = entries.get(entryId)
      return fact && projects.get(fact.projectId)
    },
    assertUnchangedSelection() {
      for (let index = 0; index < facts.length; index++) {
        const fact = facts[index]
        const specification = specifications[index]
        if (
          specification.taskId !== fact.entryId ||
          specification.moduleId !== fact.moduleId ||
          specification.pool !== fact.pool ||
          specification.project !== projects.get(fact.projectId) ||
          specification.project.name !== fact.projectName ||
          specification.project.config.name !== fact.projectName ||
          specification.project.config.root !== fact.root ||
          specification.testLines !== undefined ||
          specification.testNamePattern !== undefined ||
          specification.testIds !== undefined ||
          specification.testTagsFilter !== undefined
        )
          throw new Error(
            'Custom reporter specification mutation requires a Next selection adapter and is not implemented.'
          )
      }
    },
  }
}
