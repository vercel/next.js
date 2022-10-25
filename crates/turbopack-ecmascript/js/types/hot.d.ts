import { Exports, ModuleId } from "./index";

export const enum HotUpdateStatus {
  idle = "idle",
}

export interface HotData {
  prevExports?: Exports;
}

export interface HotState {
  selfAccepted: boolean | Function;
  selfDeclined: boolean;
  selfInvalidated: boolean;
  disposeHandlers: ((data: object) => void)[];
}

export type AcceptErrorHandler = (
  err: Error,
  context: { moduleId: ModuleId; dependencyId: string | number }
) => void;
export type AcceptCallback = (outdatedDependencies: string[]) => void;

export interface AcceptFunction {
  // accept updates for self
  (errorHandler?: AcceptErrorHandler): void;

  // accept updates for the given modules
  (
    modules?: string | string[],
    callback?: AcceptCallback,
    errorHandler?: AcceptErrorHandler
  ): void;
}

export interface Hot {
  active: boolean;
  data: HotData;

  status: () => keyof typeof HotUpdateStatus;

  accept: AcceptFunction;

  decline: (module?: string | string[]) => void;

  dispose: (callback: (data: HotData) => void) => void;

  addDisposeHandler: (callback: (data: object) => void) => void;

  removeDisposeHandler: (callback: (data: object) => void) => void;

  invalidate: () => void;
}
