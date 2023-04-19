export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('instrumentation hook on the edge')
    const { register } = await import('./instrumentation.edge')
    await register()
  } else if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('instrumentation hook on nodejs')
  } else {
    require('this should fail')
  }
}
