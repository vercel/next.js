import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { getTypeScriptConfigurationCli } from './runTypeScriptCli'

const TYPE_CHECK_RESULT_VERSION = 1

type TypeCheckResultFile = {
  version: typeof TYPE_CHECK_RESULT_VERSION
  typescriptVersion: string
  tsconfigPath: string
  projectHash: string
  fileCount: number
}

function isTypeCheckResultFile(value: unknown): value is TypeCheckResultFile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const result = value as Record<string, unknown>
  return (
    result.version === TYPE_CHECK_RESULT_VERSION &&
    typeof result.typescriptVersion === 'string' &&
    typeof result.tsconfigPath === 'string' &&
    typeof result.projectHash === 'string' &&
    typeof result.fileCount === 'number'
  )
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

async function createProjectFingerprint({
  baseDir,
  tsConfigPath,
  tscPath,
  typescriptVersion,
}: {
  baseDir: string
  tsConfigPath: string
  tscPath: string
  typescriptVersion: string
}): Promise<Omit<TypeCheckResultFile, 'version'>> {
  const configuration = await getTypeScriptConfigurationCli({
    baseDir,
    tsConfigPath,
    tscPath,
  })
  if (!configuration.files) {
    throw new Error(
      `TypeScript did not report project files for ${path.relative(baseDir, tsConfigPath)}.`
    )
  }

  const files = configuration.files
    .map((file) => path.resolve(baseDir, file))
    .sort()
  const hash = createHash('sha256')
  hash.update(typescriptVersion)
  hash.update('\0')
  hash.update(stableJson(configuration.compilerOptions))

  for (const file of files) {
    hash.update('\0')
    hash.update(path.relative(baseDir, file))
    hash.update('\0')
    hash.update(await readFile(file))
  }

  return {
    typescriptVersion,
    tsconfigPath: path.relative(baseDir, tsConfigPath),
    projectHash: hash.digest('hex'),
    fileCount: files.length,
  }
}

export async function writeTypeCheckResult({
  baseDir,
  resultPath,
  tsConfigPath,
  tscPath,
  typescriptVersion,
}: {
  baseDir: string
  resultPath: string
  tsConfigPath: string
  tscPath: string
  typescriptVersion: string
}): Promise<void> {
  const result: TypeCheckResultFile = {
    version: TYPE_CHECK_RESULT_VERSION,
    ...(await createProjectFingerprint({
      baseDir,
      tsConfigPath,
      tscPath,
      typescriptVersion,
    })),
  }

  const absoluteResultPath = path.resolve(baseDir, resultPath)
  await mkdir(path.dirname(absoluteResultPath), { recursive: true })
  await writeFile(absoluteResultPath, `${JSON.stringify(result, null, 2)}\n`)
}

export async function validateTypeCheckResult({
  baseDir,
  resultPath,
  tsConfigPath,
  tscPath,
  typescriptVersion,
}: {
  baseDir: string
  resultPath: string
  tsConfigPath: string
  tscPath: string
  typescriptVersion: string
}): Promise<void> {
  let stored: unknown
  try {
    stored = JSON.parse(
      await readFile(path.resolve(baseDir, resultPath), 'utf8')
    )
  } catch (cause) {
    throw new Error(
      `Could not read the external TypeScript result at ${resultPath}. Run \`next typecheck --write-result ${resultPath}\` before building.`,
      { cause }
    )
  }

  if (!isTypeCheckResultFile(stored)) {
    throw new Error(
      `The external TypeScript result at ${resultPath} uses an unsupported format. Regenerate it with the current Next.js version.`
    )
  }

  const current = await createProjectFingerprint({
    baseDir,
    tsConfigPath,
    tscPath,
    typescriptVersion,
  })

  if (
    stored.typescriptVersion !== current.typescriptVersion ||
    stored.tsconfigPath !== current.tsconfigPath ||
    stored.projectHash !== current.projectHash ||
    stored.fileCount !== current.fileCount
  ) {
    throw new Error(
      `The external TypeScript result at ${resultPath} does not match the current project. Run \`next typecheck --write-result ${resultPath}\` again.`
    )
  }
}
