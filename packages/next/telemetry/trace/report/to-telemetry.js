'use strict'

exports.__esModule = true
exports.default = void 0

var _shared = require('../shared')

const TRACE_EVENT_WHITELIST = new Map(
  Object.entries({
    'webpack-invalidated': 'WEBPACK_INVALIDATED',
  })
)

const reportToTelemetry = (spanName, duration) => {
  const eventName = TRACE_EVENT_WHITELIST.get(spanName)

  if (!eventName) {
    return
  }

  const telemetry = _shared.traceGlobals.get('telemetry')

  if (!telemetry) {
    return
  }

  telemetry.record({
    eventName,
    payload: {
      durationInMicroseconds: duration,
    },
  })
}

var _default = reportToTelemetry
exports.default = _default
//# sourceMappingURL=to-telemetry.js.map
