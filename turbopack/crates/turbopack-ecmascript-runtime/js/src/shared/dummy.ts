/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * This file acts as a dummy implementor for the interface that
 * `runtime-utils.ts` expects to be available in the global scope.
 *
 * This interface will be implemented by runtimes.
 */

declare function getOrInstantiateModuleFromParent<M>(
  id: ModuleId,
  sourceModule: M
): M;
