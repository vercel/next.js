export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[TEST] deferred-entries instrumentation register (nodejs)')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('[TEST] deferred-entries instrumentation register (edge)')
  }
}
