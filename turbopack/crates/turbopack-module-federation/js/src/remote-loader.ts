/**
 * Loads a remote entry script and asks its global container for one exposed module.
 *
 * ```js
 * await loadRemoteModule(
 *   'catalog',
 *   'https://cdn.example.com/remoteEntry.js',
 *   './Button'
 * )
 * ```
 *
 * Loading happens in three deliberate phases: select a working script/container, initialize its
 * share scope, then call `get()` and the returned module factory. Only the first phase tries a
 * configured fallback, so an error inside an exposed module is surfaced instead of hidden.
 */
import { getCurrentRemoteGetScope } from './remote-scope'
import { moduleFederationRuntimeState } from './runtime-state'
import {
  getShareScope,
  initializeSharing,
  isSafeModuleFederationContainerName,
  isSafeModuleFederationPropertyName,
  type ShareScope,
} from './share-runtime'

export interface ParsedRemote {
  name: string
  url: string
  shareScope: string
}

export interface RemoteContainer {
  init(
    shareScope: ShareScope,
    initScope?: unknown[]
  ): unknown | Promise<unknown>
  get(request: string, getScope?: unknown): Promise<() => unknown>
}

export interface LoadedRemoteContainer {
  container: RemoteContainer
  remote: ParsedRemote
}

export interface RemoteScriptLoadOptions {
  timeoutMs?: number
  crossOrigin?: string
  nonce?: string
}

const globalObject = globalThis as unknown as Record<string, unknown>
// These caches come from the symbol-backed runtime state, so separately bundled host and remote
// runtimes still deduplicate the same script URL and container.
const scriptCache = moduleFederationRuntimeState.scriptLoads
const scriptElements = moduleFederationRuntimeState.scriptElements
const remoteCache = moduleFederationRuntimeState.remoteContainers as Map<
  string,
  Promise<RemoteContainer>
>

export const REMOTE_SCRIPT_LOAD_TIMEOUT_MS = 120_000
export const REMOTE_SCRIPT_RETRY_BASE_DELAY_MS = 200
export const REMOTE_SCRIPT_RETRY_MAX_JITTER_MS = 400

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

class InvalidRemoteContainerError extends Error {}
class RetryableRemoteScriptLoadError extends Error {}

function isRemoteContainer(value: unknown): value is RemoteContainer {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return false
  }
  const container = value as Partial<RemoteContainer>
  return (
    typeof container.get === 'function' && typeof container.init === 'function'
  )
}

function validContainerName(name: string): boolean {
  return isSafeModuleFederationContainerName(name)
}

function validShareScopeName(name: string): boolean {
  return isSafeModuleFederationPropertyName(name)
}

function validRemoteUrl(url: string): boolean {
  const value = url.trim()
  if (!value || /[\r\n\0\\]/.test(url)) return false
  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value)
  const scheme = schemeMatch?.[1]?.toLowerCase()
  return !scheme || scheme === 'http' || scheme === 'https'
}

export function parseRemoteSyntax(remote: string): {
  name: string
  url: string
} {
  // Split at the first `@` so the URL may still contain credentials or query values with `@`.
  const separator = remote.indexOf('@')
  if (separator <= 0) {
    throw new Error(`Invalid remote "${remote}". Expected "containerName@url".`)
  }

  const name = remote.slice(0, separator).trim()
  const url = remote.slice(separator + 1).trim()
  if (!validContainerName(name)) {
    throw new Error(`Invalid remote container name "${name}"`)
  }
  if (!validRemoteUrl(url)) {
    throw new Error(`Invalid remote URL "${url}"`)
  }
  return { name, url }
}

export function parseRemoteConfig(
  remoteKey: string,
  config:
    | string
    | string[]
    | { external: string | string[]; shareScope?: string },
  defaultShareScope: string = 'default'
): ParsedRemote[] {
  const external =
    typeof config === 'object' && !Array.isArray(config)
      ? config.external
      : config
  const shareScope =
    typeof config === 'object' && !Array.isArray(config)
      ? config.shareScope || defaultShareScope
      : defaultShareScope

  if (!validShareScopeName(shareScope)) {
    throw new Error(`Invalid remote share scope "${shareScope}"`)
  }

  const entries = Array.isArray(external) ? external : [external]
  return entries.map((entry) => {
    if (entry.includes('@')) {
      return { ...parseRemoteSyntax(entry), shareScope }
    }
    if (!validContainerName(remoteKey) || !validRemoteUrl(entry)) {
      throw new Error(`Invalid remote configuration for "${remoteKey}"`)
    }
    return { name: remoteKey, url: entry.trim(), shareScope }
  })
}

function evictScript(url: string): void {
  scriptCache.delete(url)
  const script = scriptElements.get(url)
  if (!script) return

  script.onload = null
  script.onerror = null
  script.remove()
  scriptElements.delete(url)
}

export function loadScript(
  url: string,
  options: RemoteScriptLoadOptions = {}
): Promise<void> {
  if (!validRemoteUrl(url)) {
    return Promise.reject(new Error(`Invalid remote URL "${url}"`))
  }

  const cached = scriptCache.get(url)
  if (cached) return cached

  const promise = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error(`Cannot load remote script "${url}" outside a browser`))
      return
    }

    // A classic script is required because Webpack's `var` library type installs its container on
    // the global object as a side effect of evaluating remoteEntry.js.
    const script = document.createElement('script')
    script.src = url
    script.async = true
    if (options.crossOrigin) script.crossOrigin = options.crossOrigin
    if (options.nonce) script.nonce = options.nonce
    scriptElements.set(url, script)

    const timeoutMs = options.timeoutMs ?? REMOTE_SCRIPT_LOAD_TIMEOUT_MS
    const timeout = setTimeout(() => {
      evictScript(url)
      reject(
        new RetryableRemoteScriptLoadError(
          `Loading remote entry script "${url}" timed out after ${timeoutMs}ms`
        )
      )
    }, timeoutMs)

    script.onload = () => {
      clearTimeout(timeout)
      script.onload = null
      script.onerror = null
      resolve()
    }
    script.onerror = () => {
      clearTimeout(timeout)
      evictScript(url)
      reject(
        new RetryableRemoteScriptLoadError(
          `Failed to load remote entry script "${url}"`
        )
      )
    }
    ;(document.head || document.body).appendChild(script)
  })

  scriptCache.set(url, promise)
  void promise.catch(() => evictScript(url))
  return promise
}

function readGlobalContainer(name: string): RemoteContainer | undefined {
  if (!hasOwn(globalObject, name)) return undefined

  const container = globalObject[name]
  if (!isRemoteContainer(container)) {
    throw new InvalidRemoteContainerError(
      `The global "${name}" exists but is not a Module Federation container`
    )
  }
  return container
}

export async function loadRemoteContainer(
  name: string,
  url: string,
  options?: RemoteScriptLoadOptions
): Promise<RemoteContainer> {
  if (!validContainerName(name)) {
    throw new Error(`Invalid remote container name "${name}"`)
  }

  // Webpack's script external resolves immediately when its global is already
  // installed. This also prevents duplicate evaluation across runtimes.
  const installed = readGlobalContainer(name)
  if (installed) return installed

  const cacheKey = `${name}@${url}`
  const cached = remoteCache.get(cacheKey)
  if (cached) return cached

  const promise = (async () => {
    await loadScript(url, options)
    const container = readGlobalContainer(name)
    if (!container) {
      evictScript(url)
      throw new Error(
        `Container "${name}" was not registered after loading "${url}"`
      )
    }
    return container
  })()

  remoteCache.set(cacheKey, promise)
  void promise.catch(() => remoteCache.delete(cacheKey))
  return promise
}

export async function loadRemoteContainerFromFallbacks(
  remotes: ParsedRemote[],
  options?: RemoteScriptLoadOptions
): Promise<LoadedRemoteContainer> {
  let lastError: unknown

  // Match Webpack's fallback external: only locating/loading the external
  // container falls through. init(), get(), and the exposed factory run after
  // a container is selected, so their application errors are never hidden.
  for (const remote of remotes) {
    try {
      let container: RemoteContainer
      try {
        container = await loadRemoteContainer(remote.name, remote.url, options)
      } catch (error) {
        if (!(error instanceof RetryableRemoteScriptLoadError)) throw error

        const jitter = Math.floor(
          Math.random() * (REMOTE_SCRIPT_RETRY_MAX_JITTER_MS + 1)
        )
        await new Promise<void>((resolve) => {
          setTimeout(resolve, REMOTE_SCRIPT_RETRY_BASE_DELAY_MS + jitter)
        })
        container = await loadRemoteContainer(remote.name, remote.url, options)
      }
      return {
        container,
        remote,
      }
    } catch (error) {
      // A truthy external has already been selected. Webpack surfaces its
      // protocol error instead of hiding it by trying a later external.
      if (error instanceof InvalidRemoteContainerError) throw error
      lastError = error
    }
  }

  if (lastError !== undefined) throw lastError
  throw new Error('Unable to load Module Federation remote')
}

export async function loadRemoteModuleFromContainer(
  container: RemoteContainer,
  expose: string,
  shareScopeName: string = 'default',
  initScope: unknown[] = [],
  getScope: unknown = getCurrentRemoteGetScope() || []
): Promise<unknown> {
  // Initialize sharing before `get`, then preserve Webpack's factory boundary: `get` returns the
  // factory and the consumer invokes it exactly once.
  initializeSharing(shareScopeName, initScope)
  const shareScope = getShareScope(shareScopeName)
  try {
    await container.init(shareScope, initScope)
  } catch (error) {
    // Webpack treats a selected external's sharing-init failure as a warning
    // and still asks it for the exposed module. It never tries a fallback.
    console.warn(`Initialization of sharing external failed: ${error}`)
  }

  const request = expose.startsWith('.') ? expose : `./${expose}`
  const factory = await container.get(request, getScope)
  return factory()
}

export async function loadRemoteModuleFromFallbacks(
  remotes: ParsedRemote[],
  expose: string,
  initScope: unknown[] = [],
  getScope: unknown = getCurrentRemoteGetScope() || [],
  options?: RemoteScriptLoadOptions
): Promise<unknown> {
  const { container, remote } = await loadRemoteContainerFromFallbacks(
    remotes,
    options
  )
  return loadRemoteModuleFromContainer(
    container,
    expose,
    remote.shareScope,
    initScope,
    getScope
  )
}

export async function loadRemoteModule(
  remoteName: string,
  remoteUrl: string,
  expose: string,
  shareScopeName: string = 'default'
): Promise<unknown> {
  return loadRemoteModuleFromFallbacks(
    [{ name: remoteName, url: remoteUrl, shareScope: shareScopeName }],
    expose
  )
}
