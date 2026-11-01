export function isStableBuild() {
  const nextVersion = process.env.__NEXT_VERSION
  return (
    !nextVersion?.includes('canary') &&
    // Commit preview tarballs (e.g. `16.4.0-preview-84cee7e6-20260917`, see
    // scripts/set-preview-version.js) are built from arbitrary canary commits,
    // so they are not stable. Numbered preview releases published to npm
    // (e.g. `16.3.0-preview.10`) are stable.
    !nextVersion?.includes('-preview-') &&
    !process.env.__NEXT_TEST_MODE &&
    !process.env.NEXT_PRIVATE_LOCAL_DEV
  )
}

export class CanaryOnlyConfigError extends Error {
  constructor(arg: { feature: string } | string) {
    if (typeof arg === 'object' && 'feature' in arg) {
      super(
        `The experimental feature "${arg.feature}" can only be enabled when using the latest canary version of Next.js.`
      )
    } else {
      super(arg)
    }

    // This error is meant to interrupt the server start/build process
    // but the stack trace isn't meaningful, as it points to internal code.
    this.stack = undefined
  }
}
