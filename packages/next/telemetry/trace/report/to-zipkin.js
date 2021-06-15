'use strict'

exports.__esModule = true
exports.default = void 0

var _crypto = require('crypto')

var _nodeFetch = _interopRequireDefault(require('node-fetch'))

function _interopRequireDefault(obj) {
  return obj && obj.__esModule
    ? obj
    : {
        default: obj,
      }
}

let traceId = process.env.TRACE_ID

if (!traceId) {
  traceId = process.env.TRACE_ID = (0, _crypto.randomBytes)(8).toString('hex')
}

const localEndpoint = {
  serviceName: 'zipkin-query',
  ipv4: '127.0.0.1',
  port: 9411,
}
const zipkinUrl = `http://${localEndpoint.ipv4}:${localEndpoint.port}/api/v2/spans`

const reportToLocalHost = (name, duration, timestamp, id, parentId, attrs) => {
  const body = [
    {
      traceId,
      parentId,
      name,
      id,
      timestamp,
      duration,
      localEndpoint,
      tags: attrs,
    },
  ] // We intentionally do not block on I/O here.
  ;(0, _nodeFetch.default)(zipkinUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => {})
}

var _default = reportToLocalHost
exports.default = _default
//# sourceMappingURL=to-zipkin.js.map
