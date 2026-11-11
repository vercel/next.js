import { readFile, lstat, realpath } from 'fs/promises'
import { join, relative, isAbsolute } from 'path'
import loadJsConfig from '../../../build/load-jsconfig'
import { getLoaderSWCOptions } from '../../../build/swc/options'
import { getBabelConfigFile } from '../../../build/get-babel-config-file'
import { coverageHash, within } from '../coverage/artifact'
import { assertConfigurationImportFiles } from './config-import-facts'
import { lookupOriginalConfigurationObservation } from './original-config-observation'
import type { loadTestCompilerConfig } from './watch-options'
import type { IstanbulTypeScriptOptionsGetter } from '../coverage/istanbul-types'
import type { TestProfile } from '../contracts'

type Loaded = Awaited<ReturnType<typeof loadTestCompilerConfig>>

/** Options from the real Session; neither a second config load nor a loader shim. */
export function createIstanbulTypeScriptOptionsGetter(
  loaded: Loaded,
  distDir: string,
  encryptionKey: string,
  mode: TestProfile['mode']
): { getOptions: IstanbulTypeScriptOptionsGetter; close(): void } {
  if (!['development', 'production'].includes(mode))
    throw new Error('Typed Istanbul requires its actual Session mode.')
  if (!lookupOriginalConfigurationObservation(loaded))
    throw new Error(
      'Typed Istanbul requires the actual loaded Next configuration.'
    )
  const { dir, config, configurationImports } = loaded
  if (typeof encryptionKey !== 'string' || !encryptionKey)
    throw new Error(
      'Typed Istanbul requires its actual project compiler context.'
    )
  let closed = false
  let jsConfig: ReturnType<typeof loadJsConfig> | undefined
  let options: Map<string, Promise<Record<string, unknown>>> | undefined
  async function assertInputs(signal: AbortSignal) {
    signal.throwIfAborted()
    if (closed) throw new Error('Typed Istanbul compiler options are closed.')
    if (
      (config.typescript.tsconfigPath !== undefined &&
        config.typescript.tsconfigPath !== 'tsconfig.json') ||
      getBabelConfigFile(dir)
    )
      throw new Error(
        'Typed Istanbul requires default options without Babel or TypeScript configuration.'
      )
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      try {
        await lstat(join(dir, name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      throw new Error(
        'Configured TypeScript Istanbul subjects are not implemented.'
      )
    }
    await assertConfigurationImportFiles(
      await configurationImports,
      config.configFile ?? null,
      signal
    )
    if (closed) throw new Error('Typed Istanbul compiler options are closed.')
  }
  return {
    async getOptions(source, signal) {
      await assertInputs(signal)
      if (
        !isAbsolute(source.file) ||
        !within(dir, source.file) ||
        !/\.(?:ts|mts|[jt]sx)$/.test(source.file) ||
        /\.d\.(?:ts|mts|tsx)$/.test(source.file) ||
        (await realpath(source.file)) !== source.file ||
        coverageHash(await readFile(source.file)) !== source.sha256
      )
        throw new Error(
          'Typed Istanbul compiler source changed or escaped its Session.'
        )
      options ??= new Map()
      let result = options.get(source.file)
      if (!result) {
        result = (async () => {
          const actual = await (jsConfig ??= loadJsConfig(dir, config))
          if (actual.useTypeScript || actual.jsConfig || actual.jsConfigPath)
            throw new Error(
              'Configured TypeScript Istanbul subjects are not implemented.'
            )
          const swcOptions = getLoaderSWCOptions({
            filename: source.file,
            development: mode === 'development',
            isServer: true,
            isPageFile: false,
            hasReactRefresh: false,
            configDir: dir,
            modularizeImports: config.modularizeImports,
            optimizePackageImports: config.experimental.optimizePackageImports,
            swcPlugins: config.experimental.swcPlugins,
            swcEnvOptions: config.experimental.swcEnvOptions,
            compilerOptions: config.compiler,
            optimizeServerReact: config.experimental.optimizeServerReact,
            jsConfig: actual.jsConfig,
            supportedBrowsers: undefined,
            swcCacheDir: join(distDir, 'cache/swc'),
            relativeFilePathFromRoot: relative(dir, source.file),
            serverComponents: false,
            serverReferenceHashSalt: encryptionKey,
            cacheHandlers: config.cacheHandlers,
            useCacheEnabled: config.experimental.useCache,
            taintEnabled: config.experimental.taint,
            trackDynamicImports: false,
            pageExtensions: config.pageExtensions,
          })
          const programmatic = {
            ...swcOptions,
            filename: source.file,
            sourceMaps: true,
            inlineSourcesContent: true,
            sourceFileName: source.file,
          }
          if (
            programmatic.jsc?.transform?.react &&
            !Object.hasOwn(programmatic.jsc.transform.react, 'development')
          )
            programmatic.jsc.transform.react.development =
              mode === 'development'
          await assertInputs(signal)
          if (coverageHash(await readFile(source.file)) !== source.sha256)
            throw new Error(
              'Typed Istanbul source changed while preparing compiler options.'
            )
          return programmatic as Record<string, unknown>
        })()
        options.set(source.file, result)
      }
      const value = await result
      await assertInputs(signal)
      return structuredClone(value)
    },
    close() {
      closed = true
      options?.clear()
    },
  }
}
