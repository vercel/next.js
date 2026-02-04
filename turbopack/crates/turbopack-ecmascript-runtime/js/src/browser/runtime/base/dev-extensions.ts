/// <reference path="../../../shared/runtime-utils.ts" />

/**
 * Extensions to the shared runtime types that are specific to the development
 * runtime (e.g. `module.hot`).
 */

declare const enum HotUpdateStatus {
  idle = 'idle',
}

type HotUpdateStatusHandler = (status: HotUpdateStatus) => void

interface HotData {
  prevExports?: Exports
}

// Used through reference comments
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface HotState {
  selfAccepted: boolean | Function
  selfDeclined: boolean
  selfInvalidated: boolean
  disposeHandlers: ((data: object) => void)[]
}

type AcceptErrorHandler = (
  err: Error,
  context: { moduleId: ModuleId; dependencyId: string | number }
) => void
type AcceptCallback = (outdatedDependencies: string[]) => void

interface AcceptFunction {
  // accept updates for self
  (errorHandler?: AcceptErrorHandler): void

  // accept updates for the given modules
  (
    modules?: string | string[],
    callback?: AcceptCallback,
    errorHandler?: AcceptErrorHandler
  ): void
}

interface Hot {
  active: boolean
  data: HotData

  accept: AcceptFunction

  decline: (module?: string | string[]) => void

  dispose: (callback: (data: HotData) => void) => void

  addDisposeHandler: (callback: (data: object) => void) => void

  removeDisposeHandler: (callback: (data: object) => void) => void

  invalidate: () => void

  status: () => keyof typeof HotUpdateStatus
  addStatusHandler: (handler: HotUpdateStatusHandler) => void
  removeStatusHandler: (handler: HotUpdateStatusHandler) => void
  check: (autoApply: boolean) => Promise<any[] | null>
}

// Used through reference comments
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface HotModule extends ModuleWithDirection {
  // In development, ModuleId is always a string
  id: string
  hot: Hot
}
