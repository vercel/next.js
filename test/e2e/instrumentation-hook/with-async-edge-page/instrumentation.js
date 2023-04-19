const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('instrumentation hook on the edge')
    await sleep(1000)
    globalThis.instrumentationFinished = true
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('instrumentation hook on nodejs')
  } else {
    require('this should fail')
  }
}
