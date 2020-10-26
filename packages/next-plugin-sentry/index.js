const { serverConfig, clientConfig } = require('./config.js')

const Sentry = require('@sentry/minimal')
// NOTE(kamiL): @sentry/minimal doesn't expose this method, as it's not env-agnostic, but we still want to test it here
Sentry.showReportDialog = (...args) => {
  Sentry._callOnClient('showReportDialog', ...args)
}

exports.Sentry = Sentry
exports.serverConfig = serverConfig
exports.clientConfig = clientConfig
