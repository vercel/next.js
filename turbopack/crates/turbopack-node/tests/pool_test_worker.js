// Minimal Node.js worker that implements the turbopack-node pool wire protocol.
// Used by pool.rs integration tests.
//
// Wire protocol:
//   - Messages are framed as [u32 BE length][payload bytes]
//   - The ready signal is a 0-length message
//   - After each TCP send, write "TURBOPACK_OUTPUT_D\n" to both stdout and stderr
//     to signal the Rust side that console output for this operation is done.

const net = require('node:net')

const port = parseInt(process.argv[2], 10)

const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
  socket.setNoDelay(true)
  // Send empty ready signal (0-length message).
  const readyBuf = Buffer.alloc(4)
  readyBuf.writeUInt32BE(0, 0)
  socket.write(readyBuf)
  signalOutputDone()
})

// When the socket closes, exit cleanly.
socket.once('close', () => {
  process.exit(0)
})

function signalOutputDone() {
  process.stdout.write('TURBOPACK_OUTPUT_D\n')
  process.stderr.write('TURBOPACK_OUTPUT_D\n')
}

function sendMessage(obj) {
  const json = JSON.stringify(obj)
  const payload = Buffer.from(json, 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32BE(payload.length, 0)
  socket.write(Buffer.concat([header, payload]))
  signalOutputDone()
}

// --- Receive loop ---
// Read framed messages: 4-byte BE length prefix, then payload.
let recvBuf = Buffer.alloc(0)

socket.on('data', (chunk) => {
  recvBuf = Buffer.concat([recvBuf, chunk])
  drainMessages()
})

function drainMessages() {
  while (true) {
    if (recvBuf.length < 4) return
    const len = recvBuf.readUInt32BE(0)
    if (recvBuf.length < 4 + len) return
    const payload = recvBuf.subarray(4, 4 + len)
    recvBuf = recvBuf.subarray(4 + len)
    handleMessage(JSON.parse(payload.toString('utf8')))
  }
}

function handleMessage(msg) {
  // Echo the message back along with this worker's PID so tests can verify
  // whether the same process was reused across operations.
  sendMessage({ echo: msg, pid: process.pid })
}
