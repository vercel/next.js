import { validateMockCoverageSources } from './mock-sources'
import { createHash } from 'crypto'
import { readFile, realpath } from 'fs/promises'
import { isAbsolute, posix, relative, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import { decodeCoverageMap } from './maps'
import type { CoverageArtifactMetadata, MockCoverageSources } from './types'

export function coverageHash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

export function within(root: string, file: string): boolean {
  const rel = relative(root, file)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

export async function readArtifactFile(
  root: string,
  file: string
): Promise<Buffer> {
  if (isAbsolute(file) || !within(root, resolve(root, file))) {
    throw new Error(`Coverage artifact path escapes its lease: ${file}`)
  }
  const canonicalRoot = await realpath(root)
  const canonical = await realpath(resolve(root, file))
  if (!within(canonicalRoot, canonical)) {
    throw new Error(`Coverage artifact symlink escapes its lease: ${file}`)
  }
  return readFile(canonical)
}

/** Called by the compiler before publishing its immutable artifact. */
export async function buildCoverageMetadata(options: {
  rootDir: string
  files: readonly string[]
  projectDir: string
  /** Native [project] filesystem root, which can contain the application. */
  sourceRootDir: string
  entryFile: string
  /** Compile-only source analysis includes its exact selected entry. */
  includeEntrySource?: boolean
  setupFiles: readonly string[]
  syntheticSources?: MockCoverageSources
  /** Actual production Browser assets name maps by their own content hash. */
  browserSourceMapReferences?: true
}): Promise<CoverageArtifactMetadata> {
  if (options.syntheticSources)
    validateMockCoverageSources(options.syntheticSources)
  const declaredSynthetic = new Map(
    options.syntheticSources?.sources.map((source) => [
      source.source,
      source.sha256,
    ])
  )
  const syntheticSources: Record<string, { sha256: string }> =
    Object.create(null)
  const project = await realpath(options.projectDir)
  const projectAliases = [project, resolve(options.projectDir)]
  const sourceRoot = await realpath(options.sourceRootDir)
  const excluded = new Set(
    await Promise.all(
      [
        ...(options.includeEntrySource ? [] : [options.entryFile]),
        ...options.setupFiles,
      ].map((file) => realpath(file))
    )
  )
  const sources: CoverageArtifactMetadata['sources'] = Object.create(null)
  const scripts: CoverageArtifactMetadata['scripts'] = []
  const files = new Set(options.files)
  for (const path of options.files) {
    if (!/\.(?:c|m)?js$/.test(path)) continue
    const scriptBytes = await readArtifactFile(options.rootDir, path)
    const script: CoverageArtifactMetadata['scripts'][number] = {
      path,
      sha256: coverageHash(scriptBytes),
    }
    let mapPath = `${path}.map`
    if (options.browserSourceMapReferences) {
      const footer = scriptBytes
        .toString('utf8')
        .match(/(?:^|\n)(?:[\t ]*\/\/[^\r\n]*(?:\r?\n|$))+\s*$/)?.[0]
      const reference = footer
        ? [
            ...footer.matchAll(
              /^[\t ]*\/\/[#@]\s*sourceMappingURL=(\S+)[\t ]*\r?$/gm
            ),
          ].at(-1)?.[1]
        : undefined
      if (reference) {
        mapPath = posix.normalize(posix.join(posix.dirname(path), reference))
        if (
          reference.startsWith('/') ||
          reference.includes('\\') ||
          /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(reference) ||
          /[?#]/.test(reference) ||
          !mapPath.endsWith('.js.map') ||
          !files.has(mapPath)
        )
          throw new Error(
            `Browser coverage source map escaped its output closure: ${reference}`
          )
      }
    }
    if (files.has(mapPath)) {
      const bytes = await readArtifactFile(options.rootDir, mapPath)
      script.mapPath = mapPath
      script.mapSha256 = coverageHash(bytes)
      const decoded = decodeCoverageMap(JSON.parse(bytes.toString('utf8')))
      for (const [identity, content] of decoded.sources) {
        let file: string | undefined
        if (identity.startsWith('turbopack:///[project]/')) {
          file = resolve(
            sourceRoot,
            identity.slice('turbopack:///[project]/'.length)
          )
          if (!within(sourceRoot, file))
            throw new Error(
              `Coverage source escapes compiler root: ${identity}`
            )
        } else if (identity.startsWith('file://')) {
          file = fileURLToPath(identity)
        } else if (isAbsolute(identity)) {
          file = identity
        } else if (
          !identity.startsWith('turbopack:///[next]/') &&
          !identity.startsWith('turbopack:///[turbopack]/')
        ) {
          // Unknown identities cannot silently disappear from the denominator.
          throw new Error(`Unsupported coverage source identity: ${identity}`)
        }
        let source: CoverageArtifactMetadata['sources'][string] = null
        if (declaredSynthetic.has(identity)) {
          const sha256 = declaredSynthetic.get(identity)!
          if (
            !file ||
            !projectAliases.some((root) => within(root, file!)) ||
            file.split(sep).includes('node_modules') ||
            typeof content !== 'string' ||
            coverageHash(content) !== sha256
          )
            throw new Error(
              `Native generated coverage source mismatch: ${identity}`
            )
          // Only exact compiler-issued proxy bytes may disappear from the
          // original-source denominator. The emitted script/map remain hashed.
          syntheticSources[identity] = { sha256 }
        } else if (
          file &&
          projectAliases.some((root) => within(root, file!)) &&
          !file.split(sep).includes('node_modules') &&
          /\.[cm]?[jt]sx?$/.test(file) &&
          !/\.d\.[cm]?ts$/.test(file)
        ) {
          const canonical = await realpath(file)
          if (!within(project, canonical))
            throw new Error(`Coverage source escapes project: ${identity}`)
          if (
            !canonical.split(sep).includes('node_modules') &&
            !excluded.has(canonical) &&
            !/\.(test|spec)\.[cm]?[jt]sx?$/.test(canonical)
          ) {
            if (
              typeof content !== 'string' ||
              coverageHash(await readFile(canonical)) !== coverageHash(content)
            ) {
              throw new Error(`Coverage source content mismatch: ${identity}`)
            }
            source = { file: canonical, sha256: coverageHash(content) }
          }
        }
        if (
          Object.hasOwn(sources, identity) &&
          JSON.stringify(sources[identity]) !== JSON.stringify(source)
        ) {
          throw new Error(`Conflicting coverage source identity: ${identity}`)
        }
        sources[identity] = source
      }
    }
    scripts.push(script)
  }
  return {
    version: 1,
    scripts,
    sources,
    ...(options.syntheticSources ? { syntheticSources } : {}),
  }
}
