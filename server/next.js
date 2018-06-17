import Server from './'
import { renderToHTML, renderErrorToHTML } from './render'

module.exports = exports = (opts) => {
  return new Server(opts)
}

exports.renderToHTML = renderToHTML
exports.renderErrorToHTML = renderErrorToHTML
