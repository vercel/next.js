import {
  PreludeState,
  createDynamicTrackingState,
  createDynamicValidationState,
  throwIfDisallowedDynamic,
  throwIfSyncIOUsed,
} from './dynamic-rendering'
import {
  StaticGenBailoutError,
  isStaticGenBailoutError,
} from '../../client/components/static-generation-bailout'
import type { WorkStore } from './work-async-storage.external'

function catchThrown(fn: () => void): unknown {
  try {
    fn()
  } catch (err) {
    return err
  }
  throw new Error('expected the function to throw')
}

describe('dynamic-rendering bailout errors', () => {
  const workStore = { route: '/test' } as WorkStore

  let consoleErrorSpy: jest.SpyInstance
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('throwIfSyncIOUsed', () => {
    it('does not throw when no sync IO error was recorded', () => {
      const serverDynamic = createDynamicTrackingState(undefined)

      expect(() => throwIfSyncIOUsed(workStore, serverDynamic)).not.toThrow()
    })

    it('throws a StaticGenBailoutError carrying the recorded sync IO error', () => {
      const syncIOError = new Error(
        'Route "/test" used `Date.now()` before accessing uncached data.'
      )
      const serverDynamic = createDynamicTrackingState(undefined)
      serverDynamic.syncDynamicErrorWithStack = syncIOError

      const thrown = catchThrown(() =>
        throwIfSyncIOUsed(workStore, serverDynamic)
      )

      expect(isStaticGenBailoutError(thrown)).toBe(true)
      expect(thrown).toBeInstanceOf(StaticGenBailoutError)
      expect((thrown as Error).message).toBe(syncIOError.message)
      expect((thrown as Error).cause).toBe(syncIOError)
    })
  })

  describe('throwIfDisallowedDynamic', () => {
    it('throws a StaticGenBailoutError carrying the first disallowed dynamic error', () => {
      const firstError = new Error(
        'Route "/test" used a blocking API without a Suspense boundary above it.'
      )
      const secondError = new Error(
        'Route "/test" used another blocking API without a Suspense boundary above it.'
      )
      const dynamicValidation = createDynamicValidationState()
      dynamicValidation.dynamicErrors.push(firstError, secondError)

      const thrown = catchThrown(() =>
        throwIfDisallowedDynamic(
          workStore,
          PreludeState.Empty,
          dynamicValidation,
          createDynamicTrackingState(undefined),
          false
        )
      )

      expect(isStaticGenBailoutError(thrown)).toBe(true)
      expect((thrown as Error).message).toBe(firstError.message)
      expect((thrown as Error).cause).toBe(firstError)
    })

    it('throws a StaticGenBailoutError with a message when the shell is empty for an unknown reason', () => {
      const thrown = catchThrown(() =>
        throwIfDisallowedDynamic(
          workStore,
          PreludeState.Empty,
          createDynamicValidationState(),
          createDynamicTrackingState(undefined),
          false
        )
      )

      expect(isStaticGenBailoutError(thrown)).toBe(true)
      expect((thrown as Error).message).toContain(
        'did not produce a static shell'
      )
    })
  })
})
