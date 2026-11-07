const {
  assertWorkerResultSerializable,
} = require('next/dist/build/webpack-build/assert-worker-result-serializable')

// Mirrors `workerMain` in `packages/next/src/build/webpack-build/impl.ts`,
// returning a result that jest-worker cannot send over IPC.
exports.unserializable = async function unserializable() {
  const result = { value: BigInt(1) }
  assertWorkerResultSerializable(result, 'server')
  return result
}
