// Preloaded into every Node.js process of the build (via NODE_OPTIONS) to
// emulate an environment where binding/connecting to a local port is denied,
// e.g. a sandbox with no usable loopback interface.
//
// Binding/listening keeps working (that is what Turbopack's Rust side does),
// only outgoing connections to the loopback interface fail with ENETUNREACH,
// exactly like `connect(127.0.0.1)` inside a network namespace whose loopback
// device is down.
const net = require('node:net')

const originalConnect = net.Socket.prototype.connect

net.Socket.prototype.connect = function connect(...args) {
  let host
  if (typeof args[0] === 'object' && args[0] !== null) {
    host = args[0].host
  } else if (typeof args[1] === 'string') {
    host = args[1]
  }

  const isLocal =
    host === undefined ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1'

  if (!isLocal) {
    return originalConnect.apply(this, args)
  }

  process.nextTick(() => {
    const error = new Error(`connect ENETUNREACH ${host ?? '127.0.0.1'}`)
    error.code = 'ENETUNREACH'
    this.destroy(error)
  })

  return this
}
