export function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('instrumentation hook on the edge')
  } else {
    console.log('instrumentation hook')
  }
}
