export function Expensive() {
  const start = performance.now()
  let i = 99999

  const bigArray = []
  while (--i) {
    bigArray.push(i)
  }

  const endTime = performance.now()

  if (typeof window === 'undefined') {
    console.log('[WORKER] Completed expensive function in', endTime - start)
  } else {
    console.log('[WEB] Completed expensive function in', endTime - start)
  }
}
