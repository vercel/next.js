export function register() {
  // We need to make sure that we import these files only in Node.js environment.
  // OpenTelemetry is **not** supported on Edge or Client side at the moment.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    require('./instrumentation-node')
  }
}
