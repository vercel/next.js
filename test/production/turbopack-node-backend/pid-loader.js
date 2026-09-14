module.exports = function loader() {
  return `module.exports = ${JSON.stringify({ loaderPid: String(process.pid) })}`
}
