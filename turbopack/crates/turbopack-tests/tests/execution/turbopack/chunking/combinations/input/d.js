export async function all() {
  await import('./a0.js')
  await import('./a5.js')
  await import('./b0.js')
  await import('./b5.js')
  await import('./c0.js')
  await import('./c5.js')
}
