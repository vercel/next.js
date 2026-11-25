// Should not error
import 'server-only'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('instrumentation hook on the edge')
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('instrumentation hook on nodejs')
  } else {
    await require('this should fail')
  }
  await new Promise((resolve) => setTimeout(resolve, 1000))
  globalThis.instrumentationFinished = true
}
