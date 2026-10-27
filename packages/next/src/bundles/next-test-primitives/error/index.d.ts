import type { processError as processPinnedError } from '@vitest/utils/error'
export { processError } from '@vitest/utils/error'
export declare function processTaskError(
  error: unknown,
  copies: ReadonlyMap<object, object>
): ReturnType<typeof processPinnedError>
