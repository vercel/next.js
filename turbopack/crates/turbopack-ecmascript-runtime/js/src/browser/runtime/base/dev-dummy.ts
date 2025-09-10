/**
 * This file acts as a dummy implementor for the interface that
 * `runtime-base.ts` expects to be available in the global scope.
 *
 * This interface will be implemented by runtime backends.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

declare var DEV_BACKEND: DevRuntimeBackend
declare var _eval: (code: EcmascriptModuleEntry) => any
