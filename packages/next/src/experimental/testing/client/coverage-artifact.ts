import { lstat, readFile, realpath } from 'node:fs/promises'
import {
  buildCoverageMetadata,
  coverageHash,
  readArtifactFile,
} from '../coverage/artifact'
import type { CoverageArtifactMetadata } from '../coverage/types'
import type { CompiledBrowserClientTestArtifact } from '../contracts'
import { assertClientPath } from '../compiler/client'
import { createClientAssetReader } from './assets'

type Certificate = NonNullable<CoverageArtifactMetadata['browser']>
function certificatePath(entryPath: string) {
  if (!/^server\/next-test\/[a-f0-9]{64}\.client\.json$/.test(entryPath))
    throw new Error('Invalid native browser coverage descriptor identity.')
  return entryPath.replace(/\.client\.json$/, '.browser-coverage.json')
}
async function readCertificate(
  rootDir: string,
  entryPath: string,
  files: readonly string[]
): Promise<Certificate> {
  const sidecarPath = certificatePath(entryPath)
  if (!files.includes(sidecarPath))
    throw new Error('Missing native browser coverage certificates.')
  const bytes = await readArtifactFile(rootDir, sidecarPath)
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid native browser coverage certificate.')
  const {
    version,
    scripts,
    mode,
    sourceMaps,
    preserveOriginalSyntax,
    importInitializers,
    developmentImports,
    ...unknownCertificate
  } = value as Record<string, unknown>
  if (
    !(
      (version === 1 &&
        mode === undefined &&
        sourceMaps === undefined &&
        preserveOriginalSyntax === undefined &&
        importInitializers === undefined) ||
      (version === 2 &&
        mode === 'production' &&
        sourceMaps === 'absolute-file-uri' &&
        preserveOriginalSyntax === true &&
        developmentImports === undefined)
    ) ||
    !Array.isArray(scripts) ||
    Object.keys(unknownCertificate).length
  )
    throw new Error('Invalid native browser coverage certificate.')
  const importSections = importInitializers ?? developmentImports
  if (
    developmentImports !== undefined &&
    (version !== 1 ||
      !developmentImports ||
      typeof developmentImports !== 'object' ||
      Array.isArray(developmentImports) ||
      Object.keys(developmentImports).length !== 3 ||
      (developmentImports as any).version !== 1 ||
      (developmentImports as any).mode !== 'development' ||
      !Object.hasOwn(developmentImports, 'sectionsByScript'))
  )
    throw new Error('Invalid native development Browser import sections.')
  if (importSections !== undefined) {
    if (
      !importSections ||
      typeof importSections !== 'object' ||
      Array.isArray(importSections) ||
      Object.keys(importSections).length !==
        (developmentImports === undefined ? 2 : 3) ||
      (importSections as any).version !== 1 ||
      !Object.hasOwn(importSections, 'sectionsByScript')
    )
      throw new Error('Invalid native Browser import coverage sections.')
    const sections = (importSections as any).sectionsByScript
    if (
      !sections ||
      typeof sections !== 'object' ||
      Array.isArray(sections) ||
      Object.keys(sections).length === 0
    )
      throw new Error(
        'Empty or invalid native Browser import coverage sections.'
      )
    for (const [path, values] of Object.entries(sections)) {
      assertClientPath(path)
      if (
        !path.endsWith('.js') ||
        !files.includes(path) ||
        !Array.isArray(values) ||
        !values.length
      )
        throw new Error('Native Browser import sections escaped their output.')
    }
  }
  const generatedScripts: Certificate['generatedScripts'] = Object.create(null)
  for (const script of scripts) {
    if (!script || typeof script !== 'object' || Array.isArray(script))
      throw new Error('Invalid native browser coverage script.')
    const { path, sha256, role, ...unknown } = script as Record<string, unknown>
    assertClientPath(path)
    if (
      Object.keys(unknown).length ||
      !path.endsWith('.js') ||
      !files.includes(path) ||
      typeof sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(sha256) ||
      role !== 'native-ecmascript-bookkeeping' ||
      Object.hasOwn(generatedScripts, path) ||
      coverageHash(await readArtifactFile(rootDir, path)) !== sha256
    )
      throw new Error(
        'Invalid or changed native browser coverage script identity.'
      )
    generatedScripts[path] = { sha256, role }
  }
  return {
    ...(version === 1
      ? {
          version: 1 as const,
          ...(developmentImports === undefined
            ? {}
            : {
                developmentImports: {
                  version: 1 as const,
                  mode: 'development' as const,
                },
              }),
        }
      : {
          version: 2 as const,
          mode: 'production' as const,
          sourceMaps: 'absolute-file-uri' as const,
          preserveOriginalSyntax: true as const,
          ...(importInitializers === undefined
            ? {}
            : { importInitializers: { version: 1 as const } }),
        }),
    nativeMetadata: { path: sidecarPath, sha256: coverageHash(bytes) },
    generatedScripts,
  }
}

/** The native concrete-type certificate is separate from user source mappings. */
export async function buildBrowserCoverageMetadata(
  options: Parameters<typeof buildCoverageMetadata>[0] & { entryPath: string }
): Promise<CoverageArtifactMetadata> {
  const browser = await readCertificate(
    options.rootDir,
    options.entryPath,
    options.files
  )
  const metadata = await buildCoverageMetadata({
    ...options,
    browserSourceMapReferences:
      browser.version === 2 || browser.developmentImports ? true : undefined,
  })
  for (const [path, source] of Object.entries(browser.generatedScripts))
    if (
      !metadata.scripts.some(
        (script) => script.path === path && script.sha256 === source.sha256
      )
    )
      throw new Error(
        'Native browser certificate escaped the coverage output closure.'
      )
  return { ...metadata, browser }
}

/** Revalidate original bytes and all outputs at collection and publication boundaries. */
export async function assertBrowserCoverageArtifact(
  artifact: CompiledBrowserClientTestArtifact
) {
  if (
    artifact.kind !== 'browser' ||
    artifact.version !== 2 ||
    artifact.profile.browserClient !== true ||
    artifact.profile.environment !== 'browser' ||
    artifact.coverage?.version !== 1 ||
    artifact.coverage.sourcePreservation ||
    !(
      (artifact.profile.mode === 'development' &&
        artifact.coverage.browser?.version === 1) ||
      (artifact.profile.mode === 'production' &&
        artifact.coverage.browser?.version === 2)
    )
  )
    throw new Error(
      'Browser V8 coverage requires its actual mode-certified client artifact.'
    )
  const reader = await createClientAssetReader(artifact)
  const actual = await readCertificate(
    artifact.rootDir,
    artifact.entryPath,
    artifact.files
  )
  if (JSON.stringify(actual) !== JSON.stringify(artifact.coverage.browser))
    throw new Error('Browser coverage certificate changed after compilation.')
  for (const source of Object.values(artifact.coverage.sources)) {
    if (!source) continue
    if (
      (await realpath(source.file)) !== source.file ||
      !(await lstat(source.file)).isFile() ||
      coverageHash(await readFile(source.file)) !== source.sha256
    )
      throw new Error(
        'Browser coverage original source changed after compilation.'
      )
  }
  await reader.verify()
}
