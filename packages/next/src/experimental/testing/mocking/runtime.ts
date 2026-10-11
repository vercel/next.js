import { MockRegistry } from './registry'

type RegisterArguments = Parameters<MockRegistry['register']>

interface FileMockState {
  registry: MockRegistry
  onLateFailure?: (error: Error) => void
}

let active: FileMockState | undefined

/** Installed from the emitted entry, never from the host worker's module copy. */
export function initializeModuleMocking(
  options: { onLateFailure?: (error: Error) => void } = {}
): { dispose(): void } {
  if (active) {
    throw new Error('A module mock file context is already active.')
  }
  const state: FileMockState = {
    registry: new MockRegistry(),
    onLateFailure: options.onLateFailure,
  }
  active = state
  return {
    dispose() {
      state.registry.dispose()
      if (active === state) active = undefined
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
  current().registry.register(...args)
}

/**
 * Awaited by an async compiler-generated replacement module. Every required
 * export is checked before any consuming subject is allowed to evaluate.
 * This does not resolve specifiers or replace an evaluated module namespace.
 */
export async function resolveModuleMock(
  targetKey: string,
  requiredExports: readonly string[]
): Promise<Record<string, unknown>> {
  const state = current()
  try {
    const exports = await state.registry.resolve(targetKey)
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
