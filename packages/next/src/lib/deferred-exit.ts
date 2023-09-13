let finalExitCode: number | undefined
let exitPromise: Promise<void> | undefined

/**
 * Schedules the process to exit at the end of the current task. This allows
 * other exit handlers to run, when a direct call to `process.exit()` would
 * otherwise immediately exit the process, preventing them from running.
 *
 * @param exitCode The exit code to pass to `process.exit(exitCode)`. Note
 * that this may not be the actual exit code if this function is called
 * elsewhere with a non-zero code.
 */
export default function deferredExit(exitCode: number | undefined) {
  if (finalExitCode === undefined || finalExitCode === 0) {
    finalExitCode = exitCode
  }

  if (!exitPromise) {
    exitPromise = Promise.resolve().then(() => process.exit(finalExitCode))
  }
}
