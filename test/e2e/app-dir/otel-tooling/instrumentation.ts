if (process.env.NEXT_RUNTIME === 'nodejs') {
  console.log(
    `[tooling-otel]${JSON.stringify({
      kind: 'instrumentation-load',
      pid: process.pid,
      phase: process.env.NEXT_PHASE,
    })}`
  )
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await (await import('./instrumentation-node')).register()
  }
}
