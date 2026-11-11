import { isDeepStrictEqual } from 'util'
import { readFile } from 'fs/promises'
import { coverageHash } from './artifact'
import { readConfigurationImportProof } from '../compiler/config-import-proof'
import {
  readIstanbulTypeScriptDeclarations,
  regenerateIstanbulTypeScriptSource,
} from './istanbul-typescript-artifact'
import type { CompiledTestArtifact, TestEntry } from '../contracts'
import type { CompiledCoverageSource } from './types'
import type { RuntimeConfigurationPlan } from './runtime-configuration'
import type {
  IstanbulSourcePlan,
  IstanbulSourceDeclarations,
  IstanbulInstrumentationMetadata,
} from './istanbul-types'

/** Actual parent-owned declaration records; these never grant execution rights. */
export function appendIstanbulDeclarations(
  target: IstanbulSourceDeclarations[],
  records: readonly IstanbulSourceDeclarations[]
) {
  for (const record of records) {
    for (const previous of target) {
      if (previous.source.file !== record.source.file) continue
      if (isDeepStrictEqual(previous.owner, record.owner))
        throw new Error('Duplicate parent typed Istanbul declaration owner.')
      if (
        !isDeepStrictEqual(previous.profile, record.profile) ||
        !isDeepStrictEqual(previous.source, record.source) ||
        !isDeepStrictEqual(
          previous.typeScriptSource,
          record.typeScriptSource
        ) ||
        !isDeepStrictEqual(previous.initial, record.initial)
      )
        throw new Error(
          'Conflicting actual typed Istanbul compiler declarations.'
        )
    }
    target.push(structuredClone(record))
  }
}

export async function readIstanbulCompilerDeclarations(options: {
  compiled: CompiledCoverageSource
  projectDir: string
  plan: IstanbulSourcePlan
  configurationPlan: RuntimeConfigurationPlan
  signal: AbortSignal
  assertLease(): void
}): Promise<IstanbulSourceDeclarations[]> {
  const { compiled, plan, signal } = options
  options.assertLease()
  const artifact = compiled.artifact
  const selected = plan.sources.find(
    (source) => source.declarationRevision === artifact.revision
  )
  const request = options.configurationPlan.requests.find((candidate) =>
    isDeepStrictEqual(candidate.profile, plan.profile)
  )
  if (
    !selected?.declarationRevision ||
    !request ||
    compiled.version !== 1 ||
    compiled.kind !== 'next-compiler-source' ||
    !isDeepStrictEqual(compiled.source, {
      file: selected.file,
      sha256: selected.sha256,
    }) ||
    artifact.sourceHash !== selected.sha256 ||
    artifact.setupFiles?.length ||
    artifact.snapshotSerializers?.length ||
    artifact.runtimeConfigurationImports ||
    artifact.nativeTsConfigInputs ||
    artifact.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  )
    throw new Error(
      'Typed Istanbul source analysis lacks its exact parent request.'
    )
  await readConfigurationImportProof(
    artifact,
    compiled.configurationImports,
    request.authorization,
    signal
  )
  const sources = artifact.coverage?.istanbul?.sources.filter(
    (source) => source.file === selected.file
  )
  if (
    sources?.length !== 1 ||
    !sources[0].typeScriptSource ||
    sources[0].sha256 !== selected.sha256
  )
    throw new Error(
      'Typed Istanbul source analysis omitted its actual declarations.'
    )
  const result = await readIstanbulTypeScriptDeclarations({
    artifact,
    source: sources[0],
    projectDir: options.projectDir,
    profile: plan.profile,
    owner: { kind: 'compiler-source', revision: selected.declarationRevision },
    signal,
    assertLease: options.assertLease,
  })
  options.assertLease()
  return [result]
}

export async function readIstanbulRuntimeDeclarations(options: {
  artifact: CompiledTestArtifact
  entry: TestEntry
  projectDir: string
  plan: IstanbulSourcePlan
  signal: AbortSignal
  assertLease(): void
}): Promise<IstanbulSourceDeclarations[]> {
  const { artifact, entry, plan, signal } = options
  options.assertLease()
  if (
    artifact.entryId !== entry.id ||
    !isDeepStrictEqual(entry.profile, plan.profile) ||
    artifact.sourceHash !== coverageHash(await readFile(entry.file)) ||
    artifact.coverage?.sourceAnalysis ||
    artifact.nativeTsConfigInputs ||
    artifact.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  )
    throw new Error(
      'Typed Istanbul runtime artifact differs from parent scheduling.'
    )
  const records: IstanbulSourceDeclarations[] = []
  for (const source of artifact.coverage?.istanbul?.sources ?? []) {
    if (!source.typeScriptSource) continue
    const selected = plan.sources.find(
      (candidate) => candidate.file === source.file
    )
    if (!selected || selected.sha256 !== source.sha256)
      throw new Error(
        'Typed Istanbul runtime artifact contains an unplanned source.'
      )
    records.push(
      await readIstanbulTypeScriptDeclarations({
        artifact,
        source,
        projectDir: options.projectDir,
        profile: plan.profile,
        owner: {
          kind: 'runtime-entry',
          entryId: entry.id,
          revision: artifact.revision,
        },
        signal,
        assertLease: options.assertLease,
      })
    )
  }
  options.assertLease()
  return records
}

/** Revalidate parent-produced records and all current source/owner identities. */
export async function assertIstanbulSourceDeclarations(options: {
  declarations?: readonly IstanbulSourceDeclarations[]
  projectDir: string
  plan: IstanbulSourcePlan
  expected: ReadonlySet<string>
  revisions?: ReadonlyMap<string, string>
  signal: AbortSignal
}) {
  const records = options.declarations ?? []
  if (!Array.isArray(records))
    throw new Error('Missing parent typed Istanbul declaration records.')
  const checked: IstanbulSourceDeclarations[] = []
  const sources = new Map<
    string,
    IstanbulInstrumentationMetadata['sources'][number]
  >()
  const runtime = new Map<string, Set<string>>()
  for (const record of records) {
    options.signal.throwIfAborted()
    const selected = options.plan.sources.find(
      (source) => source.file === record?.source?.file
    )
    if (
      !selected ||
      !/\.(?:ts|mts|[jt]sx)$/.test(selected.file) ||
      record.version !== 1 ||
      !isDeepStrictEqual(record.profile, options.plan.profile) ||
      !isDeepStrictEqual(record.source, {
        file: selected.file,
        sha256: selected.sha256,
      }) ||
      !record.owner ||
      (record.owner.kind === 'compiler-source'
        ? !selected.declarationRevision ||
          record.owner.revision !== selected.declarationRevision ||
          options.plan.importedOnly
        : record.owner.kind !== 'runtime-entry' ||
          !options.expected.has(record.owner.entryId) ||
          !record.owner.revision ||
          (options.revisions &&
            options.revisions.get(record.owner.entryId) !==
              record.owner.revision))
    )
      throw new Error('Unrequested typed Istanbul declaration record.')
    appendIstanbulDeclarations(checked, [record])
    const source = {
      file: record.source.file,
      sha256: record.source.sha256,
      typeScriptSource: record.typeScriptSource,
      initial: record.initial,
    }
    await regenerateIstanbulTypeScriptSource(
      source,
      options.projectDir,
      options.signal
    )
    sources.set(source.file, source)
    if (record.owner.kind === 'runtime-entry') {
      const files = runtime.get(record.owner.entryId) ?? new Set<string>()
      files.add(source.file)
      runtime.set(record.owner.entryId, files)
    }
  }
  for (const selected of options.plan.sources) {
    if (!selected.declarationRevision) continue
    if (
      !checked.some(
        (record) =>
          record.source.file === selected.file &&
          record.owner.kind === 'compiler-source' &&
          record.owner.revision === selected.declarationRevision
      )
    )
      throw new Error(
        'Explicit typed Istanbul source omitted its actual compiler declarations.'
      )
  }
  return { sources, runtime }
}
