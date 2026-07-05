export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('instrumentation hook on the edge')
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('instrumentation hook on nodejs')
    const { register } = await import('./instrumentation.node')
    await register()
  } else {
    await require('this should fail')
  }
}
