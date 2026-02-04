async function start() {
  const { dep2 } = await import('./dep2.js')
  return dep2
}

start()

export const dep1 = 'dep1'
