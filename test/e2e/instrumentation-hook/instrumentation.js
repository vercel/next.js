export function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('instrumentation hook on the edge')
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('instrumentation hook')
  } else {
    require('this should fail')
  }
}
