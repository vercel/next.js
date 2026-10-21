import {
  assertRuntimeConfigurationReceipts,
  type RuntimeConfigurationPlan,
  type RuntimeConfigurationReceipt,
} from './runtime-configuration'
import { lstat, readFile, realpath } from 'node:fs/promises'
import type { WatchRegistrySnapshot } from '../incremental/registry-additions'
import { coverageHash } from './artifact'
import {
  assertStandardCoverageFacts,
  type StandardCoverageSourcePlans,
} from './report-standard'
import type { StandardFileCoverage } from './types'

interface Generation {
  registry?: WatchRegistrySnapshot
  facts: Map<string, StandardFileCoverage>
  runtimeConfiguration?: Map<string, RuntimeConfigurationReceipt>
}

function sameInputs(left: WatchRegistrySnapshot, right: WatchRegistrySnapshot) {
  const inputs = new Map(
    right.inputs.map((input) => [input.file, input.sourceHash])
  )
  return (
    left.configurationRevision === right.configurationRevision &&
    left.inputs.length === right.inputs.length &&
    left.inputs.every((input) => inputs.get(input.file) === input.sourceHash)
  )
}

function sameEntry(
  left: WatchRegistrySnapshot,
  right: WatchRegistrySnapshot,
  id: string
) {
  const before = left.entries.find((entry) => entry.id === id)
  const after = right.entries.find((entry) => entry.id === id)
  return (
    !!before &&
    !!after &&
    before.file === after.file &&
    before.sourceHash === after.sourceHash
  )
}

/** Facts enter only after the generation's process, broker and compiler owners close. */
export function createStandardCoverageGenerationCache(projectDir: string) {
  let generation: Generation | undefined

  function retained(
    registry: WatchRegistrySnapshot | undefined,
    selected: ReadonlySet<string>
  ) {
    const previous = generation?.registry
    if (!registry || !previous || !sameInputs(previous, registry))
      return undefined
    const facts = new Map<string, StandardFileCoverage>()
    for (const entry of registry.entries) {
      if (selected.has(entry.id)) continue
      const fact = generation!.facts.get(entry.id)
      if (!fact || !sameEntry(previous, registry, entry.id)) return undefined
      facts.set(entry.id, fact)
    }
    return facts
  }

  function retainedConfiguration(
    facts: ReadonlyMap<string, StandardFileCoverage>
  ) {
    if (!generation?.runtimeConfiguration) return undefined
    const receipts: RuntimeConfigurationReceipt[] = []
    for (const id of facts.keys()) {
      const receipt = generation.runtimeConfiguration.get(id)
      if (!receipt) return undefined
      receipts.push(receipt)
    }
    return receipts
  }

  async function validateRegistry(
    registry: WatchRegistrySnapshot | undefined,
    signal?: AbortSignal
  ) {
    if (!registry) return
    for (const input of [...registry.inputs, ...registry.entries]) {
      signal?.throwIfAborted()
      if (
        !(await lstat(input.file)).isFile() ||
        (await realpath(input.file)) !== input.file ||
        coverageHash(await readFile(input.file)) !== input.sourceHash
      )
        throw new Error('Watch coverage inputs changed after discovery.')
    }
    signal?.throwIfAborted()
  }

  return {
    /** Missing/stale retained evidence broadens execution; it never estimates missing hits. */
    async selectEntryIds(options: {
      registry?: WatchRegistrySnapshot
      entryIds: readonly string[]
      selected: readonly string[]
      cleanOnRerun?: boolean
      /** Public standard watch requires receipts even with no source expansion. */
      requireRuntimeConfiguration?: boolean
      signal?: AbortSignal
    }): Promise<string[]> {
      options.signal?.throwIfAborted()
      if (options.cleanOnRerun !== false) return [...options.selected]
      const selected = new Set(options.selected)
      if (options.entryIds.every((id) => selected.has(id)))
        return [...options.selected]
      const facts = retained(options.registry, selected)
      if (!facts) return [...options.entryIds]
      try {
        await validateRegistry(options.registry, options.signal)
        await assertStandardCoverageFacts(
          [...facts.values()],
          projectDir,
          new Set(facts.keys())
        )
        if (
          options.requireRuntimeConfiguration ||
          generation?.runtimeConfiguration
        ) {
          const receipts = retainedConfiguration(facts)
          if (!receipts) return [...options.entryIds]
          await assertRuntimeConfigurationReceipts({
            receipts,
            facts: [...facts.values()],
            signal: options.signal ?? new AbortController().signal,
          })
        }
      } catch (error) {
        options.signal?.throwIfAborted()
        // An unavailable previous original source cannot certify a partial rerun.
        return [...options.entryIds]
      }
      return [...options.selected]
    },

    async prepare(options: {
      facts: unknown
      expected: ReadonlySet<string>
      revisions: ReadonlyMap<string, string>
      registry?: WatchRegistrySnapshot
      cleanOnRerun?: boolean
      runtimeConfiguration?: {
        plan: RuntimeConfigurationPlan
        receipts: readonly RuntimeConfigurationReceipt[]
      }
      signal?: AbortSignal
    }) {
      options.signal?.throwIfAborted()
      const incoming = await assertStandardCoverageFacts(
        options.facts,
        projectDir,
        options.expected,
        options.revisions
      )
      const runtimeSignal = options.signal ?? new AbortController().signal
      if (generation?.runtimeConfiguration && !options.runtimeConfiguration)
        throw new Error(
          'Watch coverage runtime configuration context is missing.'
        )
      if (options.runtimeConfiguration)
        await assertRuntimeConfigurationReceipts({
          ...options.runtimeConfiguration,
          facts: incoming,
          signal: runtimeSignal,
        })
      const previous =
        options.cleanOnRerun === false
          ? retained(options.registry, options.expected)
          : new Map<string, StandardFileCoverage>()
      // A full generation needs no older evidence, including after config changes.
      const allSelected =
        !options.registry ||
        options.registry.entries.every((entry) =>
          options.expected.has(entry.id)
        )
      if (!previous && !allSelected)
        throw new Error(
          'Watch coverage has no valid facts for an unselected entry.'
        )
      const facts = new Map(previous ?? [])
      for (const fact of incoming) facts.set(fact.entryId, fact)
      await validateRegistry(options.registry, options.signal)
      await assertStandardCoverageFacts(
        [...facts.values()],
        projectDir,
        new Set(facts.keys())
      )
      let runtimeConfiguration:
        | Map<string, RuntimeConfigurationReceipt>
        | undefined
      if (options.runtimeConfiguration) {
        const oldReceipts = previous?.size
          ? retainedConfiguration(previous)
          : []
        if (!oldReceipts && !allSelected)
          throw new Error(
            'Watch coverage has no retained parent configuration receipt.'
          )
        runtimeConfiguration = new Map(
          (oldReceipts ?? []).map((receipt) => [
            receipt.compiler.entryId,
            receipt,
          ])
        )
        for (const receipt of options.runtimeConfiguration.receipts)
          runtimeConfiguration.set(receipt.compiler.entryId, receipt)
        await assertRuntimeConfigurationReceipts({
          receipts: [...runtimeConfiguration.values()],
          facts: [...facts.values()],
          signal: runtimeSignal,
        })
      }
      options.signal?.throwIfAborted()
      // Both the staged state and published facts have independent byte/value ownership.
      const next: Generation = {
        ...(runtimeConfiguration
          ? {
              runtimeConfiguration: new Map(
                [...runtimeConfiguration].map(([id, receipt]) => [
                  id,
                  structuredClone(receipt),
                ])
              ),
            }
          : {}),
        registry: options.registry
          ? structuredClone(options.registry)
          : undefined,
        facts: new Map(
          [...facts].map(([id, fact]) => [id, structuredClone(fact)])
        ),
      }
      const baseline = generation
      let committed = false
      return {
        facts: [...facts.values()].map((fact) => structuredClone(fact)),
        expected: new Set(facts.keys()),
        ...(runtimeConfiguration
          ? {
              runtimeConfigurationReceipts: [
                ...runtimeConfiguration.values(),
              ].map((receipt) => structuredClone(receipt)),
            }
          : {}),
        commit() {
          options.signal?.throwIfAborted()
          if (committed || generation !== baseline)
            throw new Error(
              'Watch coverage generation no longer owns its cache commit.'
            )
          committed = true
          generation = next
        },
      }
    },
  }
}

/** Only the parent supplies observed diagnostics/outcomes, after process cleanup. */
export async function validateStandardWatchCoverage(options: {
  projectDir: string
  facts: unknown
  expected: ReadonlySet<string>
  revisions: ReadonlyMap<string, string>
  status: string
  terminalStatus: string | undefined
  compilationFailures: ReadonlySet<string>
  fileOutcomes: ReadonlyMap<string, string>
  allowCompilationFailure: boolean
  sourcePlans?: StandardCoverageSourcePlans
}): Promise<StandardFileCoverage[] | undefined> {
  const supplied = options.facts
  const missing = Array.isArray(supplied)
    ? [...options.expected].filter(
        (id) =>
          !supplied.some(
            (fact: unknown) =>
              fact &&
              typeof fact === 'object' &&
              'entryId' in fact &&
              fact.entryId === id
          )
      )
    : []
  const incomplete =
    options.allowCompilationFailure &&
    options.status === 'failed' &&
    options.terminalStatus === 'failed' &&
    missing.length > 0 &&
    missing.every(
      (id) =>
        options.compilationFailures.has(id) &&
        options.fileOutcomes.get(id) === 'failed'
    )
  await assertStandardCoverageFacts(
    options.facts,
    options.projectDir,
    incomplete
      ? new Set([...options.expected].filter((id) => !missing.includes(id)))
      : options.expected,
    options.revisions,
    options.sourcePlans
  )
  // Never forward partial facts or infer zero counters for failed compilation.
  if (!incomplete) return options.facts as StandardFileCoverage[]
}
