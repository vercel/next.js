'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.getAnonymousMeta = getAnonymousMeta
var _interop_require_default =
  require('@swc/helpers/lib/_interop_require_default.js').default
var _interop_require_wildcard =
  require('@swc/helpers/lib/_interop_require_wildcard.js').default
var _isDocker = _interop_require_default(
  require('next/dist/compiled/is-docker')
)
var _isWsl = _interop_require_default(require('next/dist/compiled/is-wsl'))
var _os = _interop_require_default(require('os'))
var ciEnvironment = _interop_require_wildcard(require('./ci-info'))
let traits
function getAnonymousMeta() {
  if (traits) {
    return traits
  }
  const cpus = _os.default.cpus() || []
  const { NOW_REGION } = process.env
  traits = {
    // Software information
    systemPlatform: _os.default.platform(),
    systemRelease: _os.default.release(),
    systemArchitecture: _os.default.arch(),
    // Machine information
    cpuCount: cpus.length,
    cpuModel: cpus.length ? cpus[0].model : null,
    cpuSpeed: cpus.length ? cpus[0].speed : null,
    memoryInMb: Math.trunc(_os.default.totalmem() / Math.pow(1024, 2)),
    // Environment information
    isDocker: (0, _isDocker).default(),
    isNowDev: NOW_REGION === 'dev1',
    isWsl: _isWsl.default,
    isCI: ciEnvironment.isCI,
    ciName: (ciEnvironment.isCI && ciEnvironment.name) || null,
    nextVersion: '12.2.6-canary.5',
  }
  return traits
}

if (
  (typeof exports.default === 'function' ||
    (typeof exports.default === 'object' && exports.default !== null)) &&
  typeof exports.default.__esModule === 'undefined'
) {
  Object.defineProperty(exports.default, '__esModule', { value: true })
  Object.assign(exports.default, exports)
  module.exports = exports.default
}

//# sourceMappingURL=anonymous-meta.js.map
