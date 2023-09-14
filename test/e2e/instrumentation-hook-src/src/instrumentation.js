export function register(nextServer) {
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('instrumentation hook on the edge')
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log(`instrumentation hook ${nextServer.constructor.name}`)
  } else {
    require('this should fail')
  }
}
