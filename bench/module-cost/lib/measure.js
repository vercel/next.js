export async function measure(fn) {
  let module
  let loadDuration
  {
    const start = performance.now()
    module = await fn()
    const end = performance.now()
    loadDuration = end - start
  }

  let files
  let executeDuration
  {
    const execute = module.execute
    const start = performance.now()
    files = execute()
    const end = performance.now()
    executeDuration = end - start
  }

  return { loadDuration, executeDuration, files }
}

export function format(result) {
  return `Load duration: ${result.loadDuration.toFixed(2)}ms, Execution duration: ${result.executeDuration.toFixed(2)}ms, Files: ${result.files}`
}
