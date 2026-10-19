import { CONFIG_FILES } from '../../../shared/lib/constants'
import { randomUUID } from 'crypto'
import { realpath } from 'fs/promises'
import { isAbsolute, join, resolve } from 'path'
import { isDeepStrictEqual } from 'util'
import type { CompiledTestArtifact, TestProfile } from '../contracts'
import type { DiscoveredTestProject } from '../discovery'
import { assertConfigurationImportFiles } from '../compiler/config-import-facts'
import type { ConfigurationImportAuthorization } from '../compiler/config-import-proof'
import type { ConfigurationImportFiles } from '../compiler/config-imports'
import {
  readRuntimeConfigurationImportProof,
  type RuntimeConfigurationEntry,
} from '../compiler/runtime-config-proof'
import {
  assertCoverageSourcePlan,
  configurationInventory,
  readCoverageInput,
  type CoverageSourcePlan,
} from './source-analysis-plan'

interface RuntimeConfigurationRequest {
  profile: TestProfile
  authorization: ConfigurationImportAuthorization
  entries: RuntimeConfigurationEntry[]
}

/** Independent of source expansion: runtime inputs still exist on partial runs. */
export interface RuntimeConfigurationPlan {
  version: 1
  projectDir: string
  requests: RuntimeConfigurationRequest[]
  inputs: { file: string; sha256: string }[]
  configuration: NonNullable<CoverageSourcePlan['configuration']>
}

/** Parent-only sealed fact, retained beside the real entry/revision capture. */
export interface RuntimeConfigurationReceipt {
  version: 1
  kind: 'next-runtime-config-modules'
  authority: Omit<RuntimeConfigurationPlan, 'requests'> & {
    profile: TestProfile
    authorization: ConfigurationImportAuthorization
    entry: RuntimeConfigurationEntry
  }
  compiler: { entryId: string; revision: string; rootDir: string }
  graph: ConfigurationImportFiles
}

export async function createRuntimeConfigurationPlan(options: {
  projectDir: string
  projects: readonly Pick<DiscoveredTestProject, 'profile' | 'entries'>[]
  inputs?: readonly string[]
  signal: AbortSignal
}): Promise<RuntimeConfigurationPlan> {
  options.signal.throwIfAborted()
  const projectDir = await realpath(options.projectDir)
  const projects = options.projects.filter((project) => project.entries.length)
  if (!projects.length)
    return {
      version: 1,
      projectDir,
      requests: [],
      inputs: [],
      configuration: [],
    }
  const ids = new Set<string>()
  for (const { profile } of projects) {
    if (ids.has(profile.id))
      throw new Error('Duplicate runtime configuration profile request.')
    ids.add(profile.id)
  }
  const configuration = await configurationInventory(
    projectDir,
    projects.map((project) => project.profile),
    options.signal
  )
  const last = configuration[configuration.length - 1]
  const selected = CONFIG_FILES.find((name) => last.files.includes(name))
  const configFile = selected ? join(last.directory, selected) : null
  const files = new Set(options.inputs)
  for (const item of configuration)
    for (const file of item.files) files.add(join(item.directory, file))
  return {
    version: 1,
    projectDir,
    configuration,
    inputs: await Promise.all(
      [...files].sort().map((file) => readCoverageInput(file, options.signal))
    ),
    requests: await Promise.all(
      projects.map(async (project) => ({
        profile: { ...project.profile },
        authorization: { id: randomUUID(), configFile },
        entries: await Promise.all(
          project.entries.map(async (entry) => ({
            id: entry.id,
            revision: randomUUID(),
            ...(await readCoverageInput(entry.file, options.signal)),
          }))
        ),
      }))
    ),
  }
}

export async function assertRuntimeConfigurationPlan(
  plan: RuntimeConfigurationPlan,
  signal: AbortSignal
) {
  signal.throwIfAborted()
  if (
    plan.version !== 1 ||
    (await realpath(plan.projectDir)) !== plan.projectDir ||
    (plan.requests.length > 0 && !plan.configuration.length)
  )
    throw new Error('Invalid parent runtime configuration plan.')
  const profiles = new Set<string>(),
    entries = new Set<string>(),
    revisions = new Set<string>()
  for (const request of plan.requests) {
    if (
      !request.profile.id ||
      profiles.has(request.profile.id) ||
      !request.authorization.id ||
      !request.entries.length
    )
      throw new Error('Invalid parent runtime configuration request')
    profiles.add(request.profile.id)
    for (const entry of request.entries) {
      if (
        !entry.id ||
        entries.has(entry.id) ||
        !entry.revision ||
        revisions.has(entry.revision)
      )
        throw new Error('Invalid parent runtime configuration entry/revision')
      entries.add(entry.id)
      revisions.add(entry.revision)
    }
  }
  await assertCoverageSourcePlan(
    {
      version: 1,
      requests: [],
      inputs: [
        ...plan.inputs,
        ...plan.requests.flatMap((request) => request.entries),
      ],
      configuration: plan.configuration,
    },
    signal
  )
}

/** Parent stages before execution; only its post-cleanup seal releases a receipt. */
export async function prepareRuntimeConfigurationReceipt(options: {
  artifact: CompiledTestArtifact
  plan: RuntimeConfigurationPlan
  artifactRoot: string
  signal: AbortSignal
}) {
  const { signal } = options
  const artifact = structuredClone(options.artifact)
  artifact.profile = { ...artifact.profile }
  if (artifact.rootDir !== options.artifactRoot)
    throw new Error('Runtime config proof lacks its parent artifact lease.')
  const request = options.plan.requests.find((candidate) =>
    isDeepStrictEqual(candidate.profile, artifact.profile)
  )
  const entry = request?.entries.find(
    (candidate) =>
      candidate.id === artifact.entryId &&
      candidate.sha256 === artifact.sourceHash
  )
  if (!request || !entry || !artifact.revision)
    throw new Error('Unrequested runtime configuration entry/profile.')
  const authority: RuntimeConfigurationReceipt['authority'] = {
    version: 1,
    projectDir: options.plan.projectDir,
    inputs: options.plan.inputs.map((input) => ({ ...input })),
    configuration: options.plan.configuration.map((item) => ({
      ...item,
      names: item.names.slice(),
      files: item.files.slice(),
    })),
    profile: { ...request.profile },
    authorization: { ...request.authorization },
    entry: { ...entry },
  }
  async function read() {
    await assertRuntimeConfigurationPlan(
      {
        ...authority,
        requests: [
          {
            profile: authority.profile,
            authorization: authority.authorization,
            entries: [authority.entry],
          },
        ],
      },
      signal
    )
    return readRuntimeConfigurationImportProof(
      artifact,
      artifact.runtimeConfigurationImports,
      authority.authorization,
      authority.entry,
      signal
    )
  }
  const graph = await read()
  let sealed = false
  return {
    /** Watch ownership may use verified paths even if the later run fails. */
    inputs: graph.inputs.map((input) => input.file),
    async seal(): Promise<RuntimeConfigurationReceipt> {
      if (sealed)
        throw new Error('Runtime configuration receipt already sealed.')
      const after = await read()
      if (!isDeepStrictEqual(graph, after))
        throw new Error('Runtime config load graph changed during execution.')
      signal.throwIfAborted()
      sealed = true
      return {
        version: 1,
        kind: 'next-runtime-config-modules',
        authority,
        compiler: {
          entryId: artifact.entryId,
          revision: artifact.revision,
          rootDir: artifact.rootDir,
        },
        graph: after,
      }
    },
  }
}

/** Current receipts require the current parent request; cached IDs stay original. */
export async function assertRuntimeConfigurationReceipts(options: {
  receipts: readonly RuntimeConfigurationReceipt[]
  facts: readonly { entryId: string; revision: string }[]
  plan?: RuntimeConfigurationPlan
  signal: AbortSignal
}) {
  const { signal } = options
  if (options.plan) await assertRuntimeConfigurationPlan(options.plan, signal)
  if (options.receipts.length !== options.facts.length)
    throw new Error('Incomplete parent runtime configuration receipts.')
  const seen = new Set<string>()
  for (const receipt of options.receipts) {
    signal.throwIfAborted()
    const { authority, compiler } = receipt
    const fact = options.facts.find(
      (candidate) => candidate.entryId === compiler.entryId
    )
    const current = options.plan?.requests.find(
      (request) =>
        isDeepStrictEqual(request.profile, authority.profile) &&
        isDeepStrictEqual(request.authorization, authority.authorization) &&
        request.entries.some((entry) =>
          isDeepStrictEqual(entry, authority.entry)
        )
    )
    if (
      receipt.version !== 1 ||
      receipt.kind !== 'next-runtime-config-modules' ||
      !fact ||
      seen.has(compiler.entryId) ||
      fact.revision !== compiler.revision ||
      authority.entry.id !== compiler.entryId ||
      authority.entry.revision !== compiler.revision ||
      !compiler.rootDir ||
      !isAbsolute(compiler.rootDir) ||
      resolve(compiler.rootDir) !== compiler.rootDir ||
      (options.plan &&
        (!current ||
          authority.projectDir !== options.plan.projectDir ||
          !isDeepStrictEqual(authority.inputs, options.plan.inputs) ||
          !isDeepStrictEqual(
            authority.configuration,
            options.plan.configuration
          )))
    )
      throw new Error(
        'Unrequested or incompatible parent runtime config receipt.'
      )
    seen.add(compiler.entryId)
    await assertRuntimeConfigurationPlan(
      {
        version: authority.version,
        projectDir: authority.projectDir,
        inputs: authority.inputs,
        configuration: authority.configuration,
        requests: [
          {
            profile: authority.profile,
            authorization: authority.authorization,
            entries: [authority.entry],
          },
        ],
      },
      signal
    )
    await assertConfigurationImportFiles(
      receipt.graph,
      authority.authorization.configFile,
      signal
    )
  }
  signal.throwIfAborted()
}

/** Match actual scheduled entries, independently of a supplied compilation payload. */
export function assertRuntimeConfigurationSelection(
  plan: RuntimeConfigurationPlan,
  projectDir: string,
  projects: readonly Pick<DiscoveredTestProject, 'profile' | 'entries'>[]
) {
  const selected = projects.filter((project) => project.entries.length)
  if (
    plan.projectDir !== projectDir ||
    selected.length !== plan.requests.length ||
    selected.some((project) => {
      const request = plan.requests.find((candidate) =>
        isDeepStrictEqual(candidate.profile, project.profile)
      )
      return (
        !request ||
        request.entries.length !== project.entries.length ||
        project.entries.some(
          (entry) =>
            !request.entries.some(
              (candidate) =>
                candidate.id === entry.id && candidate.file === entry.file
            )
        )
      )
    })
  )
    throw new Error(
      'Runtime config plan differs from parent scheduling selection'
    )
}
