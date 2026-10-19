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
  const { version, scripts, ...unknownCertificate } = value as Record<
    string,
    unknown
  >
  if (
    version !== 1 ||
    !Array.isArray(scripts) ||
    Object.keys(unknownCertificate).length
  )
    throw new Error('Invalid native browser coverage certificate.')
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
    version: 1,
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
  const metadata = await buildCoverageMetadata(options)
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
    artifact.profile.mode !== 'development' ||
    artifact.profile.environment !== 'browser' ||
    artifact.coverage?.version !== 1 ||
    artifact.coverage.browser?.version !== 1
  )
    throw new Error(
      'Browser V8 coverage requires an actual development client artifact.'
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
