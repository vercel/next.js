async function all() {
  await import('./b1.js')
  await import('./b2.js')
  await import('./b3.js')
  await import('./b4.js')
  await import('./b5.js')
  await import('./b6.js')
  await import('./b7.js')
  await import('./b8.js')
  await import('./a.js')
}

export default all
