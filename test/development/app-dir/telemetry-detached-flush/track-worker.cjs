// Let .env supply the opt-out instead of overriding it with an empty shell value.
if (process.env.NEXT_TELEMETRY_DISABLED === '') {
  delete process.env.NEXT_TELEMETRY_DISABLED
}

if (process.argv.some((arg) => arg.endsWith('detached-flush.js'))) {
  require('fs').writeFileSync('flush-worker-started', '')
}
