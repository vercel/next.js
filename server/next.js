import Server from './'
import { renderToHTML, renderErrorToHTML, doPageRender, doDocRender } from './render'
import { build, watch } from './build/babel'

module.exports = exports = (opts) => {
  return new Server(opts)
}

exports.renderToHTML = renderToHTML
exports.renderErrorToHTML = renderErrorToHTML
exports.doDocRender = doDocRender
exports.doPageRender = doPageRender

exports.build = build
exports.watch = watch
