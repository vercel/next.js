const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('instrumentation hook on the edge')
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('instrumentation hook on nodejs')
    await sleep(1000)
    globalThis.instrumentationFinished = true
  } else {
    await require('this should fail')
  }
}
