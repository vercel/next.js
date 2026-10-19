import { MockRegistry, type RegistrationInputOwner } from './registry'
import {
  createFreshModuleMocking,
  type BrowserMockOriginalLoader,
  type FileAutomockMaterializer,
} from './fresh-module'

type RegisterArguments = Parameters<MockRegistry['register']>

interface FileMockState {
  registry: MockRegistry
  fresh: ReturnType<typeof createFreshModuleMocking>
  importedMocks: Map<string, Record<string, unknown>>
  onLateFailure?: (error: Error) => void
}

let active: FileMockState | undefined

/** Installed from the emitted entry, never from the host worker's module copy. */
export function initializeModuleMocking(
  options: {
    onLateFailure?: (error: Error) => void
    registrationInput?: () => RegistrationInputOwner | undefined
    captureAutomock?: () => FileAutomockMaterializer
  } = {}
): { dispose(): void } {
  if (active) {
    throw new Error('A module mock file context is already active.')
  }
  const state: FileMockState = {
    registry: new MockRegistry(options.registrationInput),
    fresh: createFreshModuleMocking(
      options.captureAutomock,
      options.onLateFailure
    ),
    importedMocks: new Map(),
    onLateFailure: options.onLateFailure,
  }
  active = state
  return {
    dispose() {
      try {
        state.registry.dispose()
      } finally {
        state.importedMocks.clear()
        try {
          state.fresh.dispose()
        } finally {
          if (active === state) active = undefined
        }
      }
    },
  }
}

function current(): FileMockState {
  if (!active) {
    throw new Error(
      'Module mocking requires an initialized Next-compiled test file.'
    )
  }
  return active
}

/** Compiler-only call. The key and original edge come from Next resolution. */
export function registerModuleMock(...args: RegisterArguments): void {
  const state = current()
  state.registry.register(...args)
  state.importedMocks.delete(args[0])
}

/**
 * Awaited by an async compiler-generated replacement module. Every required
 * export is checked before any consuming subject is allowed to evaluate.
 * This does not resolve specifiers or replace an evaluated module namespace.
 */
export async function resolveModuleMock(
  targetKey: string,
  requiredExports: readonly string[],
  deferredOriginal?: () => Promise<Record<string, unknown>>
): Promise<Record<string, unknown>> {
  const state = current()
  try {
    const exports = await state.registry.resolve(targetKey, deferredOriginal)
    if (active !== state) {
      throw new Error('The module mock file context has been disposed.')
    }
    for (const name of requiredExports) {
      if (!Object.prototype.hasOwnProperty.call(exports, name)) {
        throw new Error(
          `Module mock ${targetKey} does not define export ${JSON.stringify(name)}.`
        )
      }
    }
    return exports
  } catch (error) {
    // A pending factory belongs to the file that started it even if a later
    // file has already initialized a new registry in this module realm.
    if (active !== state) {
      state.onLateFailure?.(
        error instanceof Error ? error : new Error(String(error))
      )
    }
    throw error
  }
}

/** Compiler-only vi.importMock with a resolved original/factory selection. */
export async function importModuleMock(
  target: string | (() => Promise<Record<string, unknown>>),
  transform?: (module: Record<string, unknown>) => Record<string, unknown>
): Promise<Record<string, unknown>> {
  const state = current()
  if (typeof target !== 'string') {
    try {
      const exports = await target()
      if (active !== state) {
        throw new Error('The module mock file context has been disposed.')
      }
      return transform ? transform(exports) : exports
    } catch (error) {
      if (active !== state) {
        state.onLateFailure?.(
          error instanceof Error ? error : new Error(String(error))
        )
      }
      throw error
    }
  }
  const previous = state.importedMocks.get(target)
  if (previous) return previous
  const exports = await resolveModuleMock(target, [])
  if (active !== state) {
    throw new Error('The module mock file context has been disposed.')
  }
  // Preserve factory values and cache a factory namespace independently from
  // the consuming ESM wrapper, including the usual missing-export diagnostic.
  const ignored = new Set<PropertyKey>([
    '__esModule',
    Symbol.asyncIterator,
    Symbol.hasInstance,
    Symbol.isConcatSpreadable,
    Symbol.iterator,
    Symbol.match,
    Symbol.matchAll,
    Symbol.replace,
    Symbol.search,
    Symbol.split,
    Symbol.species,
    Symbol.toPrimitive,
    Symbol.toStringTag,
    Symbol.unscopables,
  ])
  const namespace = new Proxy(exports, {
    get(moduleExports, key) {
      const value = Reflect.get(moduleExports, key)
      if (key !== 'then' && !(key in moduleExports) && !ignored.has(key)) {
        throw new Error(
          `Module mock ${target} does not define export ${JSON.stringify(String(key))}.`
        )
      }
      return value
    },
  })
  state.importedMocks.set(target, namespace)
  return namespace
}

/** Browser-only compiler call with a stable native original-loader adapter. */
export function importFreshModuleMock(
  loadOriginal: BrowserMockOriginalLoader,
  options?: { spy?: boolean }
): Promise<Record<string, unknown>> {
  return current().fresh.importMock(loadOriginal, options)
}
