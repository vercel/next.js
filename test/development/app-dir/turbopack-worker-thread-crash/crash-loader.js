module.exports = function crashLoader(source) {
  const value = source.trim()

  // Kills the worker before the evaluation result is reported back.
  if (value === 'exit-during-eval') {
    process.exit(1)
  }

  // Lets the evaluation succeed, then kills the worker asynchronously.
  if (value === 'exit-after-eval') {
    setTimeout(() => process.exit(1), 250)
    return `export default "exit-after-eval"`
  }

  return `export default ${JSON.stringify(value)}`
}
