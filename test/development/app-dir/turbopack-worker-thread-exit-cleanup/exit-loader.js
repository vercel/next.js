module.exports = function exitLoader(source) {
  const value = source.trim()
  if (value === 'exit') {
    // Kill this worker thread mid-evaluation. In worker_threads, process.exit
    // terminates only the current worker, which then emits 'exit' on the
    // parent's Worker object.
    process.exit(1)
  }

  return `export default ${JSON.stringify(value)}`
}
