const fs = require('fs')

const traceFile = process.env.NEXT_TEST_SYNC_IO_TRACE_FILE

if (traceFile) {
  const record = (stream, chunk) => {
    const value = chunk instanceof Buffer ? chunk.toString() : String(chunk)

    if (
      !value.includes('[sync-io-trace]') &&
      !value.includes('unstable value `Date.now()`') &&
      !value.includes('Export encountered') &&
      !value.includes('Error occurred prerendering') &&
      !value.includes('build worker exited') &&
      !value.includes('Failed to build')
    ) {
      return
    }

    try {
      fs.appendFileSync(
        traceFile,
        `${JSON.stringify({
          stream,
          pid: process.pid,
          ppid: process.ppid,
          isNextWorker: process.env.IS_NEXT_WORKER,
          timestamp: process.hrtime.bigint().toString(),
          value,
        })}\n`
      )
    } catch {}
  }

  for (const [name, stream] of [
    ['stdout', process.stdout],
    ['stderr', process.stderr],
  ]) {
    const write = stream.write
    stream.write = function (chunk, encoding, callback) {
      record(name, chunk)
      return write.call(this, chunk, encoding, callback)
    }
  }
}
