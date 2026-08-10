function logError() {
  const depth4 = new Error('Depth 4 error')
  const depth3 = new Error('Depth 3 error', { cause: depth4 })
  const depth2 = new Error('Depth 2 error', { cause: depth3 })
  const depth1 = new Error('Depth 1 error', { cause: depth2 })
  const depth0 = new Error('rsc-error-log-nested', { cause: depth1 })
  console.error(depth0)
}

export default function Page() {
  logError()
  return null
}
