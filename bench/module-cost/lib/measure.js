export async function measure(name, fn) {
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

  const result = { name, loadDuration, executeDuration, files }

  return result
}

export function format(result) {
  return `${result.name}: Load duration: ${result.loadDuration.toFixed(2)}ms, Execution duration: ${result.executeDuration.toFixed(2)}ms, Files: ${result.files}`
}
