// Loaded into the server process via NODE_OPTIONS=--require. Reports the status
// code visible on the 'finish' event - the value APM tracers and access logs
// record - which is not observable from outside the process.
const http = require('http')

const originalEmit = http.ServerResponse.prototype.emit
http.ServerResponse.prototype.emit = function (event) {
  if (event === 'finish' && this.req && this.req.url === '/') {
    process.stdout.write(`PROBE_FINISH_STATUS=${this.statusCode}\n`)
  }
  return originalEmit.apply(this, arguments)
}
