export async function register() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (process.env.NEXT_RUNTIME === 'edge') {
    globalThis.instrumentationFinished = 'edge'
    console.log('instrumentation hook on the edge')
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    globalThis.instrumentationFinished = 'nodejs'
    console.log('instrumentation hook on nodejs')
  } else {
    await require('this should fail')
  }
}
