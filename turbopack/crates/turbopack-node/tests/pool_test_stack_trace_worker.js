// A worker that prints a stack trace to stderr while it loads, before the
// ready signal, wrapped in the output markers the runtime's console uses.
// Used to test that startup output of a pre-warmed process is handled.
process.stderr.write('TURBOPACK_OUTPUT_B\n')
process.stderr.write(new Error('logged while loading').stack + '\n')
process.stderr.write('TURBOPACK_OUTPUT_E\n')

require('./pool_test_worker.js')
