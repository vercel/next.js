// jest-worker's child sends results as `[PARENT_MESSAGE_OK, result]`, which
// `process.send` serializes as JSON.
const PARENT_MESSAGE_OK = 0

/**
 * The webpack build worker sends its result to the main process as JSON over
 * IPC. If the message can't be serialized (e.g. it exceeds the maximum string
 * length), the worker's IPC send fails outside of the method call and the
 * main process waits for a result forever. Checking up front turns this into
 * a rejected worker call, so the build fails with an actionable error.
 */
export function assertWorkerResultSerializable(
  result: unknown,
  compilerName: string
): void {
  try {
    JSON.stringify([PARENT_MESSAGE_OK, result])
  } catch (err) {
    throw new Error(
      `The webpack build worker result for the "${compilerName}" compiler could not be sent to the main process: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err }
    )
  }
}
