// Each invocation performs RESOLVES getResolve() round-trips (worker -> Rust ->
// worker via ipc.sendRequest). With several files this produces thousands of napi
// Buffer/reference operations across worker-thread teardown — the conditions that
// triggered the custom_gc / ThreadsafeFunction use-after-free before the fix.
const RESOLVES = 500
module.exports = async function () {
  const callback = this.async()
  const resolve = this.getResolve({})
  let ok = 0
  for (let i = 0; i < RESOLVES; i++) {
    try {
      const r = await resolve(this.context, './meta.js')
      if (r) ok++
    } catch {}
  }
  callback(null, `export default ${ok}`)
}
