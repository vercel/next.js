import Server from './'
import { doPageRender, doDocRender, serializeError } from './render'
import { build, watch } from './build/babel'

module.exports = exports = (opts) => {
  return new Server(opts)
}

exports.doDocRender = doDocRender
exports.doPageRender = doPageRender
exports.serializeError = serializeError

exports.build = build
exports.watch = watch
