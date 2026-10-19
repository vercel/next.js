import { createHash } from 'crypto'
import { lstat, readFile, realpath } from 'fs/promises'
import { isAbsolute, relative, resolve, sep } from 'path'
import type { CompiledTestArtifact, ExecuteTestOptions } from '../contracts'

function hash(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}

function inside(root: string, file: string) {
  const name = relative(root, file)
  return name !== '..' && !name.startsWith(`..${sep}`) && !isAbsolute(name)
}

/** Validate regular components as well as the final bytes; aliases cannot retarget. */
async function regularFile(root: string, name: string) {
  if (!name || isAbsolute(name))
    throw new Error('Invalid production mock output path')
  const file = resolve(root, name)
  if (!inside(root, file))
    throw new Error('Production mock output escapes its immutable root')
  const parts = relative(root, file).split(sep)
  let current = root
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part)
    const stat = await lstat(current)
    if (
      stat.isSymbolicLink() ||
      (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())
    )
      throw new Error('Production mocks require regular retained files')
  }
  return readFile(file)
}

/** This capability is issued by a native static plan, never an execution option. */
export function assertProductionStaticMockProfile(
  artifact: CompiledTestArtifact,
  options: Pick<
    ExecuteTestOptions,
    | 'entry'
    | 'setupFiles'
    | 'snapshotSerializers'
    | 'coverage'
    | 'customCoverage'
    | 'collectOnly'
    | 'inspect'
  >
): void {
  const certificate = artifact.moduleMocking?.productionStaticFactory
  if (!certificate) {
    if (artifact.moduleMocking && artifact.profile.mode === 'production')
      throw new Error(
        'Production static mocks require native ownership metadata'
      )
    return
  }
  if (
    certificate.version !== 1 ||
    artifact.moduleMocking?.version !== 1 ||
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.mode !== 'production' ||
    artifact.profile.route !== undefined ||
    artifact.moduleMocking.coverage ||
    artifact.moduleCache ||
    artifact.dynamicModuleMocking ||
    artifact.cohort ||
    options.setupFiles.length ||
    options.snapshotSerializers?.length ||
    options.entry.executionEnvironment ||
    options.entry.inSource ||
    options.coverage ||
    options.customCoverage ||
    options.collectOnly ||
    options.inspect
  )
    throw new Error('Unsupported production static factory mock profile')
}

/** Retain the source, native certificate and complete actual output closure. */
export async function captureProductionStaticMockClosure(
  artifact: CompiledTestArtifact,
  options: Parameters<typeof assertProductionStaticMockProfile>[1] & {
    projectDir: string
  }
): Promise<(() => Promise<void>) | undefined> {
  assertProductionStaticMockProfile(artifact, options)
  const certificate = artifact.moduleMocking?.productionStaticFactory
  if (!certificate) return
  if (
    !Array.isArray(certificate.outputs) ||
    certificate.outputs.length !== artifact.files.length ||
    new Set(artifact.files).size !== artifact.files.length ||
    certificate.outputs.some(
      (output, index) =>
        output.path !== artifact.files[index] ||
        !/^[a-f0-9]{64}$/.test(output.sha256)
    ) ||
    !artifact.files.includes(certificate.metadata.path) ||
    !artifact.files.includes(certificate.sourceMetadata.path) ||
    certificate.metadata.path === certificate.sourceMetadata.path ||
    !/^[a-f0-9]{64}$/.test(certificate.metadata.sha256) ||
    !/^[a-f0-9]{64}$/.test(certificate.sourceMetadata.sha256) ||
    typeof artifact.sourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(artifact.sourceHash)
  )
    throw new Error('Invalid production mock ownership certificate')
  const root = await realpath(artifact.rootDir)
  const project = await realpath(options.projectDir)
  const source = resolve(options.entry.file)
  const sourceName = relative(resolve(options.projectDir), source)
  if (
    !isAbsolute(options.entry.file) ||
    !inside(resolve(options.projectDir), source) ||
    !sourceName
  )
    throw new Error('Production mock source escapes its project')
  const outputs = structuredClone(certificate.outputs)
  const metadata = structuredClone(certificate.metadata)
  const sourceMetadata = structuredClone(certificate.sourceMetadata)
  const sourceHash = artifact.sourceHash
  const verify = async () => {
    if (
      (await realpath(artifact.rootDir)) !== root ||
      (await realpath(options.projectDir)) !== project ||
      (await realpath(source)) !== resolve(project, sourceName) ||
      hash(await regularFile(project, sourceName)) !== sourceHash
    )
      throw new Error(
        'Production mock original source changed after compilation'
      )
    const bytes = new Map<string, Buffer>()
    for (const output of outputs) {
      const content = await regularFile(root, output.path)
      if (hash(content) !== output.sha256)
        throw new Error(
          'Production mock emitted file changed after compilation'
        )
      bytes.set(output.path, content)
    }
    const nativeBytes = bytes.get(metadata.path)!
    const sourceBytes = bytes.get(sourceMetadata.path)!
    if (
      hash(nativeBytes) !== metadata.sha256 ||
      hash(sourceBytes) !== sourceMetadata.sha256
    )
      throw new Error('Production mock native ownership metadata changed')
    const native = JSON.parse(nativeBytes.toString('utf8'))
    const nativeSource = JSON.parse(sourceBytes.toString('utf8'))
    if (
      native.moduleMocking?.version !== 1 ||
      native.moduleMocking.productionStaticFactory !== 1 ||
      native.moduleMocking.coverage !== undefined ||
      native.moduleMocking.cjsNamedSpy !== undefined ||
      native.moduleCache !== undefined ||
      native.dynamicModuleMocking !== undefined ||
      nativeSource.version !== 1 ||
      nativeSource.sha256 !== sourceHash
    )
      throw new Error('Invalid native production static factory certificate')
  }
  await verify()
  return verify
}
