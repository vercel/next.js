import Server from './'
import { renderToHTML, renderErrorToHTML, doPageRender, doDocRender } from './render'

module.exports = exports = (opts) => {
  return new Server(opts)
}

exports.renderToHTML = renderToHTML
exports.renderErrorToHTML = renderErrorToHTML
exports.doPageRender = doPageRender
exports.doDocRender = doDocRender
