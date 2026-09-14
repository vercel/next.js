module.exports = function crashLoader() {
  process.stderr.write('TURBOPACK_CRASH_LOADER_STDERR_MARKER\n')
  process.exit(7)
}
