module.exports = function (source) {
  console.log(`WATCH_LOADER_PID=${process.pid}`)
  return `export default ${JSON.stringify(source.trim())}`
}
