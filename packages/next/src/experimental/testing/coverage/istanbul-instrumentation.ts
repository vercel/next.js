import { readFile, readdir, realpath } from 'fs/promises'
import { isAbsolute, join, resolve, relative, sep } from 'path'
import { isDeepStrictEqual } from 'util'
import { randomUUID } from 'crypto'
import {
  instrumentJavaScript,
  instrumentMappedJavaScript,
} from '../../../compiled/next-test-instrumentation'
import { openCompilerTransformBroker } from '../compiler/transform-broker'
import { coverageHash, within } from './artifact'
import { standardCoverageSourceSelector } from './options'
import {
  assertIstanbulProfile,
  assertIstanbulSourceExtension,
} from './istanbul-profile'
import { assertIstanbulCjsSource } from './istanbul-cjs'
import type { TestProfile } from '../contracts'
import type { StandardCoverageOptions } from './types'
import type {
  IstanbulSourcePlan,
  IstanbulInstrumentationDescriptor,
  IstanbulInstrumentationMetadata,
  IstanbulTypeScriptOptionsGetter,
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
      if (
        options.profile.mode === 'production' &&
        !/\.(?:js|mjs)$/.test(file)
      ) {
        if (importedOnly) continue
        assertIstanbulSourceExtension(options.profile, file)
      }
      const typed =
        /\.(?:ts|mts|[jt]sx)$/.test(file) && !/\.d\.(?:ts|mts|tsx)$/.test(file)
      if (!/\.(?:js|mjs|cjs)$/.test(file) && !typed) {
        if (importedOnly) continue
        throw new Error(
          'Private Istanbul selection supports only JS, MJS and CJS.'
        )
      }
      const bytes = await readFile(file)
      if (
        typed &&
        !importedOnly &&
        !(
          await import('./istanbul-typescript-artifact.js')
        ).isIstanbulTypeScriptSource(file, bytes.toString('utf8'))
      )
        throw new Error(
          'Private Istanbul selection supports only JS, MJS and CJS.'
        )
      if (!importedOnly && !typed)
        assertIstanbulCjsSource(bytes.toString('utf8'), file)
      sources.push({
        file,
        sha256: coverageHash(bytes),
        ...(typed && !importedOnly
          ? { declarationRevision: randomUUID() }
          : {}),
      })
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
  let declarationRevisions: Set<string> | undefined
  for (const source of plan.sources) {
    signal.throwIfAborted()
    if (
      !isAbsolute(source.file) ||
      resolve(source.file) !== source.file ||
      !/\.(?:js|mjs|cjs|ts|mts|[jt]sx)$/.test(source.file) ||
      /\.d\.(?:ts|mts|tsx)$/.test(source.file) ||
      files.has(source.file) ||
      (await realpath(source.file)) !== source.file ||
      coverageHash(await readFile(source.file)) !== source.sha256
    )
      throw new Error('Istanbul selected source changed or is invalid.')
    assertIstanbulSourceExtension(plan.profile, source.file)
    if (/\.(?:ts|mts|[jt]sx)$/.test(source.file)) {
      if (plan.importedOnly) {
        if (Object.hasOwn(source, 'declarationRevision'))
          throw new Error(
            'Loaded typed Istanbul selection cannot issue eager declaration requests.'
          )
      } else {
        if (
          typeof source.declarationRevision !== 'string' ||
          !source.declarationRevision ||
          (declarationRevisions ??= new Set()).has(
            source.declarationRevision
          ) ||
          !(
            await import('./istanbul-typescript-artifact.js')
          ).isIstanbulTypeScriptSource(
            source.file,
            await readFile(source.file, 'utf8')
          )
        )
          throw new Error('Invalid typed Istanbul source declaration request.')
        declarationRevisions.add(source.declarationRevision)
      }
    } else if (Object.hasOwn(source, 'declarationRevision'))
      throw new Error('Unrequested typed Istanbul declaration revision.')
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
  const hasTypeScript = options.plan.sources.some((source) =>
    /\.(?:ts|mts|[jt]sx)$/.test(source.file)
  )
  let getTypeScriptOptions: IstanbulTypeScriptOptionsGetter | undefined
  let disposed = false
  let typedOutputs:
    | Map<string, Promise<ReturnType<typeof instrumentMappedJavaScript>>>
    | undefined
  let pendingTyped:
    | Set<Promise<ReturnType<typeof instrumentMappedJavaScript>>>
    | undefined
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
    if (
      !options.plan.importedOnly &&
      !/\.(?:ts|mts|[jt]sx)$/.test(source.file)
    ) {
      const { initial } = instrumentJavaScript(
        await readFile(source.file, 'utf8'),
        source.file
      )
      const observed = { ...source, initial }
      metadata.sources.push(observed)
      instrumented.set(source.file, observed)
    }
  }
  async function lowerTypeScript(
    source: IstanbulSourcePlan['sources'][number],
    code: string
  ) {
    if (disposed || !getTypeScriptOptions)
      throw new Error(
        'Typed Istanbul requires its live actual Session options getter.'
      )
    const actualOptions = await getTypeScriptOptions(source, options.signal)
    const previous = typedOutputs?.get(source.file)
    if (previous) return previous
    const task = (async () => {
      const { transform } = await import('../../../build/swc/index.js')
      const lowered = await transform(code, actualOptions)
      const map =
        typeof lowered.map === 'string' ? JSON.parse(lowered.map) : lowered.map
      if (typeof lowered.code !== 'string' || !map)
        throw new Error(
          'Typed Istanbul compiler did not return its actual code and source map.'
        )
      const result = instrumentMappedJavaScript(lowered.code, source.file, map)
      const { bindIstanbulTypeScriptBodyMappings } = await import(
        './istanbul-typescript-body-map.js'
      )
      if (
        !bindIstanbulTypeScriptBodyMappings({
          file: source.file,
          authoredSource: code,
          emittedSource: lowered.code,
          rawCoverage: result.initial,
        })
      )
        throw new Error(
          'Typed Istanbul compiler source-map roles are incomplete or ambiguous.'
        )
      options.signal.throwIfAborted()
      if (
        disposed ||
        coverageHash(await readFile(source.file)) !== source.sha256
      )
        throw new Error(
          'Typed Istanbul source changed or its service closed during lowering.'
        )
      const observed = {
        file: source.file,
        sha256: source.sha256,
        initial: result.initial,
        typeScriptSource: {
          version: 1 as const,
          code: lowered.code,
          inputSourceMap: map,
        },
      }
      const previousRecord = instrumented.get(source.file)
      if (previousRecord && !isDeepStrictEqual(previousRecord, observed))
        throw new Error('Typed Istanbul actual compiler declarations changed.')
      instrumented.set(source.file, observed)
      if (
        !options.plan.importedOnly &&
        !metadata.sources.some((value) => value.file === source.file)
      ) {
        metadata.sources.push(observed)
        metadata.sources.sort((a, b) => a.file.localeCompare(b.file))
      }
      return result
    })()
    ;(typedOutputs ??= new Map()).set(source.file, task)
    ;(pendingTyped ??= new Set()).add(task)
    try {
      return await task
    } finally {
      pendingTyped.delete(task)
    }
  }
  const broker = await openCompilerTransformBroker(
    randomUUID(),
    async (input) => {
      options.signal.throwIfAborted()
      const source = selected.get(input.file)
      if (!source) {
        if (options.plan.importedOnly && options.selectSource!(input.file))
          assertIstanbulSourceExtension(options.plan.profile, input.file)
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
      assertIstanbulSourceExtension(options.plan.profile, source.file)
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
      if (/\.(?:ts|mts|[jt]sx)$/.test(source.file)) {
        const result = await lowerTypeScript(source, input.code)
        return {
          code: result.code,
          map: result.map,
          dependencies: [],
          warnings: [],
        }
      }
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
    ...(options.plan.importedOnly && !hasTypeScript
      ? {
          readMetadata(
            sourceFiles: readonly string[]
          ): IstanbulInstrumentationMetadata {
            options.signal.throwIfAborted()
            const sources: IstanbulInstrumentationMetadata['sources'] = []
            for (const file of [...new Set(sourceFiles)].sort()) {
              if (!options.selectSource!(file)) continue
              assertIstanbulSourceExtension(options.plan.profile, file)
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
    ...(hasTypeScript
      ? {
          async prepareTypeScript(getOptions: IstanbulTypeScriptOptionsGetter) {
            if (
              disposed ||
              getTypeScriptOptions ||
              typeof getOptions !== 'function'
            )
              throw new Error(
                'Typed Istanbul options initialization is missing, repeated or closed.'
              )
            getTypeScriptOptions = getOptions
            if (!options.plan.importedOnly)
              for (const source of options.plan.sources) {
                if (!/\.(?:ts|mts|[jt]sx)$/.test(source.file)) continue
                const code = await readFile(source.file, 'utf8')
                if (coverageHash(code) !== source.sha256)
                  throw new Error(
                    'Typed Istanbul eager source changed before lowering.'
                  )
                await lowerTypeScript(source, code)
              }
            return structuredClone(metadata)
          },
          readMetadata(
            sourceFiles: readonly string[]
          ): IstanbulInstrumentationMetadata {
            options.signal.throwIfAborted()
            const files = new Set(sourceFiles)
            const sources: IstanbulInstrumentationMetadata['sources'] = []
            for (const source of options.plan.sources) {
              if (
                (options.plan.importedOnly ||
                  /\.(?:ts|mts|[jt]sx)$/.test(source.file)) &&
                !files.has(source.file)
              )
                continue
              if (
                options.plan.importedOnly &&
                !options.selectSource!(source.file)
              )
                continue
              const observed = instrumented.get(source.file)
              if (!observed)
                throw new Error(
                  'Loaded typed Istanbul artifact omitted its actual loader observation.'
                )
              sources.push(structuredClone(observed))
            }
            return {
              version: 1,
              ...(options.plan.importedOnly
                ? { importedOnly: true as const }
                : {}),
              sources,
            }
          },
        }
      : {}),
    dispose: hasTypeScript
      ? async () => {
          disposed = true
          if (pendingTyped?.size) await Promise.allSettled([...pendingTyped])
          await broker.dispose()
        }
      : broker.dispose,
  }
}
