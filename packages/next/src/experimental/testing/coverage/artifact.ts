import { createHash } from 'crypto'
import { readFile, realpath } from 'fs/promises'
import { isAbsolute, relative, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import { decodeCoverageMap } from './maps'
import type { CoverageArtifactMetadata } from './types'

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
  setupFiles: readonly string[]
}): Promise<CoverageArtifactMetadata> {
  const project = await realpath(options.projectDir)
  const projectAliases = [project, resolve(options.projectDir)]
  const sourceRoot = await realpath(options.sourceRootDir)
  const excluded = new Set(
    await Promise.all(
      [options.entryFile, ...options.setupFiles].map((file) => realpath(file))
    )
  )
  const sources: CoverageArtifactMetadata['sources'] = Object.create(null)
  const scripts: CoverageArtifactMetadata['scripts'] = []
  const files = new Set(options.files)
  for (const path of options.files) {
    if (!/\.(?:c|m)?js$/.test(path)) continue
    const script: CoverageArtifactMetadata['scripts'][number] = {
      path,
      sha256: coverageHash(await readArtifactFile(options.rootDir, path)),
    }
    const mapPath = `${path}.map`
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
        if (
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
  return { version: 1, scripts, sources }
}
