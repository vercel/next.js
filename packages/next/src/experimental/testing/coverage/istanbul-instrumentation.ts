import { readFile, readdir, realpath } from 'fs/promises'
import { isAbsolute, join, resolve, relative, sep } from 'path'
import { isDeepStrictEqual } from 'util'
import { randomUUID } from 'crypto'
import { instrumentJavaScript } from '../../../compiled/next-test-instrumentation'
import { openCompilerTransformBroker } from '../compiler/transform-broker'
import { coverageHash, within } from './artifact'
import { standardCoverageSourceSelector } from './options'
import { assertIstanbulProfile } from './istanbul-profile'
import { assertIstanbulCjsSource } from './istanbul-cjs'
import type { TestProfile } from '../contracts'
import type { StandardCoverageOptions } from './types'
import type {
  IstanbulSourcePlan,
  IstanbulInstrumentationDescriptor,
  IstanbulInstrumentationMetadata,
} from './istanbul-types'

/** The same finite selection is used before emission and at the loader seam. */
export function istanbulSourceSelector(
  root: string,
  config: StandardCoverageOptions,
  excludedFiles: readonly string[]
) {
  const selected = standardCoverageSourceSelector(root, config)
  const excluded = new Set(excludedFiles)
  const output = resolve(root, config.reportsDirectory)
  return (file: string) =>
    within(root, file) &&
    !within(output, file) &&
    !relative(root, file)
      .split(sep)
      .some((part) => part.startsWith('.') || part === 'node_modules') &&
    /\.[cm]?[jt]sx?$/.test(file) &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) &&
    !excluded.has(file) &&
    selected(file)
}

/** JavaScript selection does not issue native TypeScript declaration roles. */
export async function createIstanbulSourcePlan(options: {
  projectDir: string
  profile: TestProfile
  config: StandardCoverageOptions
  excludedFiles: readonly string[]
  signal: AbortSignal
}): Promise<IstanbulSourcePlan> {
  assertIstanbulProfile(options.profile)
  options.signal.throwIfAborted()
  const importedOnly = options.config.include === undefined
  const root = await realpath(options.projectDir)
  const output = resolve(root, options.config.reportsDirectory)
  const selected = istanbulSourceSelector(
    root,
    options.config,
    options.excludedFiles
  )
  const excluded = new Set(options.excludedFiles)
  const sources: IstanbulSourcePlan['sources'] = []
  async function visit(directory: string) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      options.signal.throwIfAborted()
      const file = join(directory, item.name)
      if (
        item.name.startsWith('.') ||
        item.name === 'node_modules' ||
        file === output
      )
        continue
      if (item.isDirectory()) {
        await visit(file)
        continue
      }
      if (
        !selected(file) ||
        excluded.has(file) ||
        /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) ||
        !/\.[cm]?[jt]sx?$/.test(file)
      )
        continue
      if (!item.isFile() || (await realpath(file)) !== file)
        throw new Error('Istanbul source must be a canonical regular file.')
      if (!/\.(?:js|mjs|cjs)$/.test(file)) {
        if (importedOnly) continue
        throw new Error(
          'Private Istanbul selection supports only JS, MJS and CJS.'
        )
      }
      const bytes = await readFile(file)
      if (!importedOnly) assertIstanbulCjsSource(bytes.toString('utf8'), file)
      sources.push({ file, sha256: coverageHash(bytes) })
    }
  }
  await visit(root)
  return {
    version: 1,
    ...(importedOnly ? { importedOnly: true as const } : {}),
    profile: { ...options.profile },
    sources: sources.sort((a, b) => a.file.localeCompare(b.file)),
  }
}

export async function assertIstanbulSourcePlan(
  plan: IstanbulSourcePlan,
  signal: AbortSignal
) {
  if (
    plan.version !== 1 ||
    !Array.isArray(plan.sources) ||
    ('importedOnly' in plan && plan.importedOnly !== true)
  )
    throw new Error('Invalid Istanbul source plan.')
  assertIstanbulProfile(plan.profile)
  const files = new Set<string>()
  for (const source of plan.sources) {
    signal.throwIfAborted()
    if (
      !isAbsolute(source.file) ||
      resolve(source.file) !== source.file ||
      !/\.(?:js|mjs|cjs)$/.test(source.file) ||
      files.has(source.file) ||
      (await realpath(source.file)) !== source.file ||
      coverageHash(await readFile(source.file)) !== source.sha256
    )
      throw new Error('Istanbul selected source changed or is invalid.')
    if (!plan.importedOnly && source.file.endsWith('.cjs'))
      assertIstanbulCjsSource(await readFile(source.file, 'utf8'), source.file)
    files.add(source.file)
  }
}

/** One owned service produces actual code/maps and initial zeros without evaluation. */
export async function openIstanbulInstrumentation(options: {
  projectDir: string
  plan: IstanbulSourcePlan
  signal: AbortSignal
  /** Effective selection; supplied only for the actual loaded-source lane. */
  selectSource?: (file: string) => boolean
}) {
  await assertIstanbulSourcePlan(options.plan, options.signal)
  const root = await realpath(options.projectDir)
  if (options.plan.importedOnly && !options.selectSource)
    throw new Error(
      'Loaded Istanbul selection requires its actual source selector.'
    )
  if (!options.plan.importedOnly && options.selectSource)
    throw new Error('Unrequested loaded Istanbul source selector.')
  const metadata: IstanbulInstrumentationMetadata = {
    version: 1,
    ...(options.plan.importedOnly ? { importedOnly: true } : {}),
    sources: [],
  }
  const selected = new Map(
    options.plan.sources.map((source) => [source.file, source])
  )
  const instrumented = new Map<
    string,
    IstanbulInstrumentationMetadata['sources'][number]
  >()
  for (const source of options.plan.sources) {
    if (!within(root, source.file))
      throw new Error('Istanbul selected source escapes its project.')
    if (!options.plan.importedOnly) {
      const { initial } = instrumentJavaScript(
        await readFile(source.file, 'utf8'),
        source.file
      )
      const observed = { ...source, initial }
      metadata.sources.push(observed)
      instrumented.set(source.file, observed)
    }
  }
  const broker = await openCompilerTransformBroker(
    randomUUID(),
    async (input) => {
      options.signal.throwIfAborted()
      const source = selected.get(input.file)
      if (!source) {
        if (options.plan.importedOnly && options.selectSource!(input.file))
          throw new Error(
            'Loaded Istanbul source was not in the original candidate plan.'
          )
        return {
          code: input.code,
          map: input.map,
          dependencies: [],
          warnings: [],
        }
      }
      if (
        input.query !== '' ||
        input.moduleType !== 'js' ||
        input.map !== undefined ||
        coverageHash(input.code) !== source.sha256 ||
        coverageHash(await readFile(input.file)) !== source.sha256
      )
        throw new Error(
          'Istanbul loader source or unmapped JavaScript phase differs.'
        )
      assertIstanbulCjsSource(input.code, input.file)
      const result = instrumentJavaScript(input.code, input.file)
      const previous = instrumented.get(input.file)
      if (previous && !isDeepStrictEqual(result.initial, previous.initial))
        throw new Error('Istanbul instrumenter declaration map changed.')
      instrumented.set(input.file, { ...source, initial: result.initial })
      return {
        code: result.code,
        map: result.map,
        dependencies: [],
        warnings: [],
      }
    },
    { signal: options.signal }
  )
  const descriptor: IstanbulInstrumentationDescriptor = {
    version: 1,
    transport: broker.descriptor,
    profile: { ...options.plan.profile },
    metadata: structuredClone(metadata),
  }
  return {
    descriptor,
    ...(options.plan.importedOnly
      ? {
          readMetadata(
            sourceFiles: readonly string[]
          ): IstanbulInstrumentationMetadata {
            options.signal.throwIfAborted()
            const sources: IstanbulInstrumentationMetadata['sources'] = []
            for (const file of [...new Set(sourceFiles)].sort()) {
              if (!options.selectSource!(file)) continue
              if (!/\.(?:js|mjs|cjs)$/.test(file))
                throw new Error(
                  'Loaded Istanbul TypeScript and JSX imports are not implemented.'
                )
              const observed = instrumented.get(file)
              if (!selected.has(file) || !observed)
                throw new Error(
                  'Loaded Istanbul artifact omitted its actual loader observation.'
                )
              sources.push(structuredClone(observed))
            }
            return { version: 1, importedOnly: true, sources }
          },
        }
      : {}),
    dispose: broker.dispose,
  }
}
