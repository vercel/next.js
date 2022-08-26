'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.reporter = void 0
var _async_to_generator =
  require('@swc/helpers/lib/_async_to_generator.js').default
var _interop_require_default =
  require('@swc/helpers/lib/_interop_require_default.js').default
var _toTelemetry = _interop_require_default(require('./to-telemetry'))
var _toJson = _interop_require_default(require('./to-json'))
class MultiReporter {
  flushAll() {
    var _this = this
    return _async_to_generator(function* () {
      yield Promise.all(
        _this.reporters.map((reporter1) => reporter1.flushAll())
      )
    })()
  }
  report(spanName, duration, timestamp, id, parentId, attrs, startTime) {
    this.reporters.forEach((reporter2) =>
      reporter2.report(
        spanName,
        duration,
        timestamp,
        id,
        parentId,
        attrs,
        startTime
      )
    )
  }
  constructor(reporters) {
    this.reporters = []
    this.reporters = reporters
  }
}
const reporter = new MultiReporter([_toJson.default, _toTelemetry.default])
exports.reporter = reporter

//# sourceMappingURL=index.js.map
