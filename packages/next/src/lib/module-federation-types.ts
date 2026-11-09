import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import semver from 'next/dist/compiled/semver'
import type { TurbopackModuleFederationOptions } from '../server/config-shared'
import * as Log from '../build/output/log'

type DtsPlugin = {
  normalizeGenerateTypesOptions(options: {
    context: string
    outputDir: string
    dtsOptions: {
      generateTypes: {
        tsConfigPath: string
        abortOnError: true
        extractThirdParty?: boolean
        extractRemoteTypes?: boolean
        compileInChildProcess: false
      }
      consumeTypes: false
    }
    pluginOptions: {
      name: string
      filename: string
      exposes: Record<string, unknown>
      shared: Record<string, unknown>
    }
  }): unknown
  generateTypesAPI(options: { dtsManagerOptions: unknown }): Promise<unknown>
}

const ZIP = '@mf-types.zip'
const API = '@mf-types.d.ts'

/** Reject ZIP members that could escape the extraction root on any supported platform. */
export function validateFederationTypesArchive(archive: Buffer): void {
  const start = Math.max(0, archive.length - 22 - 0xffff)
  let end = -1
  for (let offset = archive.length - 22; offset >= start; offset--) {
    if (
      archive.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + archive.readUInt16LE(offset + 20) === archive.length
    ) {
      end = offset
      break
    }
  }
  if (end < 0)
    throw new Error(
      'Module Federation DTS generator emitted an invalid ZIP archive'
    )

  const count = archive.readUInt16LE(end + 10)
  const size = archive.readUInt32LE(end + 12)
  let offset = archive.readUInt32LE(end + 16)
  if (
    !count ||
    count === 0xffff ||
    offset === 0xffffffff ||
    offset + size > end
  ) {
    throw new Error(
      'Module Federation DTS generator emitted an invalid ZIP directory'
    )
  }
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(
        'Module Federation DTS generator emitted an invalid ZIP entry'
      )
    }
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const next = offset + 46 + nameLength + extraLength + commentLength
    if (next > end)
      throw new Error('Module Federation DTS ZIP entry exceeds its directory')
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength)
    const segments = name.split('/')
    if (
      !name ||
      name.startsWith('/') ||
      /[\\:\0]/.test(name) ||
      segments.some(
        (part, partIndex) =>
          part === '..' ||
          part === '.' ||
          (part === '' && partIndex !== segments.length - 1)
      )
    ) {
      throw new Error(
        `Module Federation DTS ZIP contains an unsafe entry: ${name}`
      )
    }
    offset = next
  }
}

function toRecord<T>(
  entries: Record<string, T> | Array<string | Record<string, T>>
): Record<string, T | string> {
  if (!Array.isArray(entries)) return entries
  return Object.assign(
    {},
    ...entries.map((entry) =>
      typeof entry === 'string' ? { [entry]: entry } : entry
    )
  )
}

function loadGenerator(projectDir: string): DtsPlugin {
  const fromProject = createRequire(path.join(projectDir, 'package.json'))
  let packageJson: { version: string }
  try {
    packageJson = fromProject('@module-federation/dts-plugin/package.json')
  } catch {
    throw new Error(
      'Module Federation DTS generation requires @module-federation/dts-plugin@^2.9.0. Install it in the producing app.'
    )
  }
  if (!semver.satisfies(packageJson.version, '^2.9.0')) {
    throw new Error(
      `Module Federation DTS generation requires @module-federation/dts-plugin@^2.9.0; found ${packageJson.version}.`
    )
  }
  return fromProject('@module-federation/dts-plugin') as DtsPlugin
}

async function resolveTsConfig(projectDir: string, configPath: string) {
  // The schema validates lexical traversal; realpath also rejects symlink escapes.
  const root = await fs.realpath(projectDir)
  let config: string
  try {
    config = await fs.realpath(path.join(root, configPath))
  } catch (error) {
    throw new Error(
      `Module Federation dts.generateTypes.tsConfigPath '${configPath}' could not be read: ${error}`
    )
  }
  const relative = path.relative(root, config)
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      'Module Federation dts.generateTypes.tsConfigPath must remain inside the project'
    )
  }
  return configPath
}

type GenerationContext = {
  projectDir: string
  distDir: string
  federation: TurbopackModuleFederationOptions | undefined
}

async function generateTypes({
  projectDir,
  distDir,
  federation,
}: GenerationContext) {
  if (!federation?.dts) return

  const options = federation.dts.generateTypes
  const generation = options === true ? {} : options
  const name = federation.name
  if (!name || !federation.exposes) {
    throw new Error(
      'Module Federation DTS generation requires a named producer with exposes'
    )
  }

  const staging = path.join(distDir, 'cache', 'module-federation-types')
  const staticDir = path.join(distDir, 'static')
  const manifestPath = path.join(staticDir, 'mf-manifest.json')
  const zipPath = path.join(staticDir, ZIP)
  const apiPath = path.join(staticDir, API)
  const updateManifest = async (publish: boolean) => {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    if (publish) {
      manifest.metaData.types = {
        path: '',
        name: '@mf-types',
        zip: ZIP,
        api: API,
      }
    } else {
      delete manifest.metaData.types
    }
    const temp = `${manifestPath}.${process.pid}.tmp`
    try {
      await fs.writeFile(temp, JSON.stringify(manifest, null, 2))
      await fs.rename(temp, manifestPath)
    } finally {
      await fs.rm(temp, { force: true })
    }
  }

  // Unadvertise the previous pair before removing it so consumers cannot see
  // metadata pointing at files from a previous successful generation.
  await updateManifest(false)
  await Promise.all([
    fs.rm(zipPath, { force: true }),
    fs.rm(apiPath, { force: true }),
  ])
  await fs.rm(staging, { recursive: true, force: true })
  await fs.mkdir(staging, { recursive: true })
  // Missing peers and invalid config always fail, even with abortOnError: false.
  const plugin = loadGenerator(projectDir)
  const tsConfigPath = await resolveTsConfig(
    projectDir,
    generation.tsConfigPath ?? './tsconfig.json'
  )
  try {
    const dtsManagerOptions = plugin.normalizeGenerateTypesOptions({
      context: projectDir,
      outputDir: staging,
      dtsOptions: {
        generateTypes: {
          tsConfigPath,
          // The upstream lenient mode silently leaves partial files after a failure.
          // Interpret the public abortOnError option here instead.
          abortOnError: true,
          extractThirdParty: generation.extractThirdParty,
          extractRemoteTypes: generation.extractRemoteTypes,
          compileInChildProcess: false,
        },
        consumeTypes: false,
      },
      pluginOptions: {
        name,
        filename: federation.filename ?? `${name}.js`,
        exposes: toRecord(federation.exposes),
        shared: federation.shared ? toRecord(federation.shared) : {},
      },
    })
    await plugin.generateTypesAPI({ dtsManagerOptions })
    for (const filename of [ZIP, API]) {
      if (!(await fs.stat(path.join(staging, filename))).size) {
        throw new Error(
          `Module Federation DTS generator emitted an empty ${filename}`
        )
      }
    }
    validateFederationTypesArchive(await fs.readFile(path.join(staging, ZIP)))
    await fs.rename(path.join(staging, ZIP), zipPath)
    await fs.rename(path.join(staging, API), apiPath)
    await updateManifest(true)
  } catch (error) {
    await Promise.all([
      fs.rm(zipPath, { force: true }),
      fs.rm(apiPath, { force: true }),
    ])
    await updateManifest(false)
    if (generation.abortOnError !== false) throw error
    Log.warn(
      `Module Federation type generation failed; omitting types: ${error}`
    )
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
}

const pendingByOutput = new Map<string, Promise<void>>()

/** Publish a complete upstream type pair, or no types at all. Serialize writes per project. */
export function writeModuleFederationTypes(
  context: GenerationContext
): Promise<void> {
  if (!context.federation?.dts) return Promise.resolve()
  const previous = pendingByOutput.get(context.distDir) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(() => generateTypes(context))
  pendingByOutput.set(context.distDir, current)
  const cleanup = () => {
    if (pendingByOutput.get(context.distDir) === current) {
      pendingByOutput.delete(context.distDir)
    }
  }
  // A previous failed generation must not prevent a later source edit from fixing it.
  current.then(cleanup, cleanup)
  return current
}
